#!/bin/bash

echo "Using SPARQL endpoint: ${ENDPOINT_URL}"

FILE=`grep -Rail 'http://localhost:7531/sparql' /usr/share/nginx/html/dataviz/static/js | grep js$`
if [ -f "$FILE" ]; then
  echo "Replacing endpoint in file $FILE"
  sed -i 's|http://localhost:7531/sparql|${ENDPOINT_URL}|g' "$FILE"
else 
  echo "Found nothing to replace"
fi


nginx -g 'daemon off;'

