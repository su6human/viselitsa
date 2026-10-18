(function () {
"use strict";

var MAX_WRONG = 7;
var ALPHABET = "абвгдежзийклмнопрстуфхцчшщъыьэюя".split("");
var WORDS = {
  "Животное": ["слон","жираф","крокодил","пингвин","бегемот","медведь","обезьяна","попугай","черепаха","дельфин","кенгуру","барсук","страус","хамелеон"],
  "Еда": ["пельмени","борщ","сметана","шоколад","блины","макароны","мороженое","сосиска","арбуз","картошка","пирожок","сырники","лагман","самса","плов","манты","бешбармак"],
  "Природа": ["радуга","водопад","ураган","пустыня","вулкан","болото","туман","гроза","океан","береза","ледник","метель","родник","пещера"],
  "Предмет": ["чайник","будильник","зонтик","рюкзак","ножницы","холодильник","телескоп","гитара","фонарик","чемодан","микроскоп","расческа","утюг","календарь"],
  "Профессия": ["пожарный","учитель","космонавт","программист","художник","повар","водитель","архитектор","кондитер","пилот","врач","шахтер","сантехник","режиссер"],
  "Город или страна": ["париж","япония","египет","норвегия","лондон","самарканд","ташкент","токио","италия","мексика","алматы","стамбул","бразилия","монголия"],
  "Спорт и игры": ["футбол","шахматы","баскетбол","волейбол","бильярд","теннис","шашки","биатлон","скейтборд","гимнастика","карате","хоккей"],
  "Наука и космос": ["галактика","планета","комета","магнит","электричество","молекула","гравитация","спутник","атмосфера","лаборатория","созвездие","астероид"]
};

var $ = function (id) { return document.getElementById(id); };
var norm = function (s) { return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[^а-я]/g, ""); };

/* ---------- хранилище ---------- */
var mem = {};
var store = {
  get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return mem[k] || null; } },
  set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
  del: function (k) { try { sessionStorage.removeItem(k); } catch (e) { delete mem[k]; } }
};
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function newId() {
  var a = "";
  try {
    var u = new Uint8Array(8); crypto.getRandomValues(u);
    for (var i = 0; i < u.length; i++) a += ("0" + u[i].toString(16)).slice(-2);
  } catch (e) { a = String(Math.random()).slice(2, 18); }
  return "p" + a;
}

var S = {
  pid: store.get("hv_pid") || newId(),
  ws: null, open: false, retry: 0, busy: false, busyTimer: null,
  st: null, prev: {}, setupRound: null
};
store.set("hv_pid", S.pid);

