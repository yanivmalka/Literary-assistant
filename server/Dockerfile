FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --ignore-scripts

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc

# Run
ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/index.js"]
