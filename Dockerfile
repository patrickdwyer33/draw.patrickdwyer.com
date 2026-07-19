# ---- build client ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build           # vite build client -> client/dist

# ---- serve ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev  # express + aws-sdk; no vite, no native modules
COPY server ./server
COPY shared ./shared
COPY --from=build /app/client/dist ./client/dist
EXPOSE 3000
CMD ["node", "server/index.js"]
