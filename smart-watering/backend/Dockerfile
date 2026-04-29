# Use a small Python image for the FastAPI backend container.
FROM python:3.12-slim

# Keep Python output visible in Docker logs and avoid .pyc files in the image.
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# All backend files live under /app inside the container.
WORKDIR /app

# Install Python dependencies before copying source for better Docker layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the FastAPI application source.
COPY app ./app

# Expose the FastAPI port used by uvicorn.
EXPOSE 8000

# Start FastAPI and listen on all interfaces so Docker can publish the port.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
