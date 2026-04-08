# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Build-time args — pass these with --build-arg or via docker-compose build.args
# Defaults mirror .env so a plain `docker build .` still works locally.
ARG VITE_NAKAMA_HOST=decamint-ticbe-5r88tk-d69fe9-98-70-43-196.traefik.me
ARG VITE_NAKAMA_PORT=443
ARG VITE_NAKAMA_USE_SSL=true
ARG VITE_NAKAMA_BASIC_AUTH=Basic ZGVmYXVsdGtleTo=
ARG VITE_NAKAMA_TOKEN_KEY=nakama_token
ARG VITE_NAKAMA_REFRESH_KEY=nakama_refresh_token

# Expose them as ENV so Vite picks them up during `npm run build`
ENV VITE_NAKAMA_HOST=$VITE_NAKAMA_HOST
ENV VITE_NAKAMA_PORT=$VITE_NAKAMA_PORT
ENV VITE_NAKAMA_USE_SSL=$VITE_NAKAMA_USE_SSL
ENV VITE_NAKAMA_BASIC_AUTH=$VITE_NAKAMA_BASIC_AUTH
ENV VITE_NAKAMA_TOKEN_KEY=$VITE_NAKAMA_TOKEN_KEY
ENV VITE_NAKAMA_REFRESH_KEY=$VITE_NAKAMA_REFRESH_KEY

# Install dependencies (cached layer)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ─── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM nginx:stable-alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing: unknown paths fall back to index.html
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
