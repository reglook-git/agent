import { config } from './config';
import { logger } from './logger';
import { TaskPoller } from './task-runner/poller';
import { Heartbeat } from './heartbeat';
import { Cleanup } from './task-runner/cleanup';
import { dockerClient } from './task-runner/docker';

class AirnodeAgent {
  private poller = new TaskPoller();
  private heartbeat = new Heartbeat();
  private cleanup = new Cleanup();
  private isRunning = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Agent is already running');
      return;
    }

    logger.info(`Starting Airnode Agent: ${config.AGENT_NAME}`);

    try {
      // Initialize Docker network
      await dockerClient.createNetworkIfNotExists();

      // Start all services
      await Promise.all([
        this.poller.start(),
        this.heartbeat.start(),
        this.cleanup.start(),
      ]);

      this.isRunning = true;
      logger.info('Airnode Agent started successfully');

      // Handle graceful shutdown
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());

    } catch (error: any) {
      logger.error(error, 'Failed to start Airnode Agent');
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    logger.info('Shutting down Airnode Agent...');

    this.isRunning = false;

    try {
      await Promise.all([
        this.poller.stop(),
        this.heartbeat.stop(),
        this.cleanup.stop(),
      ]);

      logger.info('Airnode Agent shut down successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the agent
const agent = new AirnodeAgent();
agent.start().catch(error => {
  logger.error('Failed to start agent:', error);
  process.exit(1);
});