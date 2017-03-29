FROM node:slim

ENV PORT 3000

ADD . /srv/www

WORKDIR /srv/www

RUN npm install --unsafe-perm

EXPOSE 3000

CMD ./bin/slackin $SLACK_SUBDOMAIN $SLACK_API_TOKEN
