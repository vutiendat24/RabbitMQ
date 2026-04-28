FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy all source code
COPY . .

# Default command (will be overridden by docker-compose)
CMD ["npm", "run", "start:dev"]