/* ---------- связь с сервером ---------- */
function send(o) {
  if (S.ws && S.ws.readyState === 1) { S.ws.send(JSON.stringify(o)); return true; }
  return false;
}
function setBusy(b) {
  S.busy = b;
  clearTimeout(S.busyTimer);
  if (b) S.busyTimer = setTimeout(function () { setBusy(false); }, 8000);
  $("btn-create").disabled = b || !S.open;
  $("btn-join").disabled = b || !S.open;
}
function connect() {
  if (S.ws && S.ws.readyState <= 1) return;
  // Если страница лежит не на сервере игры (например, на GitHub Pages), адрес сервера берётся из config.js.
  var host = String((window.VESILITSA_SERVER || "")).replace(/^https?:\/\//, "").replace(/\/+$/, "") || location.host;
  var secure = window.VESILITSA_SERVER ? !/^http:\/\//.test(window.VESILITSA_SERVER) : location.protocol === "https:";
  var url = (secure ? "wss://" : "ws://") + host + "/ws";
  var ws;
  try { ws = new WebSocket(url); } catch (e) { scheduleRetry(); return; }
  S.ws = ws;
  ws.onopen = function () {
    S.open = true; S.retry = 0;
    $("conn").hidden = true;
    setBusy(false);
    send({ type: "hello", pid: S.pid, code: store.get("hv_room") || null });
  };
  ws.onmessage = function (ev) {
    var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    onMessage(m);
  };
  ws.onclose = function () {
    if (S.ws !== ws) return;
    S.open = false;
    $("conn").hidden = false;
    setBusy(false);
    scheduleRetry();
  };
  ws.onerror = function () {};
}
function scheduleRetry() {
  var d = Math.min(8000, 500 * Math.pow(2, S.retry++));
  setTimeout(connect, d);
}
function onMessage(m) {
  if (m.type === "state") {
    S.st = m; store.set("hv_room", m.code);
    setBusy(false); $("join-err").textContent = "";
    render();
  } else if (m.type === "left") {
    S.st = null; S.prev = {}; store.del("hv_room");
    setBusy(false); render();
  } else if (m.type === "error") {
    setBusy(false);
    var map = {
      no_room: "Комната с таким кодом не найдена.",
      full: "В этой комнате уже двое игроков.",
      bad_code: "Введите четыре цифры кода.",
      busy: "Сервер занят, попробуйте через минуту."
    };
    if (m.code === "bad_word") $("word-err").textContent = "Слово должно быть от 3 до 16 букв, только русские.";
    else if (map[m.code]) $("join-err").textContent = map[m.code];
    else toast("Что-то пошло не так. Попробуйте ещё раз.");
  }
}

/* ---------- интерфейс: общее ---------- */
var toastTimer = null;
function toast(msg) {
  var t = $("toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove("on"); }, 3200);
}
function show(id) {
  var list = document.querySelectorAll(".screen");
  for (var i = 0; i < list.length; i++) list[i].hidden = list[i].id !== id;
}
function copyText(text, okMsg) {
  var fail = function () { toast(text); };
  try { navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fail); }
  catch (e) { fail(); }
}
function oppLabel(st) {
  return st.opp.name + (st.opp.connected === false ? " (нет связи)" : "");
}

/* ---------- вход ---------- */
function cleanName() {
  var n = ($("in-name").value || "").trim().slice(0, 16) || "Игрок";
  lsSet("hv_name", n);
  return n;
}
function createRoom() {
  if (S.busy || !S.open) return;
  $("join-err").textContent = "";
  setBusy(true);
  if (!send({ type: "create", name: cleanName() })) setBusy(false);
}
function joinByCode() {
  if (S.busy || !S.open) return;
  var code = $("in-code").value.replace(/\D/g, "");
  if (code.length !== 4) { $("join-err").textContent = "Введите четыре цифры кода."; return; }
  $("join-err").textContent = "";
  setBusy(true);
  if (!send({ type: "join", code: code, name: cleanName() })) setBusy(false);
}
function leaveRoom() {
  send({ type: "leave" });
  S.st = null; S.prev = {}; store.del("hv_room");
  render();
}

/* ---------- отрисовка ---------- */
function render() {
  var st = S.st;
  $("roombar").hidden = !st;
  if (!st) { show("s-join"); return; }
  $("code-chip").textContent = st.code;
  if (st.phase === "wait") { renderWait(st); show("s-wait"); }
  else if (st.phase === "setup") { renderSetup(st); show("s-setup"); }
  else { renderPlay(st); show("s-play"); }
}

function renderWait(st) {
  S.prev = {};
  $("big-code").textContent = st.code;
  var n = $("wait-note");
  n.hidden = !st.oppLeft;
  n.textContent = st.oppLeft ? "Соперник вышел из комнаты. Можно подождать нового игрока." : "";
}

function renderSetup(st) {
  S.prev = {};
  if (S.setupRound !== st.round) {
    S.setupRound = st.round;
    $("in-word").value = ""; $("in-hint").value = ""; $("word-err").textContent = "";
  }
  var me = st.me, opp = st.opp;
  $("opp-name-setup").textContent = oppLabel(st);
  var pm = $("pill-me"), po = $("pill-opp");
  pm.classList.toggle("ok", me.ready);
  pm.lastElementChild.textContent = "Ты: " + (me.ready ? "слово загадано" : "придумываешь слово");
  po.classList.toggle("ok", opp.ready);
  po.lastElementChild.textContent = oppLabel(st) + ": " + (opp.ready ? "слово загадано" : "придумывает слово");
  $("form-word").hidden = me.ready;
  $("word-locked").hidden = !me.ready;
  if (me.ready) {
    $("locked-word").textContent = st.myWord || "";
    $("locked-hint").textContent = st.myHint ? "Подсказка: " + st.myHint : "Без подсказки";
    $("locked-wait").textContent = "Ждём, пока " + oppLabel(st) + " загадает слово тебе.";
  }
}

function figSVG(wrong, grew) {
  var parts = [
    ["circle", 'cx="140" cy="70" r="18"'],
    ["path", 'd="M140 88 V152"'],
    ["path", 'd="M140 104 L116 132"'],
    ["path", 'd="M140 104 L164 132"'],
    ["path", 'd="M140 152 L122 194"'],
    ["path", 'd="M140 152 L158 194"']
  ];
  var shown = Math.min(wrong, 6), person = "";
  for (var i = 0; i < shown; i++) {
    var nw = grew && wrong <= 6 && i === shown - 1;
    person += "<" + parts[i][0] + ' class="p' + (nw ? " new" : "") + '" ' + parts[i][1] + ' pathLength="1"/>';
  }
  if (wrong >= 7) {
    person += '<g class="face"><path d="M131 62 l7 7 M138 62 l-7 7 M142 62 l7 7 M149 62 l-7 7"/><path d="M134 80 H146"/></g>';
  } else if (wrong >= 1) {
    person += '<g class="face"><circle cx="134" cy="66" r="1.8"/><circle cx="146" cy="66" r="1.8"/><path d="M134 80 Q140 75 146 80"/></g>';
  }
  return '<svg viewBox="0 0 180 240" role="img" aria-label="Виселица, ошибок ' + wrong + ' из ' + MAX_WRONG + '">' +
    '<g class="gallows"><path d="M18 226 H132"/><path d="M52 226 V18"/><path d="M52 18 H140"/><path d="M52 56 L90 18"/><path d="M140 18 V52"/></g>' +
    '<g class="person' + (wrong >= 7 ? " dead" : "") + '">' + person + "</g></svg>";
}

/* b = {len, pattern[], misses[], ...}; word — раскрытое слово (только после конца партии) */
function drawBoard(key, b, word) {
  var sig = b.pattern.map(function (c) { return c || "_"; }).join("") + "|" + b.misses.join("") + "|" + (word || "");
  var prev = S.prev[key];
  if (prev && prev.sig === sig) return;
  var same = prev && prev.len === b.len;
  var grew = !!(same && b.misses.length > prev.wrong);

  var slots = $(key + "-slots"); slots.textContent = "";
  slots.setAttribute("aria-label", "Слово из " + b.len + " букв");
  for (var i = 0; i < b.len; i++) {
    var s = document.createElement("span"); s.className = "slot";
    var ch = b.pattern[i];
    if (ch) {
      s.textContent = ch.toUpperCase();
      if (same && !prev.pattern[i]) s.classList.add("pop");
    } else if (word) {
      s.textContent = word.charAt(i).toUpperCase(); s.classList.add("missed");
    }
    slots.appendChild(s);
  }
  $(key + "-fig").innerHTML = figSVG(b.misses.length, grew);
  var pips = $(key + "-pips"); pips.textContent = "";
  for (var k = 0; k < MAX_WRONG; k++) {
    var p = document.createElement("span"); p.className = "pip";
    if (k < b.misses.length) { p.classList.add("on"); p.textContent = "×"; }
    pips.appendChild(p);
  }
  $(key + "-wrong").textContent = b.misses.map(function (c) { return c.toUpperCase(); }).join(" ");
  S.prev[key] = { sig: sig, len: b.len, pattern: b.pattern.slice(), wrong: b.misses.length };
}

var kbdBtns = [];
function buildKbd() {
  var k = $("kbd");
  ALPHABET.forEach(function (ch) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "key"; b.dataset.ch = ch; b.textContent = ch;
    b.setAttribute("aria-label", "Буква " + ch.toUpperCase());
    b.addEventListener("click", function () { guess(ch); });
    k.appendChild(b); kbdBtns.push(b);
  });
}
function guess(ch) {
  var st = S.st;
  if (!st || st.phase !== "play" || !st.board) return;
  if (st.board.guesses.indexOf(ch) >= 0) return;
  send({ type: "guess", letter: ch });
}

