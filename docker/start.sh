#!/bin/bash

echo "Using SPARQL endpoint: ${ENDPOINT_URL}"
#sed -i 's|http://localhost:7531/sparql|${ENDPOINT_URL}|g' /usr/share/nginx/html/static/js/main.146575d0.js
sed -i 's|http://localhost:7531/sparql|${ENDPOINT_URL}|g' /var/www/html/dataviz/static/js/main.146575d0.js

nginx

