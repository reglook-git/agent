#!/bin/bash

# Airnode Agent Setup Script
# This script sets up the Airnode Agent on an Ubuntu server

set -e

echo "=== Airnode Agent Setup ==="

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root" 
   exit 1
fi

# Update system
echo "Updating system packages..."
apt update && apt upgrade -y

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io
    usermod -aG docker $SUDO_USER
fi

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
fi

# Create directories
echo "Creating directories..."
mkdir -p /var/lib/airnode/work
mkdir -p /opt/airnode-agent

# Create Docker network
echo "Creating Docker network..."
docker network create airnode 2>/dev/null || echo "Network already exists"

# Copy agent files (assuming this script is in the agent directory)
echo "Copying agent files..."
cp -r ./* /opt/airnode-agent/
chown -R root:root /opt/airnode-agent
chmod +x /opt/airnode-agent/setup.sh

# Install npm dependencies
echo "Installing Node.js dependencies..."
cd /opt/airnode-agent
npm install --production

# Build the agent
echo "Building agent..."
npm run build

# Setup systemd service
echo "Setting up systemd service..."
cp systemd/airnode-agent.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable airnode-agent

# Create .env file if it doesn't exist
if [ ! -f /opt/airnode-agent/.env ]; then
    echo "Creating .env file from example..."
    cp /opt/airnode-agent/.env.example /opt/airnode-agent/.env
    echo "Please edit /opt/airnode-agent/.env with your configuration"
fi

echo ""
echo "=== Setup Complete ==="
echo "Next steps:"
echo "1. Edit /opt/airnode-agent/.env with your configuration"
echo "2. Start Traefik: cd /opt/airnode-agent/traefik && docker-compose up -d"
echo "3. Start the agent: systemctl start airnode-agent"
echo "4. Check status: systemctl status airnode-agent"
echo "5. View logs: journalctl -u airnode-agent -f"