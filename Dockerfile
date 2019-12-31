FROM node:10-alpine AS ts-sample-builder
WORKDIR /app
COPY . .
RUN apk add --no-cache --virtual .build-deps make gcc g++ python \
 && npm install --silent \
 && apk del .build-deps
RUN npm run build

# Our Second stage, that creates an image for production
FROM node:10-alpine AS ts-sample-prod
WORKDIR /app
COPY --from=ts-sample-builder ./app/dist ./dist
COPY package* ./
RUN apk add --no-cache --virtual .build-deps make gcc g++ python \
 && npm install --production --silent \
 && apk del .build-deps
CMD npm start
