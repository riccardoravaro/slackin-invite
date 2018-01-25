FROM node:slim

COPY . slackin

ENTRYPOINT ["sh", "slackin/scripts/run_server.sh"]
