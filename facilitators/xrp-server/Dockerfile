# Use Python 3.12 slim image
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the facilitator code and x402 source
COPY . ./facilitator

# Set environment variables - add facilitator to Python path
ENV PYTHONPATH=/app/facilitator:$PYTHONPATH
ENV PORT=8080
ENV XRP_NETWORK=xrp-testnet

# Expose the port
EXPOSE 8080

# Change to facilitator directory
WORKDIR /app/facilitator

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/ || exit 1

# Run the application
CMD ["python", "main.py"]