FROM nginx:1.17.2
MAINTAINER Claus Stadler <cstadler@informatik.uni-leipzig.de>

FROM nginx
#COPY wikidata-visualization/build/ /usr/share/nginx/html
COPY wikidata-visualization/build/ /usr/share/nginx/html/dataviz

COPY default.conf /etc/nginx/conf.d/default.conf
#COPY default /etc/nginx/sites-available/default

COPY start.sh ./start.sh
RUN chmod +x ./start.sh && sleep 1
ENTRYPOINT ./start.sh

