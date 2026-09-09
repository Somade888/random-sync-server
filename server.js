const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════
// STATE — เก็บในหน่วยความจำ
// ═══════════════════════════════════════════
let state = {
  target: null,      // number 1-15 หรือ null
  lastResult: null,  // เลขล่าสุดที่แอป 1 สุ่มออก
  locked: false,     // แอป 1 ล็อคอยู่หรือไม่
  bgColor: null      // สีพื้นหลังที่แอป 2 ตั้ง (#rrggbb หรือ null = ค่าเริ่มต้น)
};

// ═══════════════════════════════════════════
// WEBSOCKET SERVER
// ═══════════════════════════════════════════
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcastState() {
  const msg = JSON.stringify({ event: 'state_update', data: state });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(msg);
    }
  });
  console.log(`[broadcast] ${JSON.stringify(state)}`);
}

// Heartbeat — ส่ง ping ทุก 30 วินาที กัน idle disconnect (Cloudflare/router)
const HEARTBEAT_INTERVAL = 30000;
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ event: 'ping' }));
    }
  });
}, HEARTBEAT_INTERVAL);

wss.on('connection', (ws) => {
  console.log(`[ws] client connected (total: ${wss.clients.size})`);
  // ส่ง state ปัจจุบันทันที
  ws.send(JSON.stringify({ event: 'state_update', data: state }));
  
  ws.on('close', () => {
    console.log(`[ws] client disconnected (total: ${wss.clients.size})`);
  });
});

// ═══════════════════════════════════════════
// REST ENDPOINTS
// ═══════════════════════════════════════════

// GET /state → คืน state ปัจจุบัน
app.get('/state', (req, res) => {
  res.json(state);
});

// POST /target { target: number|null } → ตั้ง/ยกเลิกเป้าหมาย
app.post('/target', (req, res) => {
  const { target } = req.body;
  if (target !== null && (typeof target !== 'number' || target < 1 || target > 15)) {
    return res.status(400).json({ error: 'target must be 1-15 or null' });
  }
  state.target = target;
  console.log(`[target] set to ${target}`);
  broadcastState();
  res.json(state);
});

// POST /result { value: number } → บันทึกผลลัพธ์ล่าสุด
app.post('/result', (req, res) => {
  const { value } = req.body;
  if (typeof value !== 'number' || value < 1 || value > 15) {
    return res.status(400).json({ error: 'value must be 1-15' });
  }
  state.lastResult = value;
  console.log(`[result] lastResult = ${value}`);
  broadcastState();
  res.json(state);
});

// POST /lock { locked: boolean } → ตั้งค่าล็อค
app.post('/lock', (req, res) => {
  const { locked } = req.body;
  state.locked = !!locked;
  console.log(`[lock] locked = ${state.locked}`);
  broadcastState();
  res.json(state);
});

// POST /color { color: "#rrggbb"|null } → ตั้งสีพื้นหลัง (จากแอป 2)
app.post('/color', (req, res) => {
  const { color } = req.body;
  if (color !== null && (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))) {
    return res.status(400).json({ error: 'color must be #rrggbb or null' });
  }
  state.bgColor = color;
  console.log(`[color] bgColor = ${color}`);
  broadcastState();
  res.json(state);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', clients: wss.clients.size });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`╔══════════════════════════════════════╗`);
  console.log(`║  random-sync-server running          ║`);
  console.log(`║  Port: ${PORT}                          ║`);
  console.log(`║  REST:  http://0.0.0.0:${PORT}            ║`);
  console.log(`║  WS:    ws://0.0.0.0:${PORT}             ║`);
  console.log(`╚══════════════════════════════════════╝`);
});
