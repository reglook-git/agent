import fs from 'fs/promises';
import path from 'path';
import { Task } from './types';
import { dockerClient } from './docker';
import { SourceFetcher } from './source-fetcher';
import { DockerfileGenerator } from './dockerfile-generator';
import { ArtifactHandler } from './artifact';
import { HealthChecker } from './healthcheck';
import { masterClient } from '../master-client';
import { config } from '../config';
import { logger } from '../logger';

export class TaskExecutor {
  private sourceFetcher = new SourceFetcher();
  private dockerfileGenerator = new DockerfileGenerator();
  private artifactHandler = new ArtifactHandler();
  private healthChecker = new HealthChecker();

  async executeBuildAndDeploy(task: Task): Promise<void> {
    const {
      deploymentId,
      hostname,
      source,
      buildSpec,
      runtime,
      healthcheck,
      envVars,
      artifactPut,
    } = task;

    logger.info({ deploymentId, hostname }, `Starting BUILD_AND_DEPLOY task`);

    const workdir = path.join(config.WORKDIR, deploymentId);
    const imageTag = `airnode/${this.sanitizeHostname(hostname)}:${deploymentId}`;
    const containerName = `airnode__${this.sanitizeHostname(hostname)}__${deploymentId}`;

    try {
      // 1. Create workdir
      await fs.mkdir(workdir, { recursive: true });
      await masterClient.sendLogs(deploymentId, [
        { level: 'info', message: 'Workdir created', ts: new Date() },
      ]);

      // 2. Fetch source
      await masterClient.sendLogs(deploymentId, [
        { level: 'info', message: 'Fetching source code...', ts: new Date() },
      ]);
      await this.sourceFetcher.fetchSource(source, workdir);
      await masterClient.sendLogs(deploymentId, [
        { level: 'info', message: 'Source fetched successfully', ts: new Date() },
      ]);

      // 3. Generate or use existing Dockerfile
      let dockerfilePath: string;
      if (await this.dockerfileGenerator.hasDockerfile(workdir)) {
        dockerfilePath = path.join(workdir, 'Dockerfile');
        logger.info({ deploymentId }, 'Using existing Dockerfile');
      } else {
        dockerfilePath = await this.dockerfileGenerator.generateDockerfile(workdir, buildSpec);
        logger.info({ deploymentId, dockerfilePath }, 'Generated Dockerfile');
      }

      // Ensure Dockerfile exists (fail fast)
      await fs.access(dockerfilePath);

      // 4. Build Docker image
      await masterClient.sendLogs(deploymentId, [
        { level: 'info', message: 'Building Docker image...', ts: new Date() },
      ]);
      await dockerClient.buildImage(workdir, imageTag, async (logLine) => {
        // Send build logs periodically to avoid spam
        if (logLine.includes('Step ') || logLine.includes('--->') || logLine.includes('Successfully')) {
          await masterClient.sendLogs(deploymentId, [
            { level: 'info', message: logLine, ts: new Date() },
          ]);
        }
      });
      await masterClient.sendLogs(deploymentId, [
        { level: 'info', message: 'Docker image built successfully', ts: new Date() },
      ]);

      // 5. Create artifact if requested (non-fatal)
      if (artifactPut) {
        await masterClient.sendLogs(deploymentId, [
          { level: 'info', message: 'Creating deployment artifact...', ts: new Date() },
        ]);

        try {
          const success = await this.artifactHandler.createAndUploadArtifact(workdir, artifactPut);

          if (!success) {
            logger.warn(
              { deploymentId, artifactPutPresent: true },
              'Artifact creation/upload failed, continuing with deployment'
            );
            await masterClient.sendLogs(deploymentId, [
              { level: 'warn', message: 'Artifact creation failed, continuing deployment', ts: new Date() },
            ]);
          } else {
            await masterClient.sendLogs(deploymentId, [
              { level: 'info', message: 'Artifact created successfully', ts: new Date() },
            ]);
          }
        } catch (err) {
          // Even if artifactHandler throws, still continue (as your intention says)
          logger.error(
            { err, deploymentId },
            'Artifact handler threw error, continuing with deployment'
          );
          await masterClient.sendLogs(deploymentId, [
            { level: 'warn', message: 'Artifact upload error, continuing deployment', ts: new Date() },
          ]);
        }
      }

      // 6. Prepare environment variables (safe)
      const envArray = (envVars ?? []).map((env) => `${env.key}=${env.value}`);

      // 7. Resolve port safely (THIS FIXES YOUR CRASH)
      const resolvedPortInfo = this.resolveExposePort({ runtime, buildSpec, framework: task.framework });
      logger.info(
        { deploymentId, ...resolvedPortInfo, runtime, buildSpec },
        'Resolved expose port for routing'
      );
      await masterClient.sendLogs(deploymentId, [
        {
          level: 'info',
          message: `Routing port resolved: ${resolvedPortInfo.port} (${resolvedPortInfo.source})`,
          ts: new Date(),
        },
      ]);

      // 8. Prepare Traefik labels
      const timestamp = Date.now();
      const routerKey = `${this.sanitizeHostname(hostname)}-${deploymentId}`;
      const serviceKey = `${this.sanitizeHostname(hostname)}-${deploymentId}`;

      const labels: Record<string, string> = {
        'airnode.managed': 'true',
        'airnode.hostname': hostname,
        'airnode.deploymentId': deploymentId,
        'traefik.enable': 'true',

        [`traefik.http.routers.${routerKey}.rule`]: `Host(\`${hostname}\`)`,
        [`traefik.http.routers.${routerKey}.entrypoints`]: config.TRAEFIK_ENTRYPOINTS,
        [`traefik.http.routers.${routerKey}.priority`]: String(timestamp),

        // ✅ This was crashing before. Now it can never crash.
        [`traefik.http.services.${serviceKey}.loadbalancer.server.port`]: String(resolvedPortInfo.port),

        [`traefik.http.routers.${routerKey}.service`]: serviceKey,

        // Explicitly set Docker network for Traefik service discovery
        [`traefik.docker.network`]: config.DOCKER_NETWORK,
      };

      if (config.TRAEFIK_TLS) {
        labels[`traefik.http.routers.${routerKey}.tls`] = 'true';
      }

      // 9. Run container
      await masterClient.sendLogs(deploymentId, [
        { level: 'info', message: 'Starting container...', ts: new Date() },
      ]);
      const containerId = await dockerClient.runContainer(imageTag, containerName, envArray, labels);
      await masterClient.sendLogs(deploymentId, [
        { level: 'info', message: 'Container started successfully', ts: new Date() },
      ]);

      // 10. Healthcheck
      await masterClient.sendLogs(deploymentId, [
        { level: 'info', message: 'Performing healthcheck...', ts: new Date() },
      ]);
      
      // Add port information to healthcheck
      const healthcheckWithPort = {
        ...healthcheck,
        port: resolvedPortInfo.port,
      };
      
      const isHealthy = await this.healthChecker.checkContainerHealth(containerId, healthcheckWithPort);

      if (isHealthy) {
        // 11. Stop previous containers for the same hostname
        await this.cleanupPreviousContainers(hostname, deploymentId);

        // 12. Notify master of success
        await masterClient.notifyRuntimeReady(deploymentId, {
          containerId,
          routerName: hostname,
          imageTag,
        });

        await masterClient.sendLogs(deploymentId, [
          { level: 'info', message: 'Deployment completed successfully!', ts: new Date() },
        ]);
        logger.info({ deploymentId }, `Deployment completed successfully`);
      } else {
        const logs = await dockerClient.getContainerLogs(containerId, 200);
        await masterClient.sendLogs(deploymentId, [
          { level: 'error', message: `Healthcheck failed. Container logs (last 200 lines): ${logs}`, ts: new Date() },
        ]);
        
        // Check if we should keep failed containers for debugging
        if (process.env.KEEP_FAILED_CONTAINERS === 'true') {
          logger.warn(`KEEP_FAILED_CONTAINERS=true, keeping container ${containerId} for debugging`);
          await masterClient.sendLogs(deploymentId, [
            { level: 'warn', message: `KEEP_FAILED_CONTAINERS=true, keeping container for debugging. ID: ${containerId}`, ts: new Date() },
          ]);
        } else {
          await dockerClient.stopContainer(containerId);
          await dockerClient.removeContainer(containerId);
        }

        throw new Error('Healthcheck failed');
      }
    } catch (error) {
      await masterClient.sendLogs(deploymentId, [
        { level: 'error', message: `Deployment failed: ${(error as Error).message}`, ts: new Date() },
      ]);

      logger.error({ err: error, deploymentId }, `Deployment failed`);
      await masterClient.notifyRuntimeFailed(deploymentId, (error as Error).message);

      throw error;
    } finally {
      if (config.KEEP_WORKDIR) {
        logger.warn("KEEP_WORKDIR=true; skipping cleanup");
      } else {
        try {
          await fs.rm(workdir, { recursive: true, force: true });
          logger.info({ workdir }, `Workdir cleaned up`);
        } catch (error) {
          logger.warn({ err: error, workdir }, `Failed to clean up workdir`);
        }
      }
    }
  }

