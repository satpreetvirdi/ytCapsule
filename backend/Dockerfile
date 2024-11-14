FROM node:18 as frontend

RUN apt update && apt install -y python3 python3-venv curl


RUN python3 -m venv /opt/venv

RUN /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install yt-dlp


ENV PATH="/opt/venv/bin:$PATH"

RUN apt install -y ffmpeg

WORKDIR /app
COPY . .


RUN npm install

EXPOSE 5000

CMD ["node", "server.js"]
