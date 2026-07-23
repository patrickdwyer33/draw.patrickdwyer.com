# ---- build client ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# npm ci, not install: installs the committed lock EXACTLY, so a CI image is
# byte-identical to a local build of the same commit. It needs the lock to carry
# this platform's native rollup/esbuild binaries — alpine is musl, so the lock
# pins @rollup/rollup-linux-x64-musl via optionalDependencies in package.json.
RUN npm ci
COPY . .
RUN npm run build           # vite build client -> client/dist

# ---- serve ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# --omit=optional too: the rollup/esbuild native binaries are build-time only, so
# the runtime image skips them. --omit=dev drops vite; ci still validates the lock.
RUN npm ci --omit=dev --omit=optional  # express + aws-sdk only
COPY server ./server
COPY shared ./shared
COPY --from=build /app/client/dist ./client/dist
EXPOSE 3000
CMD ["node", "server/index.js"]
