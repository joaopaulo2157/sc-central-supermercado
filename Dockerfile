FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    SC_STORAGE_DIR=/app/storage

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public

RUN mkdir -p /app/storage/uploads

EXPOSE 3000

VOLUME ["/app/storage"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
