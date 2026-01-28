import { request, Dispatcher } from 'undici';
import { config } from './config';
import { logger } from './logger';

export class MasterClient {
  private baseUrl: string;
  private agentName: string;
  private agentKey: string;
  private retryDelay: number = 1000;
  private maxRetries: number = 5;

  constructor() {
    this.baseUrl = config.MASTER_URL;
    this.agentName = config.AGENT_NAME;
    this.agentKey = config.AGENT_KEY;
  }

  private async requestWithRetry(
    url: string,
    options: Omit<Dispatcher.RequestOptions, 'origin' | 'path' | 'method'> & { method: string }
  ): Promise<any> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await request(`${this.baseUrl}${url}`, {
          method: options.method as any,
          headers: {
            'X-Agent-Name': this.agentName,
            'X-Agent-Key': this.agentKey,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string>),
          },
          body: options.body as any,
        });

        if (response.statusCode >= 200 && response.statusCode < 300) {
          const data = await response.body.json();
          return data;
        } else {
          const errorText = await response.body.text();
          throw new Error(`HTTP ${response.statusCode}: ${errorText}`);
        }
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Request to ${url} failed (attempt ${attempt}/${this.maxRetries}): ${error}`);
        
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`Request to ${url} failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  async sendHeartbeat(heartbeatData: any): Promise<void> {
    try {
      await this.requestWithRetry('/agent/heartbeat', {
        method: 'POST',
        body: JSON.stringify(heartbeatData),
      });
      logger.debug('Heartbeat sent successfully');
    } catch (error) {
      logger.error('Failed to send heartbeat:', error);
    }
  }

  async pollTasks(): Promise<any[]> {
    try {
      const data = await this.requestWithRetry('/agent/tasks/poll', {
        method: 'POST',
      });
      return Array.isArray(data) ? data : [];
    } catch (error) {
      logger.error('Failed to poll tasks:', error);
      return [];
    }
  }

  async sendLogs(deploymentId: string, logs: string[]): Promise<void> {
    try {
      await this.requestWithRetry(`/agent/deployments/${deploymentId}/logs`, {
        method: 'POST',
        body: JSON.stringify({ logs }),
      });
      logger.debug(`Logs sent for deployment ${deploymentId}`);
    } catch (error) {
      logger.error(`Failed to send logs for deployment ${deploymentId}:`, error);
    }
  }

  async notifyRuntimeReady(deploymentId: string, data: any): Promise<void> {
    try {
      await this.requestWithRetry(`/agent/deployments/${deploymentId}/runtime/ready`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      logger.info(`Runtime ready notification sent for deployment ${deploymentId}`);
    } catch (error) {
      logger.error(`Failed to notify runtime ready for deployment ${deploymentId}:`, error);
    }
  }

  async notifyRuntimeFailed(deploymentId: string, error: string): Promise<void> {
    try {
      await this.requestWithRetry(`/agent/deployments/${deploymentId}/runtime/failed`, {
        method: 'POST',
        body: JSON.stringify({ error }),
      });
      logger.info(`Runtime failed notification sent for deployment ${deploymentId}`);
    } catch (error) {
      logger.error(`Failed to notify runtime failed for deployment ${deploymentId}:`, error);
    }
  }
}

export const masterClient = new MasterClient();