import fs from 'fs/promises';
import path from 'path';
import { logger } from '../logger';

export class DockerfileGenerator {
  async generateDockerfile(buildDir: string, buildSpec: any): Promise<string> {
    const dockerfilePath = path.join(buildDir, 'Dockerfile');
    
    const dockerfileContent = `FROM node:${buildSpec.nodeVersion}-alpine

WORKDIR ${buildSpec.workdir}

COPY . .

RUN ${buildSpec.install}

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