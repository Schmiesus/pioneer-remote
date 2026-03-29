const express    = require('express');
const { WebSocketServer } = require('ws');
const net        = require('net');
const dgram      = require('dgram');
const http       = require('http');
const path       = require('path');
const mqtt       = require('mqtt');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// ── Config ────────────────────────────────────────────────────────────────────
let receiverConfig = {
  host: process.env.RECEIVER_HOST || '',
  port: parseInt(process.env.RECEIVER_PORT || '23'),
};

const mqttConfig = {
  host:     process.env.MQTT_HOST     || '',
  port:     parseInt(process.env.MQTT_PORT || '1883'),
  username: process.env.MQTT_USER     || '',
  password: process.env.MQTT_PASS     || '',
};

const MQTT_PREFIX    = 'pioneer';
const MQTT_CMD_TOPIC = `${MQTT_PREFIX}/command`;
const MQTT_AVAIL     = `${MQTT_PREFIX}/availability`;

app.get('/api/config', (req, res) => {
  res.json({ host: receiverConfig.host, port: receiverConfig.port });
});
app.post('/api/config', (req, res) => {
  const { host, port } = req.body;
  if (host) receiverConfig.host = host;
  if (port) receiverConfig.port = parseInt(port);
  res.json({ ok: true });
});

// ── Receiver state ────────────────────────────────────────────────────────────
const state = {
  power: 'OFF', volume: 0, volumeDb: '---', muted: false,
  input: '--', listeningMode: '--',
  zone2Power: 'OFF', zone2Volume: 0, zone2Input: '--',
};

const INPUT_NAMES = {
  '00':'PHONO','01':'CD','02':'TUNER','03':'CD-R','04':'DVD','05':'TV/SAT',
  '10':'VIDEO 1','14':'VIDEO 2','15':'DVR/BDR','19':'HDMI 1','20':'HDMI 2',
  '21':'HDMI 3','22':'HDMI 4','23':'HDMI 5','25':'BD','26':'NET',
  '38':'INET RADIO','41':'PANDORA','44':'MEDIA SRV',
};
const INPUT_CODES = Object.fromEntries(Object.entries(INPUT_NAMES).map(([k,v])=>[v,k]));

// ════════════════════════════════════════════════════════════════════════════
// MQTT
// ════════════════════════════════════════════════════════════════════════════
let mqttClient = null;

function mqttPublish(topic, payload, opts = {}) {
  if (!mqttClient || !mqttClient.connected) return;
  const pl = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
  mqttClient.publish(topic, pl, { retain: true, ...opts });
}

function publishState() {
  mqttPublish(`${MQTT_PREFIX}/state/power`,        state.power);
  mqttPublish(`${MQTT_PREFIX}/state/volume`,       state.volume);
  mqttPublish(`${MQTT_PREFIX}/state/volume_db`,    state.volumeDb);
  mqttPublish(`${MQTT_PREFIX}/state/mute`,         state.muted ? 'ON' : 'OFF');
  mqttPublish(`${MQTT_PREFIX}/state/input`,        state.input);
  mqttPublish(`${MQTT_PREFIX}/state/mode`,         state.listeningMode);
  mqttPublish(`${MQTT_PREFIX}/state/zone2_power`,  state.zone2Power);
  mqttPublish(`${MQTT_PREFIX}/state/zone2_volume`, state.zone2Volume);
  mqttPublish(`${MQTT_PREFIX}/state/zone2_input`,  state.zone2Input);
}

