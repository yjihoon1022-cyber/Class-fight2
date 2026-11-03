const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password";
const rooms = new Map();
const clients = new Map();

function cleanName(s) { return String(s || "").trim().slice(0, 14) || "익명"; }
function roomCode() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }
function send(ws, data) { if (ws.readyState === 1) ws.send(JSON.stringify(data)); }
function publicState(room) {
  return {
    code: room.code,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, hp: p.hp, wins: p.wins, roll: p.roll
    })),
    log: room.log.slice(-12)
  };
}
function broadcast(room) {
  const msg = JSON.stringify({ type: "state", state: publicState(room) });
  for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(msg);
}
function log(room, text) {
  room.log.push(text);
  if (room.log.length > 30) room.log.shift();
}
function leave(ws) {
  const info = clients.get(ws);
  if (!info) return;
  const room = rooms.get(info.room);
  if (room) {
    room.players.delete(info.id);
    log(room, `${info.name}님이 나갔습니다.`);
    if (room.players.size === 0) rooms.delete(room.code);
    else broadcast(room);
  }
  clients.delete(ws);
}
const server = http.createServer((req, res) => {
  let file = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const full = path.join(__dirname, "public", file);
  if (!full.startsWith(path.join(__dirname, "public"))) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(full);
    res.writeHead(200, { "Content-Type": ext === ".html" ? "text/html; charset=utf-8" : ext === ".css" ? "text/css" : "text/javascript; charset=utf-8" });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server });
wss.on("connection", ws => {
  ws.on("message", raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === "create" || m.type === "join") {
      if (clients.has(ws)) return;
      let code = String(m.code || "").trim().toUpperCase();
      if (m.type === "create") {
        code = roomCode();
        rooms.set(code, { code, players: new Map(), log: ["방이 만들어졌습니다."] });
      }
      const room = rooms.get(code);
      if (!room) return send(ws, { type: "error", message: "방을 찾을 수 없어요. 방 코드를 확인해 주세요." });
      if (room.players.size >= 2) return send(ws, { type: "error", message: "이 방은 2명으로 가득 찼어요." });
      const id = Math.random().toString(36).slice(2);
      const name = cleanName(m.name);
      const player = { id, name, hp: 100, wins: 0, roll: 1, ws, admin: false };
      room.players.set(id, player);
      clients.set(ws, { room: code, id, name });
      log(room, `${name}님이 입장했습니다.`);
      send(ws, { type: "joined", id, code });
      broadcast(room);
      return;
    }
    const info = clients.get(ws);
    if (!info) return;
    const room = rooms.get(info.room);
    const me = room && room.players.get(info.id);
    if (!room || !me) return;
    if (m.type === "roll") {
      me.roll = 1 + Math.floor(Math.random() * 6);
      log(room, `${me.name}님의 주사위: ${me.roll}!`);
      broadcast(room);
    } else if (m.type === "attack") {
      const opponent = [...room.players.values()].find(p => p.id !== me.id);
      if (!opponent) return send(ws, { type: "error", message: "상대가 들어올 때까지 기다려 주세요." });
      if (me.hp <= 0 || opponent.hp <= 0) return;
      const damage = me.roll;
      opponent.hp = Math.max(0, opponent.hp - damage);
      log(room, `${me.name}님의 연타 공격! ${damage} 데미지`);
      if (opponent.hp === 0) {
        me.wins += 1;
        log(room, `🏆 ${me.name}님 승리!`);
      }
      broadcast(room);
    } else if (m.type === "admin") {
      if (m.password !== ADMIN_PASSWORD) return send(ws, { type: "error", message: "관리자 비밀번호가 틀렸어요." });
      me.admin = true;
      send(ws, { type: "admin_ok" });
    } else if (m.type === "admin_reset" && me.admin) {
      for (const p of room.players.values()) { p.hp = 100; p.roll = 1; }
      log(room, "관리자가 경기를 초기화했습니다.");
      broadcast(room);
    } else if (m.type === "admin_heal" && me.admin) {
      for (const p of room.players.values()) p.hp = 100;
      log(room, "관리자가 모든 플레이어의 체력을 회복했습니다.");
      broadcast(room);
    }
  });
  ws.on("close", () => leave(ws));
});
server.listen(PORT, () => console.log(`우리 반 파이트 게임 실행 중: http://localhost:${PORT}`));
