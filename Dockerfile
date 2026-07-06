# Official Puppeteer image: Chrome + all system deps pre-installed & configured.
FROM ghcr.io/puppeteer/puppeteer:23.11.1

USER root

# Bengali font so the ৳ (taka) sign renders instead of tofu
RUN apt-get update && apt-get install -y --no-install-recommends fonts-lohit-beng-bengali \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
RUN chown -R pptruser:pptruser /app
USER pptruser

ENV NODE_ENV=production
CMD ["node", "server.js"]
