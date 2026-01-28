import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const configSchema = z.object({
  AGENT_NAME: z.string().min(1),
  AGENT_KEY: z.string().min(1),
  MASTER_URL: z.string().url(),
  POLL_INTERVAL_MS: z.number().int().positive().default(2000),
  HEARTBEAT_INTERVAL_MS: z.number().int().positive().default(5000),
  WORKDIR: z.string().min(1).default('/var/lib/airnode/work'),
  DOCKER_NETWORK: z.string().min(1).default('airnode'),
  TRAEFIK_ENTRYPOINTS: z.string().min(1).default('web,websecure'),
  TRAEFIK_TLS: z.boolean().default(true),
  MAX_CONCURRENT_BUILDS: z.number().int().positive().default(1),
  MAX_CONCURRENT_RUNTIMES: z.number().int().positive().default(50),
  BUILD_TIMEOUT_MS: z.number().int().positive().default(900000),
  HEALTHCHECK_TIMEOUT_MS: z.number().int().positive().default(20000),
  KEEP_WORKDIR: z.boolean().default(false),
});

export type Config = z.infer<typeof configSchema>;

let parsedConfig: Config;

try {
  parsedConfig = configSchema.parse({
    AGENT_NAME: process.env.AGENT_NAME,
    AGENT_KEY: process.env.AGENT_KEY,
    MASTER_URL: process.env.MASTER_URL,
    POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS || '2000', 10),
    HEARTBEAT_INTERVAL_MS: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '5000', 10),
    WORKDIR: process.env.WORKDIR,
    DOCKER_NETWORK: process.env.DOCKER_NETWORK,
    TRAEFIK_ENTRYPOINTS: process.env.TRAEFIK_ENTRYPOINTS,
    TRAEFIK_TLS: process.env.TRAEFIK_TLS === 'true',
    MAX_CONCURRENT_BUILDS: parseInt(process.env.MAX_CONCURRENT_BUILDS || '1', 10),
    MAX_CONCURRENT_RUNTIMES: parseInt(process.env.MAX_CONCURRENT_RUNTIMES || '50', 10),
    BUILD_TIMEOUT_MS: parseInt(process.env.BUILD_TIMEOUT_MS || '900000', 10),
    HEALTHCHECK_TIMEOUT_MS: parseInt(process.env.HEALTHCHECK_TIMEOUT_MS || '20000', 10),
    KEEP_WORKDIR: process.env.KEEP_WORKDIR === 'true',
  });
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Configuration validation error:');
    error.errors.forEach((err) => {
      console.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export const config = parsedConfig;