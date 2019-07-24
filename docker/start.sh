#!/bin/bash

echo "Using SPARQL endpoint: ${ENDPOINT_URL}"
#sed -i 's|http://localhost:7531/sparql|${ENDPOINT_URL}|g' /usr/share/nginx/html/static/js/main.146575d0.js


FILE=`grep -Rail localhost:7531/sparql /var/www/html/dataviz/static/js | grep js$`
echo "Replacing endpoint in file $FILE"

sed -i 's|http://localhost:7531/sparql|${ENDPOINT_URL}|g' "$FILE"

nginx

