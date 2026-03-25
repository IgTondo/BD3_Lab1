FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY index.html ./
COPY src ./src
COPY vite.config.js ./

EXPOSE 5173

CMD ["npm", "run", "dev"]
