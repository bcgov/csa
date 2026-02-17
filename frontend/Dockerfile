# ---------- Build static assets ----------
FROM node:24-slim AS build
WORKDIR /app

# Install deps (requires package-lock.json to be in sync)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run prod-build


# ---------- Build Caddy with Coraza plugin ----------
FROM caddy:2.10.2-builder AS caddy-builder
RUN apk add --no-cache ca-certificates git
RUN xcaddy build \
  --with github.com/corazawaf/coraza-caddy/v2


# ---------- Runtime (OpenShift) ----------
FROM caddy:2.10.2-alpine

# Tools to remove file capabilities (fixes "Operation not permitted" on some OpenShift clusters)
RUN apk add --no-cache ca-certificates libcap

# Copy custom caddy binary + strip file capabilities (Caddy often ships with cap_net_bind_service)
COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy
RUN setcap -r /usr/bin/caddy \
  && apk del libcap \
  && rm -rf /var/cache/apk/*

# Copy site + config
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
COPY coraza.conf /etc/caddy/coraza.conf
COPY inject-env.sh /usr/local/bin/inject-env.sh

# Make the injection script executable
RUN chmod +x /usr/local/bin/inject-env.sh

# OpenShift random UID compatibility:
# - OpenShift runs with random UID and typically GID 0
# - Make runtime dirs group-owned by 0 and group-writable
RUN mkdir -p /data /config /tmp/coraza /runtime-config \
  && chgrp -R 0 /srv /etc/caddy /data /config /tmp /runtime-config \
  && chmod -R g=u /srv /etc/caddy /data /config /tmp /runtime-config \
  && chmod 0755 /usr/bin/caddy

# Validate/format Caddyfile at build time
RUN caddy fmt --overwrite /etc/caddy/Caddyfile

# Non-root (OpenShift will often override to a random UID anyway)
USER 1001

# Use the injection script as the entrypoint
ENTRYPOINT ["/usr/local/bin/inject-env.sh"]

EXPOSE 3000 3001

# Run explicitly (don’t rely on image entrypoint)
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
