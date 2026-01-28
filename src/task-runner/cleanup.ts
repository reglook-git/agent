import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from '../config';
import { logger } from '../logger';

const execAsync = promisify(exec);

export class Cleanup {
  private isRunning = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Cleanup is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting cleanup service');

    // Run cleanup every hour
    const interval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(interval);
        return;
      }
      
      try {
        await this.cleanupOldWorkdirs();
        await this.cleanupDanglingImages();
      } catch (error) {
        logger.error('Cleanup failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  async stop(): Promise<void> {
    logger.info('Stopping cleanup service');
    this.isRunning = false;
  }

  private async cleanupOldWorkdirs(): Promise<void> {
    try {
      const files = await fs.readdir(config.WORKDIR, { withFileTypes: true });
      
      const now = Date.now();
      const cutoffTime = now - (24 * 60 * 60 * 1000); // 24 hours ago
      
      for (const file of files) {
        if (file.isDirectory()) {
          const dirPath = path.join(config.WORKDIR, file.name);
          try {
            const stats = await fs.stat(dirPath);
            if (stats.mtime.getTime() < cutoffTime) {
              await fs.rm(dirPath, { recursive: true, force: true });
              logger.info(`Removed old workdir: ${dirPath}`);
            }
          } catch (error) {
            logger.warn(`Failed to check/remove workdir ${dirPath}:`, error);
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to cleanup old workdirs:', error);
    }
  }

  private async cleanupDanglingImages(): Promise<void> {
    try {
      logger.info('Cleaning up dangling Docker images');
      await execAsync('docker image prune -f');
      logger.info('Docker image cleanup completed');
    } catch (error) {
      logger.warn('Failed to cleanup dangling Docker images:', error);
    }
  }
}