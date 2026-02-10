FROM node:22-bookworm-slim

# Install system dependencies
# ghostscript: for PDF conversion
# poppler-utils: for PDF to Image (pdftoppm)
# procps: for ps command (optional debugging)
RUN apt-get update && apt-get install -y ghostscript poppler-utils procps && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Build UI
RUN npm run build:ui

# Build Backend/CLI
RUN npm run build

# Expose port
EXPOSE 3000

# Start server
ENTRYPOINT ["node", "dist/server/index.js"]
