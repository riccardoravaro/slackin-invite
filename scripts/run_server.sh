echo "==== Installing NPM libraries ===="
cd slackin && npm install
echo "==== Running slackin ===="
echo "SUBDOMAIN: $SLACK_SUBDOMAIN"
echo "API TOKEN: $SLACK_API_TOKEN"
cd ..
slackin/bin/slackin --port 5000 $SLACK_SUBDOMAIN $SLACK_API_TOKEN
