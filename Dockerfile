# Dockerfile for Airnode Agent (optional - for containerized deployment)

FROM node:18-alpine

# Install Docker CLI
RUN apk add --no-cache docker-cli

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the agent
RUN npm run build

# Expose port (if needed for healthchecks)
EXPOSE 8080

# Run the agent
CMD ["npm", "start"]