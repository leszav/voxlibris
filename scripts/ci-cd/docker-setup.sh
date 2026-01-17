#!/bin/bash

# =============================================================================
# xLibris Docker Configuration Generator
# =============================================================================
# Генерация Docker конфигураций для CI/CD
# Модульный компонент CI/CD системы

# Import common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

# Generate Dockerfile for production
generate_dockerfile() {
    log_info "Generating optimized Dockerfile..."
    
    cat > Dockerfile << 'EOF'
# Multi-stage build for xLibris
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/ 2>/dev/null || true

# Install dependencies
RUN pnpm install --frozen-lockfile

# Development stage
FROM base AS dev
COPY . .
EXPOSE 3000 5000
CMD ["pnpm", "run", "dev"]

# Build stage
FROM base AS builder
COPY . .
RUN pnpm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S xLibris -u 1001

USER xLibris

EXPOSE 5000

CMD ["node", "dist/server/index.js"]
EOF

    log_success "Dockerfile created"
}

# Generate docker-compose for development
generate_docker_compose_dev() {
    log_info "Generating docker-compose.dev.yml..."
    
    cat > docker-compose.dev.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: xlibris_dev
      POSTGRES_USER: xlibris
      POSTGRES_PASSWORD: xlibris_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U xlibris"]
      interval: 30s
      timeout: 10s
      retries: 3
      
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_dev_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3
      
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: xlibris
      MINIO_ROOT_PASSWORD: xlibris_password
    volumes:
      - minio_dev_data:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3

  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: dev
    ports:
      - "3000:3000"
      - "5000:5000"
    volumes:
      - .:/app
      - node_modules:/app/node_modules
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://xlibris:xlibris_password@postgres:5432/xlibris_dev
      REDIS_URL: redis://redis:6379
      MINIO_ENDPOINT: minio:9000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy

volumes:
  postgres_dev_data:
  redis_dev_data:
  minio_dev_data:
  node_modules:
EOF

    log_success "docker-compose.dev.yml created"
}

# Generate production docker-compose
generate_docker_compose_prod() {
    log_info "Generating docker-compose.prod.yml..."
    
    cat > docker-compose.prod.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-xlibris}
      POSTGRES_USER: ${POSTGRES_USER:-xlibris}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_prod_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-xlibris}"]
      interval: 30s
      timeout: 10s
      retries: 3
      
  redis:
    image: redis:7-alpine
    volumes:
      - redis_prod_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3
      
  minio:
    image: minio/minio:latest
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio_prod_data:/data
    command: server /data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3

  app:
    image: ${IMAGE_NAME:-xlibris:latest}
    ports:
      - "${APP_PORT:-5000}:5000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER:-xlibris}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-xlibris}
      REDIS_URL: redis://redis:6379
      MINIO_ENDPOINT: minio:9000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_prod_data:
  redis_prod_data:
  minio_prod_data:
EOF

    log_success "docker-compose.prod.yml created"
}

# Generate nginx configuration
generate_nginx_config() {
    log_info "Generating nginx configuration..."
    
    create_directory "nginx" "nginx configuration directory"
    
    cat > nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream app {
        server app:5000;
    }

    server {
        listen 80;
        server_name _;
        
        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        
        location / {
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF

    log_success "nginx configuration created"
}

# Generate .dockerignore
generate_dockerignore() {
    log_info "Generating .dockerignore..."
    
    cat > .dockerignore << 'EOF'
# Dependencies
node_modules/
.pnpm-store/

# Development files
.env.local
.env.development
*.log

# Git
.git/
.gitignore

# Documentation
README.md
docs/

# CI/CD
.github/
scripts/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Build outputs (keep for production stage)
!dist/

# Temporary files
tmp/
temp/
*.tmp
EOF

    log_success ".dockerignore created"
}

# Main Docker setup function
setup_docker_configs() {
    log_info "Setting up Docker configurations..."
    
    generate_dockerfile
    generate_docker_compose_dev
    generate_docker_compose_prod
    generate_nginx_config
    generate_dockerignore
    
    log_success "Docker setup completed"
}

# Export main function
export -f setup_docker_configs