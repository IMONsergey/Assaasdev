#!/bin/sh
set -eu

# This origin belongs to the existing APCOSYS backend. No credential is accepted here.
: "${APCOSYS_API_UPSTREAM:?Set APCOSYS_API_UPSTREAM to the existing HTTP(S) API origin}"
case "$APCOSYS_API_UPSTREAM" in
  *[!a-zA-Z0-9.:/-]*) printf '%s\n' 'APCOSYS_API_UPSTREAM contains unsupported characters.' >&2; exit 1 ;;
esac
if ! printf '%s' "$APCOSYS_API_UPSTREAM" | grep -Eq '^https?://[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?$'; then
  printf '%s\n' 'APCOSYS_API_UPSTREAM must be an HTTP(S) origin without a path, credentials, query or trailing slash.' >&2
  exit 1
fi
apcosys_authority=${APCOSYS_API_UPSTREAM#*://}
APCOSYS_TLS_NAME=${apcosys_authority%%:*}
case "$apcosys_authority" in
  *:*) apcosys_port=${apcosys_authority##*:}; [ "$apcosys_port" -ge 1 ] && [ "$apcosys_port" -le 65535 ] || { printf '%s\n' 'Invalid upstream port.' >&2; exit 1; } ;;
esac
APCOSYS_API_HOST=${APCOSYS_API_HOST:-$apcosys_authority}
if ! printf '%s' "$APCOSYS_API_HOST" | grep -Eq '^[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?$'; then
  printf '%s\n' 'APCOSYS_API_HOST must be a hostname with an optional port.' >&2
  exit 1
fi
APCOSYS_PUBLIC_SCHEME=${APCOSYS_PUBLIC_SCHEME:-https}
case "$APCOSYS_PUBLIC_SCHEME" in
  https) APCOSYS_WS_SCHEME=wss ;;
  http) APCOSYS_WS_SCHEME=ws ;;
  *) printf '%s\n' 'APCOSYS_PUBLIC_SCHEME must be https or http.' >&2; exit 1 ;;
esac
export APCOSYS_API_UPSTREAM APCOSYS_API_HOST APCOSYS_TLS_NAME APCOSYS_PUBLIC_SCHEME APCOSYS_WS_SCHEME

# Substitute only known validated variables. Preserve Nginx's $uri, $host, etc.
envsubst '${APCOSYS_API_UPSTREAM} ${APCOSYS_API_HOST} ${APCOSYS_TLS_NAME} ${APCOSYS_PUBLIC_SCHEME} ${APCOSYS_WS_SCHEME}' \
  < /opt/apcosys/nginx.conf.template > /etc/nginx/conf.d/default.conf
cat > /usr/share/nginx/html/runtime-config.js <<'CONFIG'
window.__APCOSYS_CONFIG__ = { apiBaseUrl: '/backend/', dataMode: 'live', basePath: '/' };
CONFIG
nginx -t

