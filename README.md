services:
  pioneer-remote:
    build: .
    image: pioneer-remote:latest
    container_name: pioneer-remote
    restart: unless-stopped
    ports:
      - "8088:8088"
    environment:
      # Set your receiver's IP and Telnet port here
      - RECEIVER_HOST=192.168.1.100
      - RECEIVER_PORT=23
      - PORT=8088
    network_mode: bridge
