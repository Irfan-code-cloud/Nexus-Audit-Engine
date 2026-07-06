# Use explicit 3.11 image
FROM python:3.11-slim

# Set the working directory
WORKDIR /app

# Force a cache bust by adding a dummy build argument
ARG CACHEBUST=1

# Install system dependencies
RUN apt-get update && apt-get install -y build-essential curl && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Upgrade pip FIRST to ensure it can read modern version requirements
RUN pip install --upgrade pip

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]