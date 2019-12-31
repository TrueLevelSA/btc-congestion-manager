FROM node:10-alpine AS ts-sample-builder
WORKDIR /app
COPY . .
RUN npm install --silent
RUN npm run build

# Our Second stage, that creates an image for production
FROM node:10-alpine AS ts-sample-prod
WORKDIR /app
COPY --from=ts-sample-builder ./app/dist ./dist
COPY package* ./
RUN npm install --production --silent
CMD npm run start
