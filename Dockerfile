FROM node:22-alpine

ENV PORT=8012

WORKDIR /usr/src/app

COPY package.json ./
RUN npm install

COPY server.js ./

EXPOSE ${PORT}

CMD ["node", "server.js"]