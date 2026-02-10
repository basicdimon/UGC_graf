# Use Node.js LTS (Bookworm slim for smaller size but with glibc)
FROM node:22-bookworm-slim

# Install system dependencies for image processing
# ghostscript: for PDF/EPS/AI rendering
# poppler-utils: for pdftoppm (alternative PDF rendering)
# libvips-dev: optional, but sharp usually brings its own
# procps: for process monitoring if needed
RUN apt-get update && apt-get install -y \
    ghostscript \
    poppler-utils \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Entrypoint for the CLI
ENTRYPOINT ["node", "dist/cli/index.js"]
CMD ["info"]
