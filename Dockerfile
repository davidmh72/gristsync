# === BUILDER STAGE ===
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Install ALL dependencies (including devDependencies like typescript) for building
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# === RUNNER STAGE ===
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# Install only production dependencies for the runtime container
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
