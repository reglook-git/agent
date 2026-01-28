import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { masterClient } from './master-client';
import { dockerClient } from './task-runner/docker';
import { config } from './config';
import { logger } from './logger';

const execAsync = promisify(exec);

export class Heartbeat {
  private isRunning = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Heartbeat is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting heartbeat');

    while (this.isRunning) {
      try {
        const heartbeatData = await this.collectHeartbeatData();
        await masterClient.sendHeartbeat(heartbeatData);
      } catch (error) {
        logger.error('Failed to send heartbeat:', error);
      }

      await new Promise(resolve => setTimeout(resolve, config.HEARTBEAT_INTERVAL_MS));
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping heartbeat');
    this.isRunning = false;
  }

  private async collectHeartbeatData(): Promise<any> {
    const [cpuPercent, ramStats, diskStats, runtimeSlotsUsed] = await Promise.all([
      this.getCpuPercent(),
      this.getRamStats(),
      this.getDiskStats(),
      this.getRuntimeSlotsUsed(),
    ]);

    return {
      cpuPercent,
      ramUsedMb: ramStats.usedMb,
      ramTotalMb: ramStats.totalMb,
      diskFreeGb: diskStats.freeGb,
      buildSlotsUsed: 0, // TODO: Implement build slot tracking
      runtimeSlotsUsed,
      ts: Date.now(),
      agentVersion: '1.0.0',
    };
  }

  private async getCpuPercent(): Promise<number> {
    // Simple CPU usage estimation using load average
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;
    // Normalize load average to percentage (0-100)
    return Math.min(100, (loadAvg[0] / cpuCount) * 100);
  }

  private getRamStats(): { usedMb: number; totalMb: number } {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      usedMb: Math.round(usedMem / 1024 / 1024),
      totalMb: Math.round(totalMem / 1024 / 1024),
    };
  }

  private async getDiskStats(): Promise<{ freeGb: number }> {
    try {
      // Use df command to get disk usage
      const { stdout } = await execAsync(`df -k ${config.WORKDIR}`);
      const lines = stdout.trim().split('\n');
      if (lines.length > 1) {
        const stats = lines[1].split(/\s+/);
        const freeKb = parseInt(stats[3], 10);
        return {
          freeGb: Math.round(freeKb / 1024 / 1024),
        };
      }
    } catch (error) {
      logger.warn('Failed to get disk stats:', error);
    }
    
    return { freeGb: 0 };
  }

  private async getRuntimeSlotsUsed(): Promise<number> {
    try {
      const containers = await dockerClient.listManagedContainers();
      return containers.length;
    } catch (error) {
      logger.warn('Failed to get runtime slots count:', error);
      return 0;
    }
  }
}