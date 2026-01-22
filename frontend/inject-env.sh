#!/bin/sh

# This script starts the Caddy web server
# Runtime configuration is provided by the ConfigMap mounted at /runtime-config/config.json
# and must be accessible at /config.json via Caddy

set -e

echo "Starting Caddy web server..."
echo "Runtime configuration should be available at /config.json"

# Start Caddy
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