function publishHADiscovery() {
  if (!mqttClient || !mqttClient.connected) return;

  const device = {
    identifiers: ['pioneer_vsx'],
    name: 'Pioneer VSX Receiver',
    model: 'VSX Series',
    manufacturer: 'Pioneer',
  };

  const configs = [
    // ── Media player (main) ──────────────────────────────────────────────────
    {
      topic: 'homeassistant/media_player/pioneer_vsx/config',
      payload: {
        name: 'Pioneer VSX',
        unique_id: 'pioneer_vsx_main',
        device,
        availability_topic: MQTT_AVAIL,
        state_topic:        `${MQTT_PREFIX}/state/power`,
        command_topic:      MQTT_CMD_TOPIC,
        volume_state_topic: `${MQTT_PREFIX}/state/volume`,
        volume_command_topic: MQTT_CMD_TOPIC,
        mute_state_topic:   `${MQTT_PREFIX}/state/mute`,
        mute_command_topic: MQTT_CMD_TOPIC,
        source_state_topic: `${MQTT_PREFIX}/state/input`,
        source_list: Object.values(INPUT_NAMES),
        payload_on:  'ON',
        payload_off: 'OFF',
        // volume is 0-185 raw, HA expects 0-1
        volume_template:    '{{ (value | int / 185) | round(2) }}',
        set_volume_template:'{{ (value * 185) | int | string | truncate(0, False, "") | int }}VL',
        payload_play:       'PO',
        payload_stop:       'PF',
        payload_mute:       'MZ',
        source_select_template: '{{ value }}FN',
      },
    },
    // ── Power switch ─────────────────────────────────────────────────────────
    {
      topic: 'homeassistant/switch/pioneer_vsx_power/config',
      payload: {
        name: 'Pioneer Power',
        unique_id: 'pioneer_vsx_power',
        device,
        availability_topic: MQTT_AVAIL,
        state_topic:   `${MQTT_PREFIX}/state/power`,
        command_topic: MQTT_CMD_TOPIC,
        payload_on:    'PO',
        payload_off:   'PF',
        state_on:      'ON',
        state_off:     'OFF',
        icon: 'mdi:power',
      },
    },
    // ── Volume number ────────────────────────────────────────────────────────
    {
      topic: 'homeassistant/number/pioneer_vsx_volume/config',
      payload: {
        name: 'Pioneer Volume',
        unique_id: 'pioneer_vsx_volume',
        device,
        availability_topic: MQTT_AVAIL,
        state_topic:   `${MQTT_PREFIX}/state/volume`,
        command_topic: MQTT_CMD_TOPIC,
        command_template: '{{ value | int | string | truncate(0,False,"") }}VL',
        min: 0, max: 185, step: 1,
        icon: 'mdi:volume-high',
      },
    },
    // ── Mute switch ──────────────────────────────────────────────────────────
    {
      topic: 'homeassistant/switch/pioneer_vsx_mute/config',
      payload: {
        name: 'Pioneer Mute',
        unique_id: 'pioneer_vsx_mute',
        device,
        availability_topic: MQTT_AVAIL,
        state_topic:   `${MQTT_PREFIX}/state/mute`,
        command_topic: MQTT_CMD_TOPIC,
        payload_on:    'MO',
        payload_off:   'MF',
        state_on:      'ON',
        state_off:     'OFF',
        icon: 'mdi:volume-mute',
      },
    },
    // ── Input select ─────────────────────────────────────────────────────────
    {
      topic: 'homeassistant/select/pioneer_vsx_input/config',
      payload: {
        name: 'Pioneer Input',
        unique_id: 'pioneer_vsx_input',
        device,
        availability_topic: MQTT_AVAIL,
        state_topic:    `${MQTT_PREFIX}/state/input`,
        command_topic:  MQTT_CMD_TOPIC,
        command_template: '{{ value }}FN',
        options: Object.values(INPUT_NAMES),
        icon: 'mdi:import',
      },
    },
    // ── Volume dB sensor ─────────────────────────────────────────────────────
    {
      topic: 'homeassistant/sensor/pioneer_vsx_volume_db/config',
      payload: {
        name: 'Pioneer Volume dB',
        unique_id: 'pioneer_vsx_volume_db',
        device,
        availability_topic: MQTT_AVAIL,
        state_topic: `${MQTT_PREFIX}/state/volume_db`,
        unit_of_measurement: 'dB',
        icon: 'mdi:volume-high',
      },
    },
    // ── Zone 2 power ─────────────────────────────────────────────────────────
    {
      topic: 'homeassistant/switch/pioneer_vsx_z2power/config',
      payload: {
        name: 'Pioneer Zone 2 Power',
        unique_id: 'pioneer_vsx_z2power',
        device,
        availability_topic: MQTT_AVAIL,
        state_topic:   `${MQTT_PREFIX}/state/zone2_power`,
        command_topic: MQTT_CMD_TOPIC,
        payload_on:    'APO',
        payload_off:   'APF',
        state_on:      'ON',
        state_off:     'OFF',
        icon: 'mdi:speaker',
      },
    },
    // ── Zone 2 volume ────────────────────────────────────────────────────────
    {
      topic: 'homeassistant/number/pioneer_vsx_z2volume/config',
      payload: {
        name: 'Pioneer Zone 2 Volume',
        unique_id: 'pioneer_vsx_z2volume',
        device,
        availability_topic: MQTT_AVAIL,
        state_topic:      `${MQTT_PREFIX}/state/zone2_volume`,
        command_topic:    MQTT_CMD_TOPIC,
        command_template: '{{ value | int | string }}ZV',
        min: 0, max: 81, step: 1,
        icon: 'mdi:volume-medium',
      },
    },
  ];

  configs.forEach(({ topic, payload }) => {
    mqttClient.publish(topic, JSON.stringify(payload), { retain: true });
  });

  console.log('[MQTT] HA discovery published');
}

