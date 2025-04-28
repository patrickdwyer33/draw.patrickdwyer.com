FROM ubuntu:22.04

RUN apt-get update && apt-get install -y curl

RUN curl -sL https://deb.nodesource.com/setup_22.x | bash

RUN apt-get install -y nodejs

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 3000

CMD ["node", "server/index.js"]