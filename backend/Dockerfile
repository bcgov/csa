# Build - compile TypeScript
FROM node:24-slim AS build
WORKDIR /app
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production Dependencies
FROM node:24-slim AS dependencies
WORKDIR /app
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
COPY package*.json ./
RUN echo "Production Dependencies"
RUN npm ci --omit=dev

# Production Stage - Copy app and dependencies
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist

# Boilerplate, not used in OpenShift/Kubernetes
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:3000/api

# Nonroot user, limit heap size to 50 MB
#RUN chown -R 1001:0 /app && chmod -R g=u /app
USER 1001
CMD ["node", "--max-old-space-size=50", "dist/api/main"]
