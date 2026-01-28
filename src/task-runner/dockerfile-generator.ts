import fs from 'fs/promises';
import path from 'path';
import { logger } from '../logger';

export class DockerfileGenerator {
  async generateDockerfile(buildDir: string, buildSpec: any): Promise<string> {
    const dockerfilePath = path.join(buildDir, 'Dockerfile');
    
    // Detect package manager from lock files in the build directory
    let installCommand = buildSpec.install;
    
    if (await fs.access(path.join(buildDir, 'pnpm-lock.yaml')).then(() => true).catch(() => false)) {
      logger.info('Detected pnpm project from pnpm-lock.yaml');
      installCommand = 'corepack enable && pnpm install --frozen-lockfile';
    } else if (await fs.access(path.join(buildDir, 'yarn.lock')).then(() => true).catch(() => false)) {
      logger.info('Detected yarn project from yarn.lock');
      installCommand = 'corepack enable && yarn install --frozen-lockfile';
    } else if (await fs.access(path.join(buildDir, 'package-lock.json')).then(() => true).catch(() => false)) {
      logger.info('Detected npm project from package-lock.json');
      installCommand = 'npm ci';
    } else {
      logger.warn('No lock file found, using provided install command');
    }
    
    const dockerfileContent = `FROM node:${buildSpec.nodeVersion}-alpine

WORKDIR ${buildSpec.workdir}

COPY . .

RUN ${installCommand}

RUN ${buildSpec.build}

EXPOSE ${buildSpec.exposePort}

CMD ["sh","-c","${buildSpec.start}"]
`;

    await fs.writeFile(dockerfilePath, dockerfileContent);
    logger.info(`Generated Dockerfile at ${dockerfilePath}`);
    return dockerfilePath;
  }

  async hasDockerfile(buildDir: string): Promise<boolean> {
    try {
      await fs.access(path.join(buildDir, 'Dockerfile'));
      return true;
    } catch {
      return false;
    }
  }
}