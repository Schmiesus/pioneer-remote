# Pioneer VSX Web Remote

A self-hosted web remote for legacy Pioneer VSX receivers — runs in Docker, connects over Telnet, works on any browser or as a PWA. Material Design 3 interface with full Home Assistant integration. Built for receivers too old for modern apps.

## Features

- Works with Pioneer VSX receivers that support IP/Telnet control (most models 2010+)
- **Material Design 3** interface — installable as a PWA on Android/iOS
- **Home Assistant integration** via MQTT auto-discovery — no YAML needed
- **Multiple browser tabs** supported simultaneously (single shared TCP connection)
- Full controls: Power, Volume, Input, Zone 2, Tone/EQ, Listening Modes, Navigation
- 5 built-in themes (Material, Ocean, Rose, Forest, Amber)
- Auto-reconnects if the receiver drops the connection

## Quick Start

### 1. Find your receiver's IP and Telnet port
Check your router's DHCP list or the receiver's network menu. Most VSX models use port **23**; some older ones (e.g. VSX-1020) use **8102**.

### 2. Enable Network Standby
`System Setup → Network → Network Standby → ON`

### 3. Run with Docker

```bash
docker run -d \
  --name pioneer-remote \
  --restart unless-stopped \
  -p 8088:8088 \
  -e RECEIVER_HOST=192.168.1.100 \
  -e RECEIVER_PORT=23 \
  YOURUSERNAME/pioneer-remote:latest
```

Open `http://YOUR-SERVER-IP:8088`.

## Home Assistant Integration

Set these extra environment variables to enable MQTT:

```
MQTT_HOST=192.168.1.70
MQTT_PORT=1883
MQTT_USER=youruser
MQTT_PASS=yourpass
```

Entities appear automatically in Home Assistant via MQTT discovery:

| Entity | Type |
|--------|------|
| `switch.pioneer_power` | Power on/off |
| `number.pioneer_volume` | Volume (0-185) |
| `switch.pioneer_mute` | Mute on/off |
| `select.pioneer_input` | Input source |
| `sensor.pioneer_volume_db` | Volume in dB |
| `switch.pioneer_zone_2_power` | Zone 2 power |
| `number.pioneer_zone_2_volume` | Zone 2 volume |

## Tested Receivers

| Model | Port | Notes |
|-------|------|-------|
| VSX-1020 | 8102 | Confirmed. Uses MO/MF for mute (not MZ) |
| VSX-1021 | 23 | Standard Telnet |
| VSX-1121 | 23 | Standard Telnet |

## Troubleshooting

**Can't connect?** — Check Network Standby is ON, ping the receiver, check router AP isolation.

**Wrong port?** — VSX-1020 and some older models use **8102**.

**Mute not working?** — Older models use MO (on) / MF (off) instead of MZ toggle. This app handles that automatically.

## License

MIT