  /**
   * Resolve the port Traefik should route to.
   * Fixes crash by handling missing runtime.exposePort.
   */
  private resolveExposePort(input: {
    runtime: any;
    buildSpec: any;
    framework?: string;
  }): { port: number; source: string } {
    const { runtime, buildSpec, framework } = input;

    // Try runtime.exposePort
    if (runtime?.exposePort != null) {
      const n = Number(runtime.exposePort);
      if (Number.isFinite(n) && n > 0) return { port: n, source: 'runtime.exposePort' };
    }

    // Some codebases use runtime.port
    if (runtime?.port != null) {
      const n = Number(runtime.port);
      if (Number.isFinite(n) && n > 0) return { port: n, source: 'runtime.port' };
    }

    // If buildSpec has port, use it
    if (buildSpec?.port != null) {
      const n = Number(buildSpec.port);
      if (Number.isFinite(n) && n > 0) return { port: n, source: 'buildSpec.port' };
    }
    
    // Special handling for Vite framework - defaults to 4173 for preview
    if (framework === 'vite') {
      return { port: 4173, source: 'framework(vite-default)' };
    }
    
    // Special handling for Astro framework - defaults to 4173 for preview
    if (framework === 'astro') {
      return { port: 4173, source: 'framework(astro-default)' };
    }

    // Hard fallback
    return { port: 3000, source: 'default(3000)' };
  }

  private async cleanupPreviousContainers(hostname: string, currentDeploymentId: string): Promise<void> {
    const containers = await dockerClient.listManagedContainers(hostname);

    for (const container of containers) {
      const containerDeploymentId = container.labels['airnode.deploymentId'];
      if (containerDeploymentId && containerDeploymentId !== currentDeploymentId) {
        logger.info(
          { hostname, containerId: container.id, containerDeploymentId, currentDeploymentId },
          `Stopping previous container`
        );
        await dockerClient.stopContainer(container.id);
        await dockerClient.removeContainer(container.id);
      }
    }
  }

  private sanitizeHostname(hostname: string): string {
    return hostname.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }
}
