services:
  pioneer-remote:
    build: .
    image: pioneer-remote:latest
    container_name: pioneer-remote
    restart: unless-stopped
    ports:
      - "8088:8088"
    environment:
      # Optional: override receiver IP/port (defaults are already baked in)
      # - RECEIVER_HOST=10.0.1.23
      # - RECEIVER_PORT=8102
      - PORT=8088
    network_mode: bridge
