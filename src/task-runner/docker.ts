import Docker from 'dockerode';
import { config } from '../config';
import { logger } from '../logger';

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

  async buildImage(buildContext: string, dockerfile: string, tag: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.buildImage(
        {
          context: buildContext,
          src: [dockerfile],
        },
        { t: tag }
      )
        .then(stream => {
          this.docker.modem.followProgress(stream, (err, res) => {
            if (err) {
              reject(err);
            } else {
              logger.info(`Image ${tag} built successfully`);
              resolve();
            }
          });
        })
        .catch(reject);
    });
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
      return logs.toString();
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