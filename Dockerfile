FROM node:20-alpine

WORKDIR /app

COPY . .

# Direktori penyimpanan konfigurasi bersama antar perangkat
RUN mkdir -p /data

EXPOSE 80

CMD ["node", "server.js"]