function renderBanner(st) {
  var r = st.result, w = st.words, opp = oppLabel(st);
  var up = function (x) { return String(x || "").toUpperCase(); };
  var grade, title, sub;
  if (r.winner === "me") {
    grade = "5"; title = "Победа!";
    sub = r.reason === "solved"
      ? "Ты первым отгадал слово «" + up(w.mine) + "»."
      : st.opp.name + " повесили. Его слово было «" + up(w.theirs) + "».";
  } else {
    grade = "2"; title = "Поражение";
    sub = r.reason === "solved"
      ? st.opp.name + " первым отгадал слово «" + up(w.theirs) + "»."
      : "Тебя повесили. Слово было «" + up(w.mine) + "».";
  }
  $("grade").textContent = grade;
  $("btitle").textContent = title;
  $("bsub").textContent = sub;
  var note = "";
  if (st.me.wantsRematch) note = "Ждём, пока " + opp + " согласится на реванш.";
  else if (st.opp.wantsRematch) note = st.opp.name + " уже ждёт реванша.";
  $("bnote").textContent = note; $("bnote").hidden = !note;
  $("btn-rematch").disabled = !!st.me.wantsRematch;
  $("btn-rematch").textContent = st.me.wantsRematch ? "Ждём соперника…" : "Реванш";
}

