# Node 20 on Alpine: the panel needs nothing outside npm, and a smaller image
# means less to keep patched on a server that is also hosting other things.
FROM node:20-alpine

# The app directory is owned by the unprivileged `node` user that ships with
# this image. The panel holds a credential that administers the whole Firebase
# project, so it does not run as root.
WORKDIR /app

# Dependencies are installed from the lockfile in their own layer, so a change
# to server.js does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js keys.js ./
COPY public ./public

USER node

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
