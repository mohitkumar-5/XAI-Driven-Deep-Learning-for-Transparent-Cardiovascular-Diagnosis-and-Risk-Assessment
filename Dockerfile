# Production Dockerfile for DeepCardio-XAI
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

WORKDIR /app

# Install essential build packages for native dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy production application files
COPY AI ./AI
COPY static ./static
COPY templates ./templates
COPY frontend/dist ./frontend/dist
COPY main.py .
COPY .env .

EXPOSE 8000

CMD ["python", "main.py"]
