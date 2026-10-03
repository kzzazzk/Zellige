# Build the React landing, then serve only its static output.
FROM node:24-alpine AS build
WORKDIR /src/marketing
COPY marketing/package.json marketing/package-lock.json ./
RUN npm ci
COPY marketing/ ./
RUN npm run build

FROM caddy:2.11.2-alpine
# Port 8080 needs no privileged-port capability. Clear the base binary's file
# capability so it remains executable with cap_drop: ALL and a non-root user.
RUN setcap -r /usr/bin/caddy
COPY deploy/marketing.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/marketing/dist/ /srv/
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
