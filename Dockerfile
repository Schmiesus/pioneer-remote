FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY src/ ./src/
COPY public/ ./public/

EXPOSE 8088

# Optional: pre-configure receiver IP via env var
# ENV RECEIVER_HOST=192.168.1.100
# ENV RECEIVER_PORT=23

CMD ["node", "src/server.js"]
