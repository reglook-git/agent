export interface Task {
  taskId: string;
  type: 'BUILD_AND_DEPLOY';
  deploymentId: string;
  hostname: string;
  depsHash: string;
  source: {
    mode: 'upload' | 'r2';
    downloadUrl?: string;
    r2Key?: string;
  };
  artifactPut?: {
    url: string;
    r2Key: string;
  };
  envVars: Array<{
    key: string;
    value: string;
    isSecret: boolean;
  }>;
  runtime: {
    type: 'docker';
    exposePort: number;
  };
  routing: {
    provider: 'traefik';
    routerName: string;
  };
  buildSpec: {
    nodeVersion: string;
    install: string;
    build: string;
    start: string;
    workdir: string;
  };
  healthcheck: {
    path: string;
    timeoutMs: number;
  };
}

export interface HeartbeatData {
  cpuPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  diskFreeGb: number;
  buildSlotsUsed: number;
  runtimeSlotsUsed: number;
  ts: number;
  agentVersion: string;
}