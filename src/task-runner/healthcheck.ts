import { dockerClient } from './docker';
import { logger } from '../logger';

export class HealthChecker {
  async checkContainerHealth(containerId: string, healthcheck: { path: string; timeoutMs: number; port?: number }): Promise<boolean> {
    const port = healthcheck.port ?? 3000; // Default to 3000 if not specified
    const startTime = Date.now();
    
    while (Date.now() - startTime < healthcheck.timeoutMs) {
      // Try multiple healthcheck methods
      
      // Method 1: Try wget (most common)
      const wgetResult = await this.tryHealthcheckCommand(containerId, [
        'wget',
        '-q',
        '--spider',
        '--timeout=3',
        `http://localhost:${port}${healthcheck.path}`,
      ]);
      
      if (wgetResult.success) {
        logger.info(`Healthcheck passed on port ${port} (wget method)`);
        return true;
      }
      
      // Method 2: Try curl (alternative)
      const curlResult = await this.tryHealthcheckCommand(containerId, [
        'curl',
        '-f',
        '--silent',
        '--show-error',
        '--connect-timeout', '3',
        `http://localhost:${port}${healthcheck.path}`,
      ]);
      
      if (curlResult.success) {
        logger.info(`Healthcheck passed on port ${port} (curl method)`);
        return true;
      }
      
      // Method 3: Try netcat to check if port is listening
      const ncResult = await this.tryHealthcheckCommand(containerId, [
        'nc',
        '-z',
        'localhost',
        String(port),
      ]);
      
      if (ncResult.success) {
        logger.info(`Healthcheck passed on port ${port} (port check method)`);
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