# Build
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm set strict-ssl false
RUN npm ci --ignore-scripts
COPY . .
RUN npm run prod-build

# Caddy to host static files
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

# Set permissions for static files (OpenShift-compatible)
# OpenShift uses random UIDs but assigns them to root group (GID 0)
# Set ownership to user 1001 with root group, and readable permissions
RUN chown -R 1001:0 /srv && \
  chmod -R 755 /srv

# Verify Caddufile Syntax
RUN caddy fmt /etc/caddy/Caddyfile

# Nonroot user
USER 1001

# Boilerplate, not used in OpenShift/Kubernetes
EXPOSE 3000 3001
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:3001/health

# CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
