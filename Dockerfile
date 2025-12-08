# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files first for better caching
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci --no-audit --no-fund

# Copy frontend source
COPY frontend/ ./

# Build the React app
RUN npm run build

# Stage 2: Python application
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including net-tools for health checks and tzdata for timezone support
RUN apt-get update && apt-get install -y --no-install-recommends \
    net-tools \
    curl \
    wget \
    nano \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Install required packages from the root requirements file
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . /app/

# Copy built React assets from frontend builder
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Create necessary directories
# Log files are now stored in database only
RUN mkdir -p /config && chmod -R 755 /config

# Set environment variables
ENV PYTHONPATH=/app
ENV TZ=UTC

# Expose port
EXPOSE 9705

# Add health check for Docker
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:9705/health || exit 1

# Run the main application using the new entry point
CMD ["python3", "main.py"]
