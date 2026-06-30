FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=5173

EXPOSE 5173

CMD ["node", "server.js"]
