const STORAGE_KEY = "malay-vr-sorter-state-v1";

const defaults = {
  duration: 90,
  scriptUrl: "",
  students: ["อามีนา", "ฮากิม", "ซาฟียะห์", "ฟิรเดาส์", "นูรอัยนี"],
  played: [],
  words: [
    { text: "Ali", category: "proper" },
    { text: "Kuala Lumpur", category: "proper" },
    { text: "Cikgu Sara", category: "proper" },
    { text: "sekolah", category: "common" },
    { text: "buku", category: "common" },
    { text: "kereta", category: "common" }
  ],
  scores: []
};

let state = loadState();
let currentStudent = "";
let currentCards = [];
let activeCard = null;
let timerId = null;
let timeLeft = state.duration;
let gameActive = false;
let correctCount = 0;
let wrongCount = 0;
let cameraStream = null;
let handsReady = false;
let handBusy = false;
let lastPinch = false;

const els = {
  navTabs: document.querySelectorAll(".nav-tab"),
  views: document.querySelectorAll(".view"),
  scriptUrl: document.getElementById("scriptUrl"),
  saveUrlBtn: document.getElementById("saveUrlBtn"),
  syncState: document.getElementById("syncState"),
  randomBtn: document.getElementById("randomBtn"),
  startBtn: document.getElementById("startBtn"),
  resetQueueBtn: document.getElementById("resetQueueBtn"),
  currentStudent: document.getElementById("currentStudent"),
  nextStudent: document.getElementById("nextStudent"),
  remainingCount: document.getElementById("remainingCount"),
  playedCount: document.getElementById("playedCount"),
  studentQueue: document.getElementById("studentQueue"),
  timerText: document.getElementById("timerText"),
  scoreText: document.getElementById("scoreText"),
  cameraStage: document.getElementById("cameraStage"),
  camera: document.getElementById("camera"),
  overlay: document.getElementById("overlay"),
  cardLayer: document.getElementById("cardLayer"),
  handPointer: document.getElementById("handPointer"),
  stageNotice: document.getElementById("stageNotice"),
  roundsMetric: document.getElementById("roundsMetric"),
  avgMetric: document.getElementById("avgMetric"),
  syncedMetric: document.getElementById("syncedMetric"),
  scoreTable: document.getElementById("scoreTable"),
  exportBtn: document.getElementById("exportBtn"),
  durationInput: document.getElementById("durationInput"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  addStudentBtn: document.getElementById("addStudentBtn"),
  addWordBtn: document.getElementById("addWordBtn"),
  studentEditor: document.getElementById("studentEditor"),
  wordEditor: document.getElementById("wordEditor")
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaults);
  try {
    return { ...structuredClone(defaults), ...JSON.parse(saved) };
  } catch {
    return structuredClone(defaults);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function remainingStudents() {
  return state.students.filter((name) => !state.played.includes(name));
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.max(0, seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function showView(viewId) {
  els.navTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewId));
  els.views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  if (viewId === "dashboardView") renderDashboard();
  if (viewId === "settingsView") renderSettings();
}

function renderQueue() {
  const remaining = remainingStudents();
  els.remainingCount.textContent = remaining.length;
  els.playedCount.textContent = state.played.length;
  els.studentQueue.innerHTML = "";

  state.students.forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name;
    if (state.played.includes(name)) li.classList.add("played");
    els.studentQueue.appendChild(li);
  });
}

function randomStudent() {
  const remaining = remainingStudents();
  if (!remaining.length) {
    els.nextStudent.textContent = "ครบทุกคนแล้ว";
    currentStudent = "";
    els.currentStudent.textContent = "รอรีเซ็ตคิว";
    return;
  }
  currentStudent = remaining[Math.floor(Math.random() * remaining.length)];
  els.nextStudent.textContent = currentStudent;
  els.currentStudent.textContent = currentStudent;
}

function resetQueue() {
  state.played = [];
  saveState();
  renderQueue();
  randomStudent();
}

function buildCards() {
  els.cardLayer.innerHTML = "";
  const stage = els.cameraStage.getBoundingClientRect();
  const selected = shuffle(state.words).slice(0, Math.min(6, state.words.length));
  currentCards = selected.map((word, index) => {
    const card = document.createElement("button");
    card.className = "word-card";
    card.type = "button";
    card.textContent = word.text;
    card.dataset.category = word.category;
    card.style.left = `${80 + (index % 3) * Math.max(150, stage.width * 0.22)}px`;
    card.style.top = `${72 + Math.floor(index / 3) * 116}px`;
    makeCardDraggable(card);
    els.cardLayer.appendChild(card);
    return card;
  });
}

function makeCardDraggable(card) {
  let dragging = false;

  card.addEventListener("pointerdown", (event) => {
    if (!gameActive) return;
    dragging = true;
    activeCard = card;
    card.classList.add("grabbed");
    card.setPointerCapture(event.pointerId);
    moveCard(card, event.clientX, event.clientY);
  });

  card.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    moveCard(card, event.clientX, event.clientY);
  });

  card.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    card.classList.remove("grabbed");
    evaluateDrop(card, event.clientX, event.clientY);
    activeCard = null;
  });
}

