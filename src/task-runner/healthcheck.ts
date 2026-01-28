import { dockerClient } from './docker';
import { logger } from '../logger';

export class HealthChecker {
  async checkContainerHealth(containerId: string, healthcheck: { path: string; timeoutMs: number }): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < healthcheck.timeoutMs) {
      try {
        const result = await dockerClient.execInContainer(containerId, [
          'wget',
          '-q',
          '--spider',
          `http://localhost:3000${healthcheck.path}`,
        ]);

        if (result.includes('200 OK') || result === '') {
          logger.info('Healthcheck passed');
          return true;
        }
      } catch (error) {
        logger.debug('Healthcheck attempt failed:', error);
      }

      // Wait 1 second before next attempt
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.error('Healthcheck failed - timeout reached');
    return false;
  }
}