function connectMQTT() {
  if (!mqttConfig.host) {
    console.log('[MQTT] No MQTT_HOST set — skipping');
    return;
  }

  console.log(`[MQTT] Connecting to ${mqttConfig.host}:${mqttConfig.port}`);

  mqttClient = mqtt.connect(`mqtt://${mqttConfig.host}:${mqttConfig.port}`, {
    username:     mqttConfig.username || undefined,
    password:     mqttConfig.password || undefined,
    clientId:     'pioneer-remote',
    will: { topic: MQTT_AVAIL, payload: 'offline', retain: true },
    reconnectPeriod: 5000,
  });

  mqttClient.on('connect', () => {
    console.log('[MQTT] Connected');
    mqttPublish(MQTT_AVAIL, 'online');
    mqttClient.subscribe(MQTT_CMD_TOPIC);
    publishHADiscovery();
    publishState();
  });

  mqttClient.on('message', (topic, payload) => {
    const cmd = payload.toString().trim();
    console.log(`[MQTT] Command: ${cmd}`);
    // Handle input names — convert "HDMI 1" → "19FN"
    if (cmd.endsWith('FN')) {
      const inputName = cmd.slice(0, -2);
      const code = INPUT_CODES[inputName];
      if (code) { sendCommand(code + 'FN'); return; }
    }
    sendCommand(cmd);
  });

  mqttClient.on('error', (err) => console.error('[MQTT] Error:', err.message));
  mqttClient.on('offline', () => console.log('[MQTT] Offline'));
  mqttClient.on('reconnect', () => console.log('[MQTT] Reconnecting...'));
}

// ════════════════════════════════════════════════════════════════════════════
// TCP — single persistent connection to receiver
// ════════════════════════════════════════════════════════════════════════════
const clients = new Set();
let tcpSocket    = null;
let tcpBuffer    = '';
let tcpConnected = false;
let reconnectTimer = null;

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, ...payload });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}
function sendTo(ws, type, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, ...payload }));
}

function ssdpWake() {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const searches = [
      'M-SEARCH * HTTP/1.1\r\nST: urn:schemas-upnp-org:device:MediaRenderer:1\r\nMX: 3\r\nMAN: "ssdp:discover"\r\nHOST: 239.255.250.250:1900\r\n\r\n',
      'M-SEARCH * HTTP/1.1\r\nST: urn:schemas-upnp-org:device:Basic:1\r\nMX: 3\r\nMAN: "ssdp:discover"\r\nHOST: 239.255.255.250:1900\r\n\r\n',
      'M-SEARCH * HTTP/1.1\r\nST: urn:pioneer-co-jp:device:PioControlServer:1\r\nMX: 3\r\nMAN: "ssdp:discover"\r\nHOST: 239.255.255.250:1900\r\n\r\n',
    ];
    sock.bind(() => {
      let i = 0;
      const sendNext = () => {
        if (i >= searches.length) { sock.close(); return resolve(); }
        const msg = Buffer.from(searches[i++]);
        sock.send(msg, 0, msg.length, 1900, '239.255.255.250', () => setTimeout(sendNext, 150));
      };
      sendNext();
    });
    sock.on('error', () => { try { sock.close(); } catch(_){} resolve(); });
    setTimeout(resolve, 2000);
  });
}

async function connectToReceiver() {
  if (tcpConnected) return;
  if (tcpSocket) { tcpSocket.destroy(); tcpSocket = null; }
  clearTimeout(reconnectTimer);

  const { host, port } = receiverConfig;
  console.log('[SSDP] Sending UPnP wake...');
  broadcast('status', { message: 'Waking receiver...' });
  await ssdpWake();

  console.log(`[TCP] Connecting to ${host}:${port}`);
  broadcast('status', { message: 'Connecting...' });

  tcpSocket = new net.Socket();
  tcpSocket.setKeepAlive(true, 10000);
  tcpSocket.setNoDelay(true);
  tcpSocket.setTimeout(30000);

  tcpSocket.connect(port, host, () => {
    tcpConnected = true;
    console.log(`[TCP] Connected to ${host}:${port}`);
    broadcast('connected', { host, port });
    mqttPublish(MQTT_AVAIL, 'online');

    const queries = ['?V','?F','?RGC','?M','?FL','?L','?P','?VSB','?VHT','?IS','?MC','?SPK','?HO','?PQ','?HA'];
    queries.forEach((q, i) => {
      setTimeout(() => {
        if (tcpSocket && tcpConnected) tcpSocket.write(q + '\r');
      }, i * 100);
    });
  });

  tcpSocket.on('data', (data) => {
    tcpBuffer += data.toString();
    const lines = tcpBuffer.split(/\r\n|\r|\n/);
    tcpBuffer = lines.pop();
    lines.forEach((line) => {
      const t = line.trim();
      if (!t) return;
      console.log(`[RX] ${t}`);
      broadcast('data', { line: t });
      parseReceiverLine(t);
    });
  });

  tcpSocket.on('timeout', () => {
    if (tcpSocket && tcpConnected) tcpSocket.write('?P\r');
  });

  tcpSocket.on('error', (err) => {
    console.error('[TCP] Error:', err.message);
    tcpConnected = false;
    broadcast('error', { message: err.message });
    mqttPublish(MQTT_AVAIL, 'offline');
    scheduleReconnect();
  });

  tcpSocket.on('close', () => {
    tcpConnected = false;
    console.log('[TCP] Disconnected');
    broadcast('disconnected', {});
    mqttPublish(MQTT_AVAIL, 'offline');
    scheduleReconnect();
  });
}

// ── Parse receiver responses and update state + MQTT ─────────────────────────
function parseReceiverLine(line) {
  let changed = false;

  if (line.startsWith('PWR')) {
    state.power = line[3] === '0' ? 'ON' : 'OFF';
    changed = true;
  } else if (line.startsWith('VOL')) {
    const v = parseInt(line.substring(3));
    if (!isNaN(v)) {
      state.volume = v;
      const db = (v - 161) * 0.5;
      state.volumeDb = v === 0 ? '---' : (db >= 0 ? `+${db.toFixed(1)}` : db.toFixed(1));
      changed = true;
    }
  } else if (line.startsWith('MUT')) {
    state.muted = line[3] === '0';
    changed = true;
  } else if (line.startsWith('FN')) {
    const code = line.substring(2);
    state.input = INPUT_NAMES[code] || code;
    changed = true;
  } else if (line.startsWith('SR')) {
    state.listeningMode = line.substring(2);
    changed = true;
  } else if (line.startsWith('ZV')) {
    const v = parseInt(line.substring(2));
    if (!isNaN(v)) { state.zone2Volume = v; changed = true; }
  } else if (line.startsWith('APR')) {
    state.zone2Power = line[3] === '0' ? 'ON' : 'OFF';
    changed = true;
  } else if (line.startsWith('Z2F')) {
    const code = line.substring(3);
    state.zone2Input = INPUT_NAMES[code] || code;
    changed = true;
  }

  if (changed) publishState();
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  console.log('[TCP] Reconnecting in 5s...');
  reconnectTimer = setTimeout(connectToReceiver, 5000);
}

function sendCommand(cmd) {
  if (tcpSocket && tcpConnected) {
    console.log(`[TX] ${cmd}`);
    tcpSocket.write(cmd + '\r');
    return true;
  }
  return false;
}

// ── Auto-connect ──────────────────────────────────────────────────────────────
if (receiverConfig.host) {
  console.log('[CONFIG] Receiver pre-configured, auto-connecting...');
  setTimeout(connectToReceiver, 1000);
} else {
  console.log('[CONFIG] No RECEIVER_HOST set — waiting for UI config');
}

connectMQTT();

// ════════════════════════════════════════════════════════════════════════════
// WebSocket
// ════════════════════════════════════════════════════════════════════════════
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Browser connected (${clients.size} total)`);

  if (tcpConnected) {
    sendTo(ws, 'connected', { host: receiverConfig.host, port: receiverConfig.port });
    const queries = ['?V','?F','?M','?P','?ZV','?AP'];
    queries.forEach((q, i) => setTimeout(() => sendCommand(q), i * 80));
  } else {
    sendTo(ws, 'disconnected', {});
  }
  sendTo(ws, 'config', { host: receiverConfig.host, port: receiverConfig.port });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'connect') {
      if (msg.host) receiverConfig.host = msg.host;
      if (!tcpConnected) connectToReceiver();
    } else if (msg.type === 'command') {
      if (!sendCommand(msg.cmd)) sendTo(ws, 'error', { message: 'Not connected to receiver' });
    } else if (msg.type === 'disconnect') {
      clearTimeout(reconnectTimer);
      if (tcpSocket) tcpSocket.destroy();
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Browser disconnected (${clients.size} remaining)`);
  });
});

const PORT = process.env.PORT || 8088;
server.listen(PORT, () => {
  console.log(`Pioneer Web Remote running on http://0.0.0.0:${PORT}`);
  console.log(`Receiver: ${receiverConfig.host}:${receiverConfig.port}`);
  console.log(`MQTT: ${mqttConfig.host || 'not configured'}`);
});
