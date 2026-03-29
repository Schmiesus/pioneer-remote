# Pioneer VSX Web Remote

A self-hosted web remote for legacy Pioneer VSX receivers — runs in Docker, connects over Telnet, works on any browser or as a PWA. Built for receivers too old for modern apps.

## Features

- Works with Pioneer VSX receivers that support IP/Telnet control (most models 2010+)
- Installable as a **PWA** — add to home screen on Android/iOS
- **Multiple browser tabs** supported simultaneously (single shared TCP connection)
- Full controls: Power, Volume, Input Select, Zone 2, Tone/EQ, Listening Modes, Navigation
- 5 built-in themes: Punk, Classic, Matrix, Ocean, Blaze
- Auto-reconnects if the receiver drops the connection

## Quick Start

### 1. Find your receiver's IP
Check your router's DHCP client list, or on the receiver: `System Setup → Network → IP Address`

### 2. Find your Telnet port
Most VSX models use **23**. Some older models (e.g. VSX-1020) use **8102**. Check your manual or the app that previously worked.

### 3. Enable Network Standby
`System Setup → Network → Network Standby → ON` — without this the receiver refuses connections in standby.

### 4. Run with Docker

```bash
docker run -d \
  --name pioneer-remote \
  --restart unless-stopped \
  -p 8088:8088 \
  -e RECEIVER_HOST=192.168.1.100 \
  -e RECEIVER_PORT=23 \
  ghcr.io/schmiesus/pioneer-remote:latest
```

Open `http://YOUR-SERVER-IP:8088` in any browser.

### Or with docker-compose

```bash
git clone https://github.com/schmiesus/pioneer-remote.git
cd pioneer-remote
```

Edit `docker-compose.yml` — set `RECEIVER_HOST` and `RECEIVER_PORT`, then:

```bash
docker-compose up -d
```

### Configure via UI

If you don't set `RECEIVER_HOST`, the app prompts you to enter the IP and port in the **⚙ Settings** tab.

## Unraid

1. Copy project to `/mnt/user/appdata/pioneer-remote/`
2. `docker build -t pioneer-remote:latest .`
3. Docker tab → Add Container → set port `8088:8088` and env vars `RECEIVER_HOST` / `RECEIVER_PORT`

## Tested Receivers

| Model | Port | Notes |
|-------|------|-------|
| VSX-1020 | 8102 | Confirmed working |
| VSX-1021 | 23 | Standard Telnet |
| VSX-1121 | 23 | Standard Telnet |
| VSX-923  | 23 | Standard Telnet |

If your model works, open an issue or PR to add it to the list!

## Troubleshooting

**Can't connect?** — Check Network Standby is ON, ping the receiver IP from your server, check router AP isolation settings.

**Wrong port?** — VSX-1020 and some older models use **8102** instead of 23.

**Commands not working?** — Not every command is supported on every model. Check your receiver's IP Control spec.

## License

MIT
