import { Task } from './types';
import { logger } from '../logger';

/**
 * Normalize task data from various server response formats
 * Handles both flat task structure and nested payload structure
 */
export function normalizeTask(rawTask: any): Task {
  // Handle nested payload structure (server stores extra data in build_tasks.payload)
  const taskData = rawTask.payload ? { ...rawTask, ...rawTask.payload } : rawTask;
  
  // Log task metadata for debugging
  logger.info(
    `Task meta: pm=${taskData.packageManager ?? 'missing'}, framework=${taskData.framework ?? 'missing'}, hasBuildSpec=${!!taskData.buildSpec}`
  );
  
  // Determine package manager with fallback to npm
  // Check buildSpec first, then top-level taskData
  const pmFromSpec = taskData.buildSpec?.packageManager;
  const pm: 'npm' | 'pnpm' | 'yarn' =
    pmFromSpec === 'pnpm' || pmFromSpec === 'yarn'
      ? pmFromSpec
      : taskData.packageManager === 'pnpm' || taskData.packageManager === 'yarn'
        ? taskData.packageManager
        : 'npm';

  // Generate package manager specific commands
  const pmInstall =
    pm === 'npm'
      ? 'npm ci'
      : `corepack enable && ${pm} install --frozen-lockfile`;

  const pmRun = (script: string) =>
    pm === 'npm' ? `npm run ${script}` : pm === 'pnpm' ? `pnpm run ${script}` : `yarn ${script}`;

  // Determine framework-specific start command
  const framework = taskData.framework;
  const defaultStart =
    framework === 'vite'
      ? (pm === 'yarn'
          ? 'yarn preview -- --host 0.0.0.0 --port 3000'  // Consistent yarn format
          : `${pm} run preview -- --host 0.0.0.0 --port 3000`)
      : pmRun('start');

  // Create smart defaults based on detected package manager and framework
  const defaultBuildSpec = {
    nodeVersion: "20",
    workdir: "/app",
    exposePort: 3000,
    install: pmInstall,
    build: pmRun('build'),
    start: defaultStart,
  };

  // Merge with server-provided buildSpec
  const serverBuildSpec = taskData.buildSpec ?? {};
  const buildSpec = {
    ...defaultBuildSpec,
    ...serverBuildSpec,
  };

  // Prevent server-provided npm commands from overriding pnpm/yarn defaults
  if (pm !== 'npm' && typeof serverBuildSpec.install === 'string' && serverBuildSpec.install.includes('npm ')) {
    logger.warn(`Server buildSpec.install uses npm but pm=${pm}; overriding to ${pmInstall}`);
    buildSpec.install = pmInstall;
  }

  // Log when using defaults
  if (!taskData.buildSpec) {
    logger.warn(`No buildSpec in task; using defaults (pm=${pm}, framework=${framework ?? 'unknown'})`);
  } else if (Object.keys(serverBuildSpec).length < Object.keys(defaultBuildSpec).length) {
    logger.info(`Partial buildSpec received; filling missing fields with ${pm} defaults`);
  }
  
  // Normalize healthcheck with fallbacks
  const healthcheck = taskData.healthcheck ?? {
    path: "/",
    timeoutMs: 20000,
  };
  
  // Normalize runtime with fallbacks
  const runtime = taskData.runtime ?? {
    type: "docker",
    exposePort: buildSpec.exposePort ?? 3000,
  };
  
  // Normalize envVars (ensure it's an array)
  const envVars = Array.isArray(taskData.envVars) ? taskData.envVars : [];
  
  // Normalize source
  const source = taskData.source ?? { mode: "upload" };
  
  // Create normalized task object
  const normalizedTask: Task = {
    taskId: taskData.taskId ?? taskData.id,
    type: taskData.type ?? 'BUILD_AND_DEPLOY',
    deploymentId: taskData.deploymentId,
    hostname: taskData.hostname,
    depsHash: taskData.depsHash ?? '',
    packageManager: pm,
    framework: framework ?? undefined,
    source,
    artifactPut: taskData.artifactPut,
    envVars,
    runtime,
    routing: taskData.routing ?? {
      provider: "traefik",
      routerName: taskData.hostname ? taskData.hostname.replace(/[^a-zA-Z0-9]/g, '-') : 'default-router',
    },
    buildSpec,
    healthcheck,
  };
  
  // Log normalization if debug info is needed
  if (rawTask.payload) {
    logger.debug('Normalized task from nested payload structure');
  }
  
  return normalizedTask;
}