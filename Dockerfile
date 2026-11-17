FROM node:24-bookworm-slim
WORKDIR /app
COPY *.mjs catalog.ts styles.css package.json ./
COPY drizzle/ drizzle/
COPY vendor/ vendor/
COPY .openai/hosting.json .openai/hosting.json
RUN node build.mjs && mkdir /data && chown node:node /data
USER node
ENV LISTEN_HOST=0.0.0.0 PORT=8080 DEMO_DB_PATH=/data/demo.sqlite
EXPOSE 8080
CMD ["node", "standalone.mjs"]
