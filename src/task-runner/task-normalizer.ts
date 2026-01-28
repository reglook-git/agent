import { Task } from './types';
import { logger } from '../logger';

/**
 * Normalize task data from various server response formats
 * Handles both flat task structure and nested payload structure
 */
export function normalizeTask(rawTask: any): Task {
  // Handle nested payload structure (server stores extra data in build_tasks.payload)
  const taskData = rawTask.payload ? { ...rawTask, ...rawTask.payload } : rawTask;
  
  // Normalize buildSpec with fallbacks
  const buildSpec = taskData.buildSpec ?? {
    nodeVersion: "20",
    install: "npm ci",
    build: "npm run build",
    start: "npm run start",
    workdir: "/app",
    exposePort: 3000,
  };
  
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