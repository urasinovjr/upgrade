FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN --mount=type=cache,id=upgrade-npm,target=/root/.npm npm ci

COPY . .
RUN npm run build:server

FROM nginx/nginx-unprivileged:1.30.6-alpine@sha256:c3fc8fa482be50ef709c6438eb1bc98d50dbfe5a9b48be90711b8814f4dfd701 AS app

USER root
RUN apk add --no-cache --upgrade libxslt=1.1.43-r4
USER 101

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

FROM app AS production

COPY nginx.production.conf /etc/nginx/nginx.conf
COPY security-headers.conf /etc/nginx/security-headers.conf

FROM app
