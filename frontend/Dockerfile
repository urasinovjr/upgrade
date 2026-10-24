FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

COPY . .
RUN npm run build:server

FROM nginxinc/nginx-unprivileged:1.29-alpine AS app

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

FROM app AS production

COPY nginx.production.conf /etc/nginx/nginx.conf
COPY security-headers.conf /etc/nginx/security-headers.conf

FROM app
