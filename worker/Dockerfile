FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
RUN npx prisma generate
COPY src/lib ./src/lib
COPY src/config ./src/config
COPY worker ./worker
USER node
ENV NODE_ENV=production
CMD ["npm", "run", "worker"]
