# ---------- Build static assets ----------
FROM node:24-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run prod-build


# ---------- Build Caddy with Coraza plugin ----------
FROM caddy:2.10.2-builder AS caddy-builder
RUN apk add --no-cache ca-certificates git
RUN xcaddy build \
  --with github.com/corazawaf/coraza-caddy/v2


# ---------- Runtime ----------
FROM caddy:2.10.2-alpine

# Copy custom caddy binary
COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy

# Copy site + config
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
COPY coraza.conf /etc/caddy/coraza.conf

# OpenShift random UID compatibility:
# - OpenShift assigns random UID but GID 0 (root group)
# - Make writable paths group-writable and group-owned by 0
RUN chgrp -R 0 /srv /etc/caddy /data /config /tmp && \
  chmod -R g=u /srv /etc/caddy /data /config /tmp && \
  chmod 0755 /usr/bin/caddy

# Optional: validate Caddyfile syntax at build time
RUN caddy fmt --overwrite /etc/caddy/Caddyfile

USER 1001

EXPOSE 3000 3001

# IMPORTANT: run explicitly (don’t rely on image entrypoint)
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]