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
    const { deploymentId, hostname, source, buildSpec, runtime, healthcheck, envVars, artifactPut } = task;
    
    logger.info(`Starting BUILD_AND_DEPLOY task for deployment ${deploymentId}`);

    const workdir = path.join(config.WORKDIR, deploymentId);
    const imageTag = `airnode/${this.sanitizeHostname(hostname)}:${deploymentId}`;
    const containerName = `airnode__${this.sanitizeHostname(hostname)}__${deploymentId}`;
    
    try {
      // 1. Create workdir
      await fs.mkdir(workdir, { recursive: true });
      
      // 2. Fetch source
      await this.sourceFetcher.fetchSource(source, workdir);
      
      // 3. Generate or use existing Dockerfile
      let dockerfilePath: string;
      if (await this.dockerfileGenerator.hasDockerfile(workdir)) {
        dockerfilePath = path.join(workdir, 'Dockerfile');
        logger.info('Using existing Dockerfile');
      } else {
        dockerfilePath = await this.dockerfileGenerator.generateDockerfile(workdir, buildSpec);
      }
      
      // 4. Build Docker image
      await dockerClient.buildImage(workdir, 'Dockerfile', imageTag);
      
      // 5. Create artifact if requested
      if (artifactPut) {
        const success = await this.artifactHandler.createAndUploadArtifact(workdir, artifactPut);
        if (!success) {
          logger.warn('Artifact creation/upload failed, but continuing with deployment');
        }
      }
      
      // 6. Prepare environment variables
      const envArray = envVars.map(env => `${env.key}=${env.value}`);
      
      // 7. Prepare Traefik labels
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
        [`traefik.http.routers.${routerKey}.priority`]: timestamp.toString(),
        [`traefik.http.services.${serviceKey}.loadbalancer.server.port`]: runtime.exposePort.toString(),
        [`traefik.http.routers.${routerKey}.service`]: serviceKey,
      };
      
      if (config.TRAEFIK_TLS) {
        labels[`traefik.http.routers.${routerKey}.tls`] = 'true';
      }
      
      // 8. Run container
      const containerId = await dockerClient.runContainer(imageTag, containerName, envArray, labels);
      
      // 9. Healthcheck
      const isHealthy = await this.healthChecker.checkContainerHealth(containerId, healthcheck);
      
      if (isHealthy) {
        // 10. Stop previous containers for the same hostname
        await this.cleanupPreviousContainers(hostname, deploymentId);
        
        // 11. Notify master of success
        await masterClient.notifyRuntimeReady(deploymentId, {
          containerId,
          routerName: hostname,
          imageTag,
        });
        
        logger.info(`Deployment ${deploymentId} completed successfully`);
      } else {
        // Healthcheck failed
        const logs = await dockerClient.getContainerLogs(containerId);
        await masterClient.sendLogs(deploymentId, [logs]);
        await dockerClient.stopContainer(containerId);
        await dockerClient.removeContainer(containerId);
        
        throw new Error('Healthcheck failed');
      }
      
    } catch (error) {
      logger.error({ err: error }, `Deployment ${deploymentId} failed`);
      await masterClient.notifyRuntimeFailed(deploymentId, (error as Error).message);
      throw error;
    } finally {
      // Clean up workdir
      if (config.KEEP_WORKDIR) {
        logger.warn("KEEP_WORKDIR=true; skipping cleanup");
      } else {
        try {
          await fs.rm(workdir, { recursive: true, force: true });
          logger.info(`Workdir ${workdir} cleaned up`);
        } catch (error) {
          logger.warn(`Failed to clean up workdir ${workdir}:`, error);
        }
      }
    }
  }

  private async cleanupPreviousContainers(hostname: string, currentDeploymentId: string): Promise<void> {
    const containers = await dockerClient.listManagedContainers(hostname);
    
    for (const container of containers) {
      const containerDeploymentId = container.labels['airnode.deploymentId'];
      if (containerDeploymentId && containerDeploymentId !== currentDeploymentId) {
        logger.info(`Stopping previous container ${container.id} for deployment ${containerDeploymentId}`);
        await dockerClient.stopContainer(container.id);
        await dockerClient.removeContainer(container.id);
      }
    }
  }

  private sanitizeHostname(hostname: string): string {
    return hostname.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }
}