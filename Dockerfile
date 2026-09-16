FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache su-exec \
  && mkdir -p /data/packs

COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY server.js ./
COPY public ./public
COPY seed ./seed

RUN sed -i 's/\r$//' /docker-entrypoint.sh \
  && chmod +x /docker-entrypoint.sh \
  && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
ENV PUID=1000
ENV PGID=1000

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