function moveCard(card, clientX, clientY) {
  const rect = els.cameraStage.getBoundingClientRect();
  const x = clientX - rect.left - card.offsetWidth / 2;
  const y = clientY - rect.top - card.offsetHeight / 2;
  card.style.left = `${Math.max(8, Math.min(rect.width - card.offsetWidth - 8, x))}px`;
  card.style.top = `${Math.max(8, Math.min(rect.height - card.offsetHeight - 8, y))}px`;
}

function getDropAt(clientX, clientY) {
  return [...document.querySelectorAll(".drop-zone")].find((zone) => {
    const rect = zone.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  });
}

function evaluateDrop(card, clientX, clientY) {
  const zone = getDropAt(clientX, clientY);
  if (!zone) return;

  const good = zone.dataset.category === card.dataset.category;
  zone.classList.add(good ? "flash-good" : "flash-bad");
  setTimeout(() => zone.classList.remove("flash-good", "flash-bad"), 260);

  if (good) {
    correctCount += 1;
    card.remove();
  } else {
    wrongCount += 1;
  }
  els.scoreText.textContent = Math.max(0, correctCount * 10 - wrongCount * 3);

  if (!els.cardLayer.children.length) finishGame();
}

async function startGame() {
  if (!currentStudent) randomStudent();
  if (!currentStudent) return;

  correctCount = 0;
  wrongCount = 0;
  timeLeft = Number(state.duration) || 90;
  gameActive = true;
  els.scoreText.textContent = "0";
  els.timerText.textContent = formatTime(timeLeft);
  els.stageNotice.textContent = "กำลังเล่น: จีบนิ้วเพื่อจับ ปล่อยนิ้วเพื่อวาง";
  buildCards();
  await startCamera();

  clearInterval(timerId);
  timerId = setInterval(() => {
    timeLeft -= 1;
    els.timerText.textContent = formatTime(timeLeft);
    if (timeLeft <= 0) finishGame();
  }, 1000);
}

async function finishGame() {
  if (!gameActive) return;
  gameActive = false;
  clearInterval(timerId);
  const score = Math.max(0, correctCount * 10 - wrongCount * 3);
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    student: currentStudent,
    score,
    correct: correctCount,
    wrong: wrongCount,
    duration: state.duration - timeLeft,
    synced: false
  };

  if (currentStudent && !state.played.includes(currentStudent)) state.played.push(currentStudent);
  state.scores.unshift(record);
  saveState();
  renderQueue();
  renderDashboard();
  els.stageNotice.textContent = `จบรอบของ ${currentStudent}: ${score} คะแนน`;
  await syncRecord(record);
  randomStudent();
}

async function syncRecord(record) {
  if (!state.scriptUrl) {
    els.syncState.textContent = "ยังไม่มีลิงก์ชีต";
    return;
  }

  try {
    els.syncState.textContent = "กำลังส่งข้อมูล";
    await fetch(state.scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(record)
    });
    record.synced = true;
    const saved = state.scores.find((item) => item.id === record.id);
    if (saved) saved.synced = true;
    saveState();
    els.syncState.textContent = "ส่งเข้าชีตแล้ว";
    renderDashboard();
  } catch {
    els.syncState.textContent = "ส่งชีตไม่สำเร็จ";
  }
}

async function startCamera() {
  if (cameraStream) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    els.stageNotice.textContent = "เบราว์เซอร์นี้ไม่รองรับกล้อง ใช้เมาส์/ทัชลากบัตรแทนได้";
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 18, max: 24 } },
      audio: false
    });
    els.camera.srcObject = cameraStream;
    await els.camera.play();
    await loadHands();
  } catch {
    els.stageNotice.textContent = "เปิดกล้องไม่ได้ ใช้เมาส์/ทัชลากบัตรแทนได้";
  }
}

async function loadHands() {
  if (handsReady || !window.Hands) {
    if (!window.Hands) await injectHandsScripts();
    if (!window.Hands) return;
  }

  const hands = new window.Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,
    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.55
  });
  hands.onResults(onHandResults);
  handsReady = true;

  const tick = async () => {
    if (!gameActive || handBusy || els.camera.readyState < 2) {
      requestAnimationFrame(tick);
      return;
    }
    handBusy = true;
    await hands.send({ image: els.camera });
    handBusy = false;
    requestAnimationFrame(tick);
  };
  tick();
}

function injectHandsScripts() {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js";
    script.onload = resolve;
    script.onerror = resolve;
    document.head.appendChild(script);
  });
}

function onHandResults(results) {
  const landmarks = results.multiHandLandmarks?.[0];
  if (!landmarks) {
    els.handPointer.style.display = "none";
    return;
  }

  const index = landmarks[8];
  const thumb = landmarks[4];
  const stage = els.cameraStage.getBoundingClientRect();
  const clientX = stage.left + (1 - index.x) * stage.width;
  const clientY = stage.top + index.y * stage.height;
  const pinch = Math.hypot(index.x - thumb.x, index.y - thumb.y) < 0.055;

  els.handPointer.style.display = "block";
  els.handPointer.style.left = `${clientX - stage.left}px`;
  els.handPointer.style.top = `${clientY - stage.top}px`;
  els.handPointer.classList.toggle("pinching", pinch);

  if (pinch && !lastPinch) {
    activeCard = cardAt(clientX, clientY);
    activeCard?.classList.add("grabbed");
  }

  if (pinch && activeCard) moveCard(activeCard, clientX, clientY);

  if (!pinch && lastPinch && activeCard) {
    activeCard.classList.remove("grabbed");
    evaluateDrop(activeCard, clientX, clientY);
    activeCard = null;
  }
  lastPinch = pinch;
}

