FROM nginx
MAINTAINER Claus Stadler <cstadler@informatik.uni-leipzig.de>

FROM nginx
#COPY wikidata-visualization/build/ /usr/share/nginx/html
COPY wikidata-visualization/build/ /var/www/html/dataviz

COPY default /etc/nginx/sites-available/default

COPY start.sh ./start.sh
RUN chmod +x ./start.sh && sleep 1
ENTRYPOINT ./start.sh

