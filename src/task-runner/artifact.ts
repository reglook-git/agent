import fs from 'fs/promises';
import path from 'path';
import { request } from 'undici';
import tar from 'tar';
import { logger } from '../logger';

export class ArtifactHandler {
  async createAndUploadArtifact(buildDir: string, artifactPut: { url: string; r2Key: string }): Promise<boolean> {
    try {
      const artifactPath = path.join(buildDir, 'artifact.tar.gz');
      
      logger.info('Creating artifact archive...');
      
      // Create tar.gz of build output (excluding node_modules)
      await tar.create({
        gzip: true,
        file: artifactPath,
        cwd: buildDir,
        filter: (path: string) => !path.includes('node_modules'),
      } as any, ['.']);

      logger.info(`Artifact created at ${artifactPath}`);

      // Upload to presigned URL
      logger.info('Uploading artifact...');
      const fileBuffer = await fs.readFile(artifactPath);
      
      const response = await request(artifactPut.url, {
        method: 'PUT',
        body: fileBuffer,
        headers: {
          'Content-Type': 'application/gzip',
        },
      });

      if (response.statusCode >= 200 && response.statusCode < 300) {
        logger.info('Artifact uploaded successfully');
        // Clean up local artifact
        await fs.unlink(artifactPath);
        return true;
      } else {
        const errorText = await response.body.text();
        logger.error(`Failed to upload artifact: HTTP ${response.statusCode} - ${errorText}`);
        return false;
      }
    } catch (error) {
      logger.error('Failed to create or upload artifact:', error);
      return false;
    }
  }
}