function cardAt(clientX, clientY) {
  return currentCards.find((card) => {
    if (!card.isConnected) return false;
    const rect = card.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  });
}

function renderDashboard() {
  const scores = state.scores;
  els.roundsMetric.textContent = scores.length;
  els.avgMetric.textContent = scores.length
    ? Math.round(scores.reduce((sum, item) => sum + Number(item.score || 0), 0) / scores.length)
    : 0;
  els.syncedMetric.textContent = scores.filter((item) => item.synced).length;
  els.scoreTable.innerHTML = scores.map((item) => `
    <tr>
      <td>${new Date(item.createdAt).toLocaleString("th-TH")}</td>
      <td>${escapeHtml(item.student)}</td>
      <td>${item.score}</td>
      <td>${item.correct}</td>
      <td>${item.wrong}</td>
      <td>${item.synced ? "ส่งแล้ว" : "รอส่ง"}</td>
    </tr>
  `).join("");
}

function renderSettings() {
  els.durationInput.value = state.duration;
  els.studentEditor.innerHTML = "";
  state.students.forEach((name, index) => {
    const row = document.createElement("div");
    row.className = "editor-row";
    row.innerHTML = `
      <input value="${escapeHtml(name)}" aria-label="ชื่อนักเรียน" />
      <button class="delete-btn" type="button" aria-label="ลบ">×</button>
    `;
    row.querySelector("input").addEventListener("input", (event) => state.students[index] = event.target.value.trim());
    row.querySelector("button").addEventListener("click", () => {
      state.students.splice(index, 1);
      state.played = state.played.filter((playedName) => state.students.includes(playedName));
      renderSettings();
      renderQueue();
    });
    els.studentEditor.appendChild(row);
  });

  els.wordEditor.innerHTML = "";
  state.words.forEach((word, index) => {
    const row = document.createElement("div");
    row.className = "editor-row word";
    row.innerHTML = `
      <input value="${escapeHtml(word.text)}" aria-label="คำศัพท์" />
      <select aria-label="ประเภทคำ">
        <option value="proper">Kata nama khas</option>
        <option value="common">Kata nama am</option>
      </select>
      <button class="delete-btn" type="button" aria-label="ลบ">×</button>
    `;
    row.querySelector("select").value = word.category;
    row.querySelector("input").addEventListener("input", (event) => state.words[index].text = event.target.value.trim());
    row.querySelector("select").addEventListener("change", (event) => state.words[index].category = event.target.value);
    row.querySelector("button").addEventListener("click", () => {
      state.words.splice(index, 1);
      renderSettings();
    });
    els.wordEditor.appendChild(row);
  });
}

function saveSettings() {
  state.duration = Math.max(20, Number(els.durationInput.value) || 90);
  state.students = state.students.map((name) => name.trim()).filter(Boolean);
  state.words = state.words.filter((word) => word.text.trim());
  state.played = state.played.filter((name) => state.students.includes(name));
  saveState();
  timeLeft = state.duration;
  els.timerText.textContent = formatTime(timeLeft);
  renderQueue();
  renderSettings();
}

function exportCsv() {
  const header = ["createdAt", "student", "score", "correct", "wrong", "duration", "synced"];
  const rows = state.scores.map((item) => header.map((key) => JSON.stringify(item[key] ?? "")).join(","));
  const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "malay-vocabulary-scores.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

els.navTabs.forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
els.saveUrlBtn.addEventListener("click", () => {
  state.scriptUrl = els.scriptUrl.value.trim();
  saveState();
  els.syncState.textContent = state.scriptUrl ? "พร้อมส่งเข้าชีต" : "ยังไม่เชื่อมต่อ";
});
els.randomBtn.addEventListener("click", randomStudent);
els.startBtn.addEventListener("click", startGame);
els.resetQueueBtn.addEventListener("click", resetQueue);
els.exportBtn.addEventListener("click", exportCsv);
els.saveSettingsBtn.addEventListener("click", saveSettings);
els.addStudentBtn.addEventListener("click", () => {
  state.students.push("นักเรียนใหม่");
  renderSettings();
});
els.addWordBtn.addEventListener("click", () => {
  state.words.push({ text: "perkataan", category: "common" });
  renderSettings();
});

els.scriptUrl.value = state.scriptUrl;
els.syncState.textContent = state.scriptUrl ? "พร้อมส่งเข้าชีต" : "ยังไม่เชื่อมต่อ";
timeLeft = state.duration;
els.timerText.textContent = formatTime(timeLeft);
renderQueue();
renderDashboard();
renderSettings();
