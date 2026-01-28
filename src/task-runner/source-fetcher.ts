import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { request } from 'undici';
import AdmZip from 'adm-zip';
import tar from 'tar';
import { logger } from '../logger';

export class SourceFetcher {
  async fetchSource(source: { mode: string; downloadUrl?: string; r2Key?: string }, workdir: string): Promise<void> {
    if (!source.downloadUrl) {
      throw new Error('No download URL provided for source');
    }

    logger.info(`Fetching source from ${source.downloadUrl}`);
    
    try {
      const response = await request(source.downloadUrl);
      
      if (response.statusCode !== 200) {
        throw new Error(`Failed to download source: HTTP ${response.statusCode}`);
      }

      const contentType = response.headers['content-type'] as string || '';
      const filename = this.getFilenameFromUrl(source.downloadUrl, contentType);
      const filepath = path.join(workdir, filename);

      // Ensure workdir exists
      await fs.mkdir(workdir, { recursive: true });

      // Save the file
      const writeStream = createWriteStream(filepath);
      response.body.pipe(writeStream);

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });

      logger.info(`Source downloaded to ${filepath}`);

      // Extract based on file type
      if (filename.endsWith('.zip')) {
        await this.extractZip(filepath, workdir);
      } else if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) {
        await this.extractTarGz(filepath, workdir);
      } else {
        throw new Error(`Unsupported source file type: ${filename}`);
      }

      // Clean up the downloaded archive
      await fs.unlink(filepath);
      logger.info('Source extraction completed');

    } catch (error) {
      logger.error('Failed to fetch source:', error);
      throw error;
    }
  }

  private getFilenameFromUrl(url: string, contentType: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = path.basename(pathname);
      
      if (filename && filename !== '') {
        return filename;
      }
    } catch (error) {
      // URL parsing failed, continue to content-type check
    }

    // Fallback to content-type
    if (contentType.includes('application/zip')) {
      return 'source.zip';
    } else if (contentType.includes('application/gzip') || contentType.includes('application/x-tar')) {
      return 'source.tar.gz';
    } else {
      return 'source.zip'; // Default assumption
    }
  }

  private async extractZip(filepath: string, workdir: string): Promise<void> {
    logger.info('Extracting ZIP archive...');
    const zip = new AdmZip(filepath);
    zip.extractAllTo(workdir, true);
  }

  private async extractTarGz(filepath: string, workdir: string): Promise<void> {
    logger.info('Extracting TAR.GZ archive...');
    await tar.extract({
      gzip: true,
      file: filepath,
      cwd: workdir,
    } as any);
  }
}