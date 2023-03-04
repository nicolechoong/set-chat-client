FROM ubuntu:20.04
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install build-essential -y
RUN apt-get install curl -y 
RUN curl -sL https://deb.nodesource.com/setup_16.x  | bash -
RUN apt-get install nodejs -y
RUN mkdir /myvol
WORKDIR /myvol/test/c