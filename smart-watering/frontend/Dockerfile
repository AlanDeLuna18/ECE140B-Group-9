# Build a lightweight development image for the Next.js dashboard.
FROM node:22-alpine

# Keep frontend files in /app inside the container.
WORKDIR /app

# Install dependencies before copying source for better Docker layer caching.
COPY package.json ./
RUN npm install

# Copy the Next.js application source.
COPY . .

# Expose the Next.js development server port.
EXPOSE 3000

# Listen on all interfaces so Docker can publish the dashboard at localhost:3000.
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0"]
