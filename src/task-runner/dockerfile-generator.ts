import fs from 'fs/promises';
import path from 'path';
import { logger } from '../logger';

export class DockerfileGenerator {
  async generateDockerfile(buildDir: string, buildSpec: any): Promise<string> {
    const dockerfilePath = path.join(buildDir, 'Dockerfile');
    
    // Detect package manager from lock files in the build directory
    let installCommand = buildSpec.install;
    let buildCommand = buildSpec.build;
    let startCommand = buildSpec.start;
    let pmRun = 'npm'; // Default to npm
    
    if (await fs.access(path.join(buildDir, 'pnpm-lock.yaml')).then(() => true).catch(() => false)) {
      logger.info('Detected pnpm project from pnpm-lock.yaml');
      installCommand = 'corepack enable && pnpm install --frozen-lockfile';
      pmRun = 'pnpm';
      // Update build and start commands to use pnpm
      if (buildCommand && buildCommand.includes('npm run')) {
        buildCommand = buildCommand.replace('npm run', 'pnpm run');
      }
      if (startCommand && startCommand.includes('npm run')) {
        startCommand = startCommand.replace('npm run', 'pnpm run');
      }
    } else if (await fs.access(path.join(buildDir, 'yarn.lock')).then(() => true).catch(() => false)) {
      logger.info('Detected yarn project from yarn.lock');
      installCommand = 'corepack enable && yarn install --frozen-lockfile';
      pmRun = 'yarn';
      // Update build and start commands to use yarn
      if (buildCommand && buildCommand.includes('npm run')) {
        buildCommand = buildCommand.replace('npm run', 'yarn');
      }
      if (startCommand && startCommand.includes('npm run')) {
        startCommand = startCommand.replace('npm run', 'yarn');
      }
    } else if (await fs.access(path.join(buildDir, 'package-lock.json')).then(() => true).catch(() => false)) {
      logger.info('Detected npm project from package-lock.json');
      installCommand = 'npm ci';
      pmRun = 'npm';
    } else {
      logger.warn('No lock file found, using provided commands');
    }
    
    logger.info(`Using package manager: ${pmRun}`);
    logger.info(`Install command: ${installCommand}`);
    logger.info(`Build command: ${buildCommand}`);
    logger.info(`Start command: ${startCommand}`);
    
    const dockerfileContent = `FROM node:${buildSpec.nodeVersion}-alpine

WORKDIR ${buildSpec.workdir}

COPY . .

RUN ${installCommand}

RUN ${buildCommand}

EXPOSE ${buildSpec.exposePort}

CMD ["sh","-c","${startCommand}"]
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