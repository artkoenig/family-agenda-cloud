# The Routing module's image: `routing serve` by default; the Scheduler and the Operator's commands
# run the same image (cube/compose.yaml). The base is the one the public core's image uses.
FROM node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1

ENV NODE_ENV=production
# Node.js has not shipped Corepack since version 25, so it comes from npm. It reads the pnpm version
# from the packageManager field of package.json.
RUN npm install --global corepack@0.36.0 && corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY tsconfig.json ./
COPY src ./src

# `routing <command>` from anywhere, such as `docker compose exec router routing families`.
RUN printf '#!/bin/sh\ncd /app && exec node --import tsx src/main.ts "$@"\n' > /usr/local/bin/routing \
  && chmod +x /usr/local/bin/routing

# The core image's user (uid 1000), to whom the mounted bucket of the Families' blobs belongs
# (cube/compose.yaml), so that `routing delete` can remove a Family's blobs.
USER node
EXPOSE 8080
CMD ["routing", "serve"]