function renderPlay(st) {
  var over = st.phase === "over";
  $("banner").hidden = !over;
  if (over) renderBanner(st);
  $("me-name").textContent = st.me.name;
  var hint = st.board.hint;
  $("me-hint").hidden = !hint;
  $("me-hint").textContent = hint ? "Подсказка: " + hint : "";
  $("opp-name").textContent = oppLabel(st);
  drawBoard("me", st.board, over ? st.words.mine : null);
  drawBoard("opp", st.oppBoard, over ? st.words.theirs : null);
  $("opp-prog").textContent = "Открыто " + st.oppBoard.hits + " из " + st.oppBoard.total;
  $("kbd").hidden = over;
  var hitSet = {};
  st.board.pattern.forEach(function (c) { if (c) hitSet[c] = true; });
  kbdBtns.forEach(function (btn) {
    var ch = btn.dataset.ch;
    var hit = !!hitSet[ch], miss = st.board.misses.indexOf(ch) >= 0;
    btn.classList.toggle("hit", hit);
    btn.classList.toggle("miss", miss);
    btn.disabled = over || hit || miss;
  });
}

/* ---------- загадывание слова ---------- */
function onSubmitWord(ev) {
  ev.preventDefault();
  var w = norm($("in-word").value);
  if (w.length < 3) { $("word-err").textContent = "Слово должно быть от 3 до 16 букв, только русские."; return; }
  $("word-err").textContent = "";
  send({ type: "setWord", word: w, hint: ($("in-hint").value || "").trim().slice(0, 32) });
}
function pickRandom() {
  var cats = Object.keys(WORDS);
  var cat = cats[Math.floor(Math.random() * cats.length)];
  var list = WORDS[cat];
  $("in-word").value = list[Math.floor(Math.random() * list.length)];
  $("in-hint").value = cat;
  $("word-err").textContent = "";
}
function editWord() {
  if (!S.st) return;
  $("in-word").value = S.st.myWord || "";
  $("in-hint").value = S.st.myHint || "";
  send({ type: "editWord" });
}

/* ---------- запуск ---------- */
function boot() {
  buildKbd();
  $("in-name").value = lsGet("hv_name") || "";
  var q = "";
  try { q = new URLSearchParams(location.search).get("room") || ""; } catch (e) {}
  if (/^\d{4}$/.test(q)) $("in-code").value = q;

  $("btn-create").addEventListener("click", createRoom);
  $("btn-join").addEventListener("click", joinByCode);
  $("in-code").addEventListener("input", function (e) { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); });
  $("in-code").addEventListener("keydown", function (e) { if (e.key === "Enter") joinByCode(); });
  $("in-name").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { if ($("in-code").value) joinByCode(); else createRoom(); }
  });
  $("in-word").addEventListener("input", function (e) { e.target.value = e.target.value.replace(/[^а-яА-ЯёЁ]/g, ""); });
  $("form-word").addEventListener("submit", onSubmitWord);
  $("btn-random").addEventListener("click", pickRandom);
  $("btn-edit").addEventListener("click", editWord);
  $("btn-copy").addEventListener("click", function () { if (S.st) copyText(S.st.code, "Код скопирован"); });
  $("btn-link").addEventListener("click", function () {
    if (S.st) copyText(location.origin + location.pathname + "?room=" + S.st.code, "Ссылка скопирована");
  });
  $("chip-code").addEventListener("click", function () { if (S.st) copyText(S.st.code, "Код скопирован"); });
  $("btn-leave").addEventListener("click", leaveRoom);
  $("btn-leave2").addEventListener("click", leaveRoom);
  $("btn-rematch").addEventListener("click", function () { send({ type: "rematch" }); });

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target && e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    var k = (e.key || "").toLowerCase();
    if (k === "ё") k = "е";
    if (ALPHABET.indexOf(k) >= 0) guess(k);
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !S.open) connect(); });
  window.addEventListener("online", function () { if (!S.open) connect(); });

  setBusy(false);
  render();
  connect();
}
boot();
})();
