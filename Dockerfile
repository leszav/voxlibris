FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN npm install -g pnpm@9 && \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma/DB client if needed
# RUN pnpm run db:generate

# Build the application
RUN pnpm run build

# Production image optimized for performance
FROM node:20-alpine

WORKDIR /app

# System optimizations for performance
RUN echo 'vm.max_map_count=262144' >> /etc/sysctl.conf && \
    echo 'net.core.somaxconn=65535' >> /etc/sysctl.conf && \
    echo 'net.ipv4.tcp_max_syn_backlog=65535' >> /etc/sysctl.conf

# Create non-root user with optimized limits
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    echo "nodejs soft nofile 65536" >> /etc/security/limits.conf && \
    echo "nodejs hard nofile 65536" >> /etc/security/limits.conf

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/email-templates ./email-templates

# Create uploads directory
RUN mkdir -p uploads && chown -R nodejs:nodejs uploads

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Optimized health check with proper timeout and monitoring
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "
    const start = Date.now();
    require('http').get('http://localhost:5000/api/health', (res) => {
      console.log(\`Health check: \${res.statusCode} (\${Date.now() - start}ms)\`);
      process.exit(res.statusCode === 200 ? 0 : 1);
    }).on('error', () => process.exit(1));
    " || exit 1

# Set environment variables for Node.js optimization
ENV NODE_OPTIONS="--max-old-space-size=1024 --optimize-for-size"
ENV UV_THREADPOOL_SIZE=8

# Start the application with monitoring
CMD ["node", "dist/server/index.js"]
