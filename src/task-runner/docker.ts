import Docker from 'dockerode';
import { config } from '../config';
import { logger } from '../logger';
import tar from 'tar-fs';

export class DockerClient {
  private docker: Docker;

  constructor() {
    this.docker = new Docker();
  }

  async createNetworkIfNotExists(): Promise<void> {
    try {
      await this.docker.getNetwork(config.DOCKER_NETWORK).inspect();
      logger.info(`Network ${config.DOCKER_NETWORK} already exists`);
    } catch (error: any) {
      if (error.statusCode === 404 || error.message?.includes('no such network')) {
        logger.info(`Creating network ${config.DOCKER_NETWORK}`);
        await this.docker.createNetwork({
          Name: config.DOCKER_NETWORK,
          Driver: 'bridge',
        });
      } else {
        logger.error(error, `Failed to inspect Docker network ${config.DOCKER_NETWORK}`);
        throw error;
      }
    }
  }

  async buildImage(buildContextDir: string, tag: string, onBuildLog?: (log: string) => void): Promise<void> {
    // Pack entire directory as build context (same as `docker build .`)
    const tarStream = tar.pack(buildContextDir);

    const stream = await this.docker.buildImage(tarStream, {
      t: tag,
      pull: true,
      forcerm: true,
    });

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: any) => (err ? reject(err) : resolve()),
        (event: any) => {
          // Optional: stream build logs
          if (event?.stream) {
            const logLine = event.stream.trim();
            logger.info(logLine);
            if (onBuildLog) {
              onBuildLog(logLine);
            }
          }
          if (event?.error) reject(new Error(event.error));
        }
      );
    });

    // Hard guarantee: image exists
    await this.docker.getImage(tag).inspect();
    logger.info(`Image ${tag} built successfully`);
  }

  async runContainer(image: string, containerName: string, envVars: string[], labels: Record<string, string>): Promise<string> {
    const container = await this.docker.createContainer({
      Image: image,
      name: containerName,
      Env: envVars,
      Labels: labels,
      HostConfig: {
        NetworkMode: config.DOCKER_NETWORK,
        AutoRemove: false,
      },
    });

    await container.start();
    logger.info(`Container ${containerName} started with ID ${container.id}`);
    return container.id;
  }

  async stopContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop();
      logger.info(`Container ${containerId} stopped`);
    } catch (error) {
      logger.warn(`Failed to stop container ${containerId}:`, error);
    }
  }

  async removeContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ force: true });
      logger.info(`Container ${containerId} removed`);
    } catch (error) {
      logger.warn(`Failed to remove container ${containerId}:`, error);
    }
  }

  async getContainerLogs(containerId: string, tail?: number): Promise<string> {
    try {
      const container = this.docker.getContainer(containerId);
      const logs = await container.logs({
        follow: false,
        stdout: true,
        stderr: true,
        tail: tail || 100,
      });
      return logs.toString("utf8").replace(/\u0000/g, "");
    } catch (error) {
      logger.error(`Failed to get logs for container ${containerId}:`, error);
      return '';
    }
  }

  async execInContainer(containerId: string, command: string[]): Promise<string> {
    try {
      const container = this.docker.getContainer(containerId);
      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({});
      return new Promise((resolve, reject) => {
        let output = '';
        stream.on('data', (chunk) => {
          output += chunk.toString();
        });
        stream.on('end', () => resolve(output));
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error(`Failed to execute command in container ${containerId}:`, error);
      throw error;
    }
  }

  async listManagedContainers(hostname?: string): Promise<Array<{ id: string; name: string; labels: Record<string, string> }>> {
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: JSON.stringify({
          label: ['airnode.managed=true'],
        }),
      });

      return containers
        .filter(container => {
          if (!hostname) return true;
          return container.Labels['airnode.hostname'] === hostname;
        })
        .map(container => ({
          id: container.Id,
          name: container.Names[0].substring(1),
          labels: container.Labels,
        }));
    } catch (error) {
      logger.error('Failed to list managed containers:', error);
      return [];
    }
  }
}

export const dockerClient = new DockerClient();