FROM node:20-alpine

WORKDIR /app

# Everything (including express) is already bundled into dist/server.js by
# `npm run build` on the Jenkins agent, so there is nothing to install here.
COPY dist/ ./dist/

# esbuild does not bundle static assets, and __dirname inside the bundle points
# at the bundle's own directory, so public/ has to sit next to dist/server.js.
COPY public ./dist/public

ENV PORT=3000
ENV DEPLOY_HISTORY_PATH=/data/deploy-history.json

RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
