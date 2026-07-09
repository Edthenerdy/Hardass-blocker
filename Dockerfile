# Deadbolt / Hardass Blocker server — zero-dependency Node app.
FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=8787
ENV DATA_DIR=/data
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "server/server.js"]
