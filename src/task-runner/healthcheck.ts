import { dockerClient } from './docker';
import { logger } from '../logger';

export class HealthChecker {
  async checkContainerHealth(containerId: string, healthcheck: { path: string; timeoutMs: number }): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < healthcheck.timeoutMs) {
      // Try multiple healthcheck methods
      
      // Method 1: Try wget (most common)
      const wgetResult = await this.tryHealthcheckCommand(containerId, [
        'wget',
        '-q',
        '--spider',
        '--timeout=3',
        `http://localhost:3000${healthcheck.path}`,
      ]);
      
      if (wgetResult.success) {
        logger.info('Healthcheck passed (wget method)');
        return true;
      }
      
      // Method 2: Try curl (alternative)
      const curlResult = await this.tryHealthcheckCommand(containerId, [
        'curl',
        '-f',
        '--silent',
        '--show-error',
        '--connect-timeout', '3',
        `http://localhost:3000${healthcheck.path}`,
      ]);
      
      if (curlResult.success) {
        logger.info('Healthcheck passed (curl method)');
        return true;
      }
      
      // Method 3: Try netcat to check if port is listening
      const ncResult = await this.tryHealthcheckCommand(containerId, [
        'nc',
        '-z',
        'localhost',
        '3000',
      ]);
      
      if (ncResult.success) {
        logger.info('Healthcheck passed (port check method)');
        return true;
      }
      
      // Log failure details (only first few attempts)
      if (Date.now() - startTime < 5000) {
        logger.debug(`Healthcheck attempt failed. Wget: ${wgetResult.error?.message || 'not available'}, Curl: ${curlResult.error?.message || 'not available'}, NC: ${ncResult.error?.message || 'not available'}`);
      }
      
      // Wait 1 second before next attempt
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.error('Healthcheck failed - timeout reached');
    return false;
  }
  
  private async tryHealthcheckCommand(containerId: string, command: string[]): Promise<{ success: boolean; error?: Error }> {
    try {
      const result = await dockerClient.execInContainer(containerId, command);
      return { success: true };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }
}