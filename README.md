# Airnode Agent

Airnode Agent is a deployment orchestration agent that runs on each Airnode node to handle application deployments, heartbeats, and task execution.

## Features

- **Heartbeat Monitoring**: Sends regular system metrics to the control plane
- **Task Polling**: Pulls deployment tasks from the master server
- **Docker Build & Deploy**: Builds applications in isolated Docker containers
- **Traefik Integration**: Automatic routing configuration with blue/green deployment
- **Artifact Management**: Optional artifact upload to Cloudflare R2
- **Health Checking**: Container health verification before routing traffic
- **Automatic Cleanup**: Removes old work directories and dangling Docker images

## Requirements

- Node.js 18+
- Docker Engine
- Docker network access
- Internet connectivity to master server

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd agent
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

## Configuration

Copy the example configuration file and modify it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
AGENT_NAME=airnode1
AGENT_KEY=your-secret-agent-key
MASTER_URL=http://master-server:9100
POLL_INTERVAL_MS=2000
HEARTBEAT_INTERVAL_MS=5000
WORKDIR=/var/lib/airnode/work
DOCKER_NETWORK=airnode
TRAEFIK_ENTRYPOINTS=web,websecure
TRAEFIK_TLS=true
MAX_CONCURRENT_BUILDS=1
MAX_CONCURRENT_RUNTIMES=50
BUILD_TIMEOUT_MS=900000
HEALTHCHECK_TIMEOUT_MS=20000
```

## Running the Agent

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

## Systemd Service (Production)

Create a systemd service file at `/etc/systemd/system/airnode-agent.service`:

```ini
[Unit]
Description=Airnode Agent
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/path/to/agent
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl enable airnode-agent
sudo systemctl start airnode-agent
```

## Traefik Setup

The agent expects Traefik to be running with Docker provider. Here's a minimal docker-compose.yml:

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"  # Traefik dashboard
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/etc/traefik/traefik.yml:ro
    networks:
      - airnode
    restart: unless-stopped

networks:
  airnode:
    name: airnode
    external: true
```

## Deployment Process

1. **Task Polling**: Agent polls `/agent/tasks/poll` endpoint every `POLL_INTERVAL_MS`
2. **Source Fetching**: Downloads source code from provided URL (tar.gz or zip)
3. **Docker Build**: 
   - Uses existing Dockerfile if present
   - Generates generic Dockerfile if none exists
4. **Artifact Creation** (optional): Creates and uploads tar.gz artifact to R2
5. **Container Deployment**: 
   - Runs container with Traefik labels
   - Configures routing based on hostname
6. **Health Check**: Verifies container health via HTTP endpoint
7. **Blue/Green Deployment**: Stops previous containers for same hostname
8. **Notification**: Reports success/failure to master server

## Logging

The agent uses Pino for structured logging. Logs are sent to the master server and also output to stdout.

## Monitoring

The agent sends heartbeat data including:
- CPU usage percentage
- RAM usage (used/total in MB)
- Disk free space (GB)
- Active build slots
- Active runtime containers
- Agent version and timestamp

## Security

- Agent communicates with master server using X-Agent-Name and X-Agent-Key headers
- All Docker builds run in isolated containers
- Environment variables can be marked as secrets
- Automatic cleanup of temporary files

## Troubleshooting

### Common Issues

1. **Docker permission denied**: Ensure the user running the agent has Docker permissions
2. **Network issues**: Verify connectivity to the master server
3. **Disk space**: Monitor available disk space in WORKDIR
4. **Build failures**: Check Docker build logs sent to master server

### Logs

Check systemd logs:
```bash
sudo journalctl -u airnode-agent -f
```

Or check Docker logs if running in container:
```bash
docker logs airnode-agent
```

## Development

### Project Structure

```
src/
├── config.ts              # Configuration validation
├── logger.ts              # Logging setup
├── master-client.ts       # HTTP client for master server
├── heartbeat.ts           # System metrics collection
├── task-runner/
│   ├── types.ts           # Task and heartbeat types
│   ├── poller.ts          # Task polling logic
│   ├── executor.ts        # Task execution
│   ├── docker.ts          # Docker operations
│   ├── source-fetcher.ts  # Source code download
│   ├── dockerfile-generator.ts # Dockerfile generation
│   ├── artifact.ts        # Artifact creation/upload
│   ├── healthcheck.ts     # Container health checking
│   └── cleanup.ts         # Resource cleanup
└── index.ts               # Main entry point
```

### Building

```bash
npm run build
```

### Testing

```bash
# TODO: Add test suite
npm test
```

## License

MIT