# Build with reviewed image digests in the release environment when promoting a release.
ARG NODE_IMAGE=node:24-alpine
ARG NGINX_IMAGE=nginx:stable-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM ${NGINX_IMAGE} AS runtime
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY deploy/nginx.conf.template /opt/apcosys/nginx.conf.template
COPY deploy/proxy-common.conf /etc/nginx/apcosys/proxy-common.conf
COPY deploy/15-apcosys-runtime.sh /docker-entrypoint.d/15-apcosys-runtime.sh
RUN chmod 755 /docker-entrypoint.d/15-apcosys-runtime.sh
ENV APCOSYS_PUBLIC_SCHEME=https
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

