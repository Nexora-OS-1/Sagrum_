FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production DATA_DIR=/var/data/data UPLOAD_DIR=/var/data/uploads
VOLUME ["/var/data"]
EXPOSE 3000
CMD ["npm", "start"]
