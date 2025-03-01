FROM node:18.20.7-bookworm AS builder

ARG NODE_ENV=production

WORKDIR /misskey

COPY . ./

RUN apt-get update
RUN apt-get install -y build-essential
RUN git submodule update --init
RUN yarn install
RUN yarn build
RUN rm -rf .git

FROM node:18.20.7-bookworm-slim AS runner

WORKDIR /misskey

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
	ffmpeg tini curl libjemalloc-dev libjemalloc2 \
	&& ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists

COPY --from=builder /misskey/node_modules ./node_modules
COPY --from=builder /misskey/built ./built
COPY --from=builder /misskey/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=builder /misskey/packages/backend/built ./packages/backend/built
COPY --from=builder /misskey/packages/client/node_modules ./packages/client/node_modules
COPY . ./

ENV LD_PRELOAD=/usr/local/lib/libjemalloc.so
ENV NODE_ENV=production
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "migrateandstart"]
