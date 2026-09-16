FROM node:22-alpine

WORKDIR /app

COPY server.js ./
COPY public ./public
COPY seed ./seed

RUN mkdir -p /data/packs \
  && chown -R node:node /app /data

USER node
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000

CMD ["node", "server.js"]
