# The Routing module's image: `routing serve` by default; the Scheduler and the Operator's commands
# run the same image (cube/compose.yaml). The base is the one the public core's image uses.
FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68

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
# The blob root is where the core image has it, owned by the same user (uid 1000), so that the
# shared volume belongs to that user whichever container mounts it first.
RUN printf '#!/bin/sh\ncd /app && exec node --import tsx src/main.ts "$@"\n' > /usr/local/bin/routing \
  && chmod +x /usr/local/bin/routing \
  && mkdir -p /var/lib/family-agenda/blobs \
  && chown node:node /var/lib/family-agenda/blobs \
  && chmod 700 /var/lib/family-agenda/blobs

USER node
EXPOSE 8080
CMD ["routing", "serve"]
