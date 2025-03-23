FROM node:latest
LABEL authors="Daniel Wu"

COPY . /cloudflare-bili-sub2ass
WORKDIR /cloudflare-bili-sub2ass
RUN npm install

ENTRYPOINT ["npm", "run", "dev", "--", "--log-level", "warn", "--ip", "*", "--port", "8080"]
