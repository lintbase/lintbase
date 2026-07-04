FROM node:20-alpine
RUN npm install -g lintbase-mcp@0.2.0
ENTRYPOINT ["lintbase-mcp"]
