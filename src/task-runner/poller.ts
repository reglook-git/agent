import { masterClient } from '../master-client';
import { Task } from './types';
import { TaskExecutor } from './executor';
import { config } from '../config';
import { logger } from '../logger';

export class TaskPoller {
  private executor = new TaskExecutor();
  private isPolling = false;
  private activeBuilds = 0;

  async start(): Promise<void> {
    if (this.isPolling) {
      logger.warn('Task poller is already running');
      return;
    }

    this.isPolling = true;
    logger.info('Starting task poller');

    while (this.isPolling) {
      try {
        if (this.activeBuilds < config.MAX_CONCURRENT_BUILDS) {
          const tasks = await masterClient.pollTasks();
          
          for (const task of tasks) {
            if (this.activeBuilds >= config.MAX_CONCURRENT_BUILDS) {
              break;
            }
            
            this.activeBuilds++;
            this.processTask(task)
              .catch(error => logger.error('Task processing failed:', error))
              .finally(() => this.activeBuilds--);
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, config.POLL_INTERVAL_MS));
      } catch (error) {
        logger.error('Error in task polling loop:', error);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s before retry
      }
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping task poller');
    this.isPolling = false;
  }

  private async processTask(task: Task): Promise<void> {
    logger.info(`Processing task ${task.taskId} of type ${task.type}`);
    
    switch (task.type) {
      case 'BUILD_AND_DEPLOY':
        await this.executor.executeBuildAndDeploy(task);
        break;
      default:
        logger.warn(`Unknown task type: ${task.type}`);
        await masterClient.notifyRuntimeFailed(task.deploymentId, `Unknown task type: ${task.type}`);
    }
  }
}