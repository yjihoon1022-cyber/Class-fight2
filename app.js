const $ = id => document.getElementById(id);
let socket, myId = null, roomCode = "", isAdmin = false, currentState = null;
function connect() {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${scheme}://${location.host}`);
  socket.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.type === "joined") { myId = m.id; roomCode = m.code; $("lobby").classList.add("hidden"); $("game").classList.remove("hidden"); $("code").textContent = roomCode; status("입장 완료! 상대를 기다려 주세요."); }
    if (m.type === "state") render(m.state);
    if (m.type === "error") status(m.message);
    if (m.type === "admin_ok") { isAdmin = true; $("adminTools").classList.remove("hidden"); status("관리자 로그인 성공!"); }
  };
  socket.onclose = () => status("서버 연결이 끊겼어요. 페이지를 새로고침해 주세요.");
  socket.onerror = () => status("서버에 연결할 수 없어요.");
}
function status(s) { $("status").textContent = s; }
function send(obj) { if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj)); else status("서버에 연결 중이에요."); }
function enter(type) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return status("서버 연결 중이에요. 잠시 후 다시 눌러 주세요.");
  const name = $("name").value.trim();
  if (!name) return status("닉네임을 입력해 주세요.");
  send({type, name, code: $("roomCode").value});
}
function render(s) {
  currentState = s;
  const players = s.players, me = players.find(p => p.id === myId), op = players.find(p => p.id !== myId);
  $("waiting").classList.toggle("hidden", !!op);
  $("arena").classList.toggle("hidden", !op);
  $("controls").classList.toggle("hidden", !op);
  if (me) {
    $("myName").textContent = me.name; $("myHp").textContent = `${me.hp} HP`; $("myRoll").textContent = me.roll;
    $("myBar").style.width = me.hp + "%";
  }
  if (op) {
    $("opName").textContent = op.name; $("opHp").textContent = `${op.hp} HP`; $("opRoll").textContent = op.roll;
    $("opBar").style.width = op.hp + "%";
  }
  $("roll").disabled = !op || !me || me.hp <= 0 || op.hp <= 0;
  $("attack").disabled = $("roll").disabled;
  $("log").innerHTML = "";
  s.log.slice().reverse().forEach(line => { const li = document.createElement("li"); li.textContent = line; $("log").appendChild(li); });
}
$("create").onclick = () => enter("create");
$("join").onclick = () => enter("join");
$("roll").onclick = () => send({type:"roll"});
$("attack").onclick = () => send({type:"attack"});
$("copy").onclick = async () => { try { await navigator.clipboard.writeText(roomCode); status("방 코드를 복사했어요!"); } catch { status("방 코드: " + roomCode); } };
$("adminLogin").onclick = () => {
  const raw = $("adminPass").value.trim();
  const password = raw.startsWith("#") ? raw.slice(1) : raw;
  send({type:"admin", password});
};
$("reset").onclick = () => send({type:"admin_reset"});
$("heal").onclick = () => send({type:"admin_heal"});
$("leave").onclick = () => location.reload();
connect();