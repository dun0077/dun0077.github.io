// State management
let state = {
  students: [],
  groups: [],
  words: ["mas", "kan", "pun", "min", "lah", "dar", "pas", "tum", "run", "bor", "tek", "sing", "wan", "lam", "pos"],
  scores: [],
  selectedWords: [],
  currentGroupQueue: [],
  currentPlayingIndex: -1,

  // Settings & Configuration
  gasUrl: localStorage.getItem("gas_url") || "https://script.google.com/macros/s/AKfycbxZxSoG0a3xXs3wk0j8y81NMYuxBNE6awcd9I2ufxb2jabiS5FRVOnHAdJlG1SjIfX2/exec",

  // Game Play Active Variables
  gameActive: false,
  timerInterval: null,
  globalTimeLimit: 60, // Global round duration in seconds
  scoreCupsPlaced: 0,
  wordsRead: [],

  // MediaPipe / Tracking Setup
  trackingActive: false,
  cameraStream: null,
  handsDetector: null,
  handsLoaded: false,

  // Visual/Canvas Engine Variables
  cups: [],
  canvasWidth: 800,
  canvasHeight: 650,
  draggedCupIndex: null, // Track mouse/touch drag
  currentHeldCup: null, // Track globally held cup across hands and mouse

  // AR Pinch Tracking
  pinchPoints: [
    { x: 0, y: 0, active: false, color: "#8b5cf6", cupIndex: null }, // Hand 1
    { x: 0, y: 0, active: false, color: "#06b6d4", cupIndex: null }  // Hand 2
  ]
};

// PYRAMID CONFIGURATION
// We will build a pyramid dynamically. The slots will snap cups to correct position when hovered.
// A 4-level pyramid needs 10 cups (1+2+3+4 = 10 cups) or 5-level needs 15 cups. Let's do 4 levels (10 cups):
// Row 4 (base): 4 slots
// Row 3: 3 slots
// Row 2: 2 slots
// Row 1 (top): 1 slot
const CUP_WIDTH = 90;
const CUP_HEIGHT = 100;
const SNAP_THRESHOLD = 80; // increased for easier magnetic snap

let pyramidSlots = [];

function generatePyramidSlots() {
  pyramidSlots = [];
  const baseLineY = 550;
  const startX = 400; // Center X of pyramid structure

  // Levels: 4 levels (0 is top, 3 is bottom base)
  // Level 3 (Base) -> 4 cups
  for (let i = 0; i < 4; i++) {
    pyramidSlots.push({
      id: `slot-3-${i}`,
      level: 3,
      index: i,
      x: startX - (1.5 * CUP_WIDTH) + (i * CUP_WIDTH * 1.1),
      y: baseLineY,
      occupied: false,
      cupId: null
    });
  }
  // Level 2 -> 3 cups
  for (let i = 0; i < 3; i++) {
    pyramidSlots.push({
      id: `slot-2-${i}`,
      level: 2,
      index: i,
      x: startX - (CUP_WIDTH) + (i * CUP_WIDTH * 1.1),
      y: baseLineY - (CUP_HEIGHT * 0.95),
      occupied: false,
      cupId: null
    });
  }
  // Level 1 -> 2 cups
  for (let i = 0; i < 2; i++) {
    pyramidSlots.push({
      id: `slot-1-${i}`,
      level: 1,
      index: i,
      x: startX - (0.5 * CUP_WIDTH) + (i * CUP_WIDTH * 1.1),
      y: baseLineY - (CUP_HEIGHT * 1.9),
      occupied: false,
      cupId: null
    });
  }
  // Level 0 (Top) -> 1 cup
  pyramidSlots.push({
    id: `slot-0-0`,
    level: 0,
    index: 0,
    x: startX,
    y: baseLineY - (CUP_HEIGHT * 2.85),
    occupied: false,
    cupId: null
  });
}

// Generate starting random list of cups in layout
function initCups() {
  state.selectedWords = [];
  const wordCount = 15; // Provide plenty of options

  // Pick random words from vocab
  const pool = [...state.words];
  for (let i = 0; i < wordCount; i++) {
    if (pool.length === 0) pool.push(...state.words);
    const randIdx = Math.floor(Math.random() * pool.length);
    state.selectedWords.push(pool.splice(randIdx, 1)[0]);
  }

  state.cups = [];
  // Place cups randomly along left/right shelves to leave middle open for pyramid
  for (let i = 0; i < wordCount; i++) {
    const isLeft = i % 2 === 0;
    const shelfIndex = Math.floor(i / 2);

    const x = isLeft ? 60 : 740;
    const y = 80 + (shelfIndex * 70);

    state.cups.push({
      id: i,
      word: state.selectedWords[i],
      x: x,
      y: y,
      targetX: x,
      targetY: y,
      isPlaced: false,
      slotId: null,
      color: getRandomCupColor()
    });
  }
}

function getRandomCupColor() {
  const colors = [
    { fill: '#f43f5e', border: '#be123c' }, // Rose
    { fill: '#3b82f6', border: '#1d4ed8' }, // Blue
    { fill: '#10b981', border: '#047857' }, // Green
    { fill: '#f59e0b', border: '#b45309' }, // Amber
    { fill: '#8b5cf6', border: '#6d28d9' }  // Purple
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Draw Loop
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

function drawGame() {
  ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);

  // 1. Draw Pyramid slots as guides
  pyramidSlots.forEach(slot => {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    // Draw cup outline for slot
    ctx.moveTo(slot.x - CUP_WIDTH / 2, slot.y + CUP_HEIGHT / 2);
    ctx.lineTo(slot.x + CUP_WIDTH / 2, slot.y + CUP_HEIGHT / 2);
    ctx.lineTo(slot.x + CUP_WIDTH / 3, slot.y - CUP_HEIGHT / 2);
    ctx.lineTo(slot.x - CUP_WIDTH / 3, slot.y - CUP_HEIGHT / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // 2. Draw Cups
  state.cups.forEach(cup => {
    // Soft interpolation for smooth movements
    cup.x += (cup.targetX - cup.x) * 0.35;
    cup.y += (cup.targetY - cup.y) * 0.35;

    // Draw cup body
    ctx.beginPath();
    ctx.fillStyle = cup.color.fill;
    ctx.strokeStyle = cup.color.border;
    ctx.lineWidth = 3;
    ctx.moveTo(cup.x - CUP_WIDTH / 2, cup.y + CUP_HEIGHT / 2);
    ctx.lineTo(cup.x + CUP_WIDTH / 2, cup.y + CUP_HEIGHT / 2);
    ctx.lineTo(cup.x + CUP_WIDTH / 3, cup.y - CUP_HEIGHT / 2);
    ctx.lineTo(cup.x - CUP_WIDTH / 3, cup.y - CUP_HEIGHT / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw top ellipse rim
    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.ellipse(cup.x, cup.y - CUP_HEIGHT / 2, CUP_WIDTH / 3, 10, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Draw Word label
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px Outfit, Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cup.word, cup.x, cup.y + 5);
  });

  // 3. Draw Pinch pointers (AR fingers tracking)
  state.pinchPoints.forEach(point => {
    if (point.active) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 12, 0, 2 * Math.PI);
      ctx.fillStyle = point.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      // Draw cursor inner core
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  });

  requestAnimationFrame(drawGame);
}

// MediaPipe Setup & Tracking
let trackingStatusBadge = document.getElementById("tracking-status");

function setTrackingStatus(status, text) {
  trackingStatusBadge.className = "status-badge " + status;
  trackingStatusBadge.innerHTML = `<span class="indicator-dot"></span> ` + text;
}

// Init MediaPipe Hands
function initMediaPipe() {
  setTrackingStatus("connecting", "กำลังโหลดกล้อง & AI...");

  const videoElement = document.getElementById("webcam-video");

  // Instantiating MediaPipe Hands object
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  });

  hands.onResults(onHandResults);

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await hands.send({ image: videoElement });
    },
    width: 800,
    height: 650
  });

  camera.start()
    .then(() => {
      state.handsLoaded = true;
      setTrackingStatus("tracking", "กล้องเปิดใช้งานแล้ว (จีบนิ้วเพื่อจับแก้ว)");
    })
    .catch(err => {
      console.warn("Camera/MediaPipe failed. Reverting to fallback mouse/touch control.", err);
      setTrackingStatus("fallback", "โหมดเมาส์ / ทัชสกรีน (กล้องไม่ทำงาน)");
    });
}

function onHandResults(results) {
  // Reset pinch tracking points activity status
  state.pinchPoints[0].active = false;
  state.pinchPoints[1].active = false;

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    for (let index = 0; index < results.multiHandLandmarks.length; index++) {
      if (index >= 2) break; // Limit to 2 hands max

      // ---- RIGHT HAND ONLY ----
      // MediaPipe คืน handedness ในภาพที่ mirror แล้ว:
      // ผู้ใช้ยกมือขวา → label = "Left" (เพราะกล้องกลับซ้าย-ขวา)
      const handedness = results.multiHandedness && results.multiHandedness[index];
      const label = handedness ? handedness.label : null;
      // label === "Left" หมายถึงมือขวาของผู้ใช้จริงๆ (mirror)
      const isRightHand = (label === "Left");
      if (!isRightHand) continue; // ข้ามมือซ้ายทั้งหมด

      const landmarks = results.multiHandLandmarks[index];

      // Index finger tip (Landmark 8) and Thumb tip (Landmark 4)
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];

      // Calculate coordinates scaled to canvas width/height (remember to scale mirror-image back)
      const px = (1 - (thumbTip.x + indexTip.x) / 2) * state.canvasWidth;
      const py = ((thumbTip.y + indexTip.y) / 2) * state.canvasHeight;

      // Check distance for pinch gesture
      const distance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
      const isPinching = distance < 0.08; // Pinch threshold

      // Use slot 0 for the right hand pointer (only 1 hand used now)
      state.pinchPoints[0].x = px;
      state.pinchPoints[0].y = py;
      state.pinchPoints[0].active = true;

      handlePinchDrag(0, px, py, isPinching);
    }
  }
}

function handlePinchDrag(handIdx, px, py, isPinching) {
  const pointer = state.pinchPoints[handIdx];

  // ถ้า modal ยืนยันคำสะกดกำลังแสดงอยู่ → ล็อคแก้วไว้ที่เดิม ไม่ตามมือ
  const modalOpen = document.getElementById("confirm-modal").classList.contains("active");

  if (isPinching) {
    if (modalOpen) return; // Modal เปิดอยู่ → ห้ามจับหรือลากแก้ว

    // Attempt to grab a cup only if no cup is globally held
    if (pointer.cupIndex === null && state.currentHeldCup === null) {
      // Try to grab a cup close to this point
      for (let i = state.cups.length - 1; i >= 0; i--) {
        const cup = state.cups[i];
        if (!cup.isPlaced && Math.hypot(cup.x - px, cup.y - py) < 60) {
          pointer.cupIndex = i;
          state.currentHeldCup = i;
          break;
        }
      }
    } else if (pointer.cupIndex !== null) {
      // Drag cup (แก้วตามมือเมื่อ modal ปิดเท่านั้น)
      const cup = state.cups[pointer.cupIndex];
      cup.targetX = px;
      cup.targetY = py;
    }
  } else {
    // Release cup if held
    if (pointer.cupIndex !== null) {
      if (!modalOpen) {
        snapCupToSlot(pointer.cupIndex);
      }
      // Clear global held reference
      if (state.currentHeldCup === pointer.cupIndex) {
        state.currentHeldCup = null;
      }
      pointer.cupIndex = null;
    }
  }
}

// Snap mechanics
function snapCupToSlot(cupIndex) {
  if (!state.gameActive) return;
  const cup = state.cups[cupIndex];

  // Find nearest empty slot
  let bestSlot = null;
  let minDistance = SNAP_THRESHOLD;

  pyramidSlots.forEach(slot => {
    if (!slot.occupied) {
      const dist = Math.hypot(cup.targetX - slot.x, cup.targetY - slot.y);
      if (dist < minDistance) {
        minDistance = dist;
        bestSlot = slot;
      }
    }
  });

  // If the cup was previously placed in a slot, release that slot
  if (cup.slotId) {
    const oldSlot = pyramidSlots.find(s => s.id === cup.slotId);
    if (oldSlot) {
      oldSlot.occupied = false;
      oldSlot.cupId = null;
    }
    cup.slotId = null;
    cup.isPlaced = false;
  }

  if (bestSlot) {
    // Ask validation prompt or snap directly. In AR guidelines, the rule says:
    // "Before placing the cup, student must read the word to the group. If correct, place it."
    // Let's trigger a UI/Voice confirm modal
    triggerCupPlacementVerification(cup, bestSlot);
  } else {
    // Send back to shelf
    cup.targetX = cup.isLeft ? 60 : 740;
    // Keep it on original side shelves
    const origLeft = cup.id % 2 === 0;
    const shelfIndex = Math.floor(cup.id / 2);
    cup.targetX = origLeft ? 60 : 740;
    cup.targetY = 80 + (shelfIndex * 70);
  }
}

function triggerCupPlacementVerification(cup, slot) {
  // Show Verification Overlay
  const verifyModal = document.getElementById("confirm-modal");
  const modalWord = document.getElementById("modal-word-display");
  modalWord.innerText = cup.word.toUpperCase();

  verifyModal.classList.add("active");

  // Store targets so we can complete later
  window.pendingPlacement = { cup, slot };
}

// Handle Verification confirmation from friends
document.getElementById("btn-word-correct").addEventListener("click", () => {
  if (window.pendingPlacement) {
    const { cup, slot } = window.pendingPlacement;

    cup.targetX = slot.x;
    cup.targetY = slot.y;
    cup.isPlaced = true;
    cup.slotId = slot.id;
    slot.occupied = true;
    slot.cupId = cup.id;

    if (!state.wordsRead.includes(cup.word)) {
      state.wordsRead.push(cup.word);
    }

    // Recalculate score (Pyramid Height or total Placed cups)
    calculateLiveScore();

    window.pendingPlacement = null;
  }
  document.getElementById("confirm-modal").classList.remove("active");
});

document.getElementById("btn-word-wrong").addEventListener("click", () => {
  if (window.pendingPlacement) {
    const { cup } = window.pendingPlacement;
    // Send back to shelf
    const origLeft = cup.id % 2 === 0;
    const shelfIndex = Math.floor(cup.id / 2);
    cup.targetX = origLeft ? 60 : 740;
    cup.targetY = 80 + (shelfIndex * 70);

    window.pendingPlacement = null;
  }
  document.getElementById("confirm-modal").classList.remove("active");
});

function calculateLiveScore() {
  // Find highest level occupied
  // Levels are: 3 (base, height 1), 2 (height 2), 1 (height 3), 0 (top, height 4)
  let activeHeight = 0;
  const levelStatus = [false, false, false, false];

  pyramidSlots.forEach(slot => {
    if (slot.occupied) {
      levelStatus[slot.level] = true;
    }
  });

  // Calculate continuous height starting from base
  if (levelStatus[3]) activeHeight = 1;
  if (levelStatus[3] && levelStatus[2]) activeHeight = 2;
  if (levelStatus[3] && levelStatus[2] && levelStatus[1]) activeHeight = 3;
  if (levelStatus[3] && levelStatus[2] && levelStatus[1] && levelStatus[0]) activeHeight = 4;

  state.scoreCupsPlaced = pyramidSlots.filter(s => s.occupied).length;
  document.getElementById("live-score-display").innerText = `ความสูง: ชั้น ${activeHeight} (วางแล้ว ${state.scoreCupsPlaced} แก้ว)`;
}

// Mouse/Touch Drag and Drop Fallback Engine
canvas.addEventListener("mousedown", onMouseDown);
canvas.addEventListener("mousemove", onMouseMove);
canvas.addEventListener("mouseup", onMouseUp);

canvas.addEventListener("touchstart", (e) => {
  if (e.touches.length > 0) {
    const t = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    onMouseDown({
      clientX: t.clientX,
      clientY: t.clientY
    });
  }
});

canvas.addEventListener("touchmove", (e) => {
  if (e.touches.length > 0) {
    const t = e.touches[0];
    onMouseMove({
      clientX: t.clientX,
      clientY: t.clientY
    });
  }
});

canvas.addEventListener("touchend", onMouseUp);

function onMouseDown(e) {
  // Prevent picking a cup if another cup is already held (by hand or mouse)
  if (state.draggedCupIndex !== null || state.currentHeldCup !== null) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Search from top to bottom
  for (let i = state.cups.length - 1; i >= 0; i--) {
    const cup = state.cups[i];
    if (!cup.isPlaced && Math.hypot(cup.x - mx, cup.y - my) < 50) {
      state.draggedCupIndex = i;
      state.currentHeldCup = i; // mark globally held
      break;
    }
  }
}

function onMouseMove(e) {
  if (state.draggedCupIndex !== null) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    state.cups[state.draggedCupIndex].targetX = mx;
    state.cups[state.draggedCupIndex].targetY = my;
  }
}

function onMouseUp() {
  if (state.draggedCupIndex !== null) {
    snapCupToSlot(state.draggedCupIndex);
    // Clear global held reference
    if (state.currentHeldCup === state.draggedCupIndex) {
      state.currentHeldCup = null;
    }
    state.draggedCupIndex = null;
  }
}

// Student & Group Randomization
function safeJsonParse(str, fallback) {
  try {
    if (!str || str === "undefined") return fallback;
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

function loadSettingsData() {
  const localStud = localStorage.getItem("students_list");
  state.students = safeJsonParse(localStud, []);
  if (state.students.length > 0) {
    updateStudentsListUI();
  }

  const localWords = localStorage.getItem("words_list");
  state.words = safeJsonParse(localWords, ["mas", "kan", "pun", "min", "lah", "dar", "pas", "tum", "run", "bor", "tek", "sing", "wan", "lam", "pos"]);

  updateWordsListUI();

  if (state.gasUrl) {
    document.getElementById("gas-url-input").value = state.gasUrl;
  }
  // Initialize global time input
  const globalTimeInput = document.getElementById("global-time-input");
  if (globalTimeInput) {
    globalTimeInput.value = state.globalTimeLimit;
    globalTimeInput.addEventListener("change", e => {
      const val = parseInt(e.target.value, 10) || 60;
      state.globalTimeLimit = val;
    });
  }
}

function updateStudentsListUI() {
  const list = document.getElementById("students-preview-list");
  list.innerHTML = state.students.map(s => `<div class="list-item"><span>${s}</span></div>`).join("");
}

function updateWordsListUI() {
  const container = document.getElementById("words-preview-list");
  container.innerHTML = state.words.map(w => `<div class="list-item"><span>${w}</span></div>`).join("");
}

// Generate Groups
document.getElementById("btn-generate-groups").addEventListener("click", () => {
  const rawInput = document.getElementById("student-names-input").value;
  if (!rawInput.trim()) return alert("กรุณาป้อนชื่อนักเรียน!");

  state.students = rawInput.split("\n").map(n => n.trim()).filter(n => n.length > 0);
  localStorage.setItem("students_list", JSON.stringify(state.students));
  updateStudentsListUI();

  const mode = document.getElementById("group-mode-select").value;
  const size = parseInt(document.getElementById("group-size-val").value) || 2;

  // Shuffle students list
  const shuffled = [...state.students].sort(() => Math.random() - 0.5);
  state.groups = [];

  if (mode === "count") {
    // size represents number of groups wanted
    for (let i = 0; i < size; i++) {
      state.groups.push({ name: `กลุ่มที่ ${i + 1}`, members: [] });
    }
    shuffled.forEach((student, idx) => {
      state.groups[idx % size].members.push(student);
    });
  } else {
    // size represents member limit per group
    let groupIdx = 1;
    while (shuffled.length > 0) {
      const members = shuffled.splice(0, size);
      state.groups.push({ name: `กลุ่มที่ ${groupIdx++}`, members: members });
    }
  }

  renderGroupsUI();

  // Prepare Group Queue for Play Order
  state.currentGroupQueue = [...state.groups].sort(() => Math.random() - 0.5);
  renderQueueUI();
  saveSettingsToGAS();
});


function renderGroupsUI() {
  const container = document.getElementById("groups-list-display");
  container.innerHTML = state.groups.map((g, idx) => `
    <div class="group-card">
      <h4>${g.name} <span>(${g.members.length} คน)</span></h4>
      <ul>
        ${g.members.map(m => `<li>${m}</li>`).join("")}
      </ul>
    </div>
  `).join("");
}

function renderQueueUI() {
  const container = document.getElementById("queue-display-list");
  container.innerHTML = state.currentGroupQueue.map((g, idx) => {
    let statusClass = "";
    if (idx === state.currentPlayingIndex) statusClass = "active";
    else if (idx < state.currentPlayingIndex) statusClass = "done";

    return `
      <div class="queue-item ${statusClass}">
        <span>ลำดับที่ ${idx + 1}: <strong>${g.name}</strong></span>
        <span>(${g.members.length} คน)</span>
      </div>
    `;
  }).join("");
}

// Gameplay Action Handlers
document.getElementById("btn-start-game").addEventListener("click", () => {
  if (state.currentGroupQueue.length === 0) {
    alert("กรุณาจับกลุ่มนักเรียนในแดชบอร์ดก่อนเริ่มเกม!");
    return;
  }

  if (state.currentPlayingIndex === -1 || state.currentPlayingIndex >= state.currentGroupQueue.length) {
    state.currentPlayingIndex = 0;
  }

  startRound();
});

document.getElementById("btn-next-group").addEventListener("click", () => {
  if (state.currentPlayingIndex === -1) return;
  state.currentPlayingIndex++;
  if (state.currentPlayingIndex >= state.currentGroupQueue.length) {
    alert("เล่นครบทุกกลุ่มแล้ว!");
    state.currentPlayingIndex = -1;
    renderQueueUI();
    return;
  }
  startRound();
});

function startRound() {
  renderQueueUI();
  const group = state.currentGroupQueue[state.currentPlayingIndex];
  document.getElementById("current-group-title").innerText = `กำลังเล่น: ${group.name}`;

  // Reset game board
  generatePyramidSlots();
  initCups();

  // Timer setup
  state.timeLeft = state.globalTimeLimit;
  state.scoreCupsPlaced = 0;
  state.wordsRead = [];
  state.gameActive = true;
  document.getElementById("timer-display").innerText = `${state.timeLeft}s`;
  document.getElementById("live-score-display").innerText = "ความสูง: ชั้น 0 (วางแล้ว 0 แก้ว)";

  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    document.getElementById("timer-display").innerText = `${state.timeLeft}s`;

    if (state.timeLeft <= 0) {
      endRound();
    }
  }, 1000);
}

function endRound() {
  state.gameActive = false;
  clearInterval(state.timerInterval);

  const group = state.currentGroupQueue[state.currentPlayingIndex];

  // Show End of round Modal
  const heightText = document.getElementById("live-score-display").innerText;

  // Store score via JSON to GAS
  saveScoreToGAS(group.name, group.members || [], heightText, state.scoreCupsPlaced, state.wordsRead);

  // Trigger finished overlay
  const scoreModal = document.getElementById("score-modal");
  document.getElementById("modal-winner-text").innerText = `หมดเวลา! ${group.name}`;
  document.getElementById("modal-score-details").innerHTML = `
    <p style="font-size:1.2rem; margin-bottom: 0.5rem;">${heightText}</p>
    <p style="color:var(--text-muted)">คำศัพท์ที่ใช้: ${state.wordsRead.join(", ")}</p>
  `;
  scoreModal.classList.add("active");
}

document.getElementById("btn-close-score").addEventListener("click", () => {
  document.getElementById("score-modal").classList.remove("active");
});

// Settings & Words Management
document.getElementById("btn-add-word").addEventListener("click", () => {
  const newWord = document.getElementById("new-word-input").value.trim().toLowerCase();
  if (newWord && !state.words.includes(newWord)) {
    state.words.push(newWord);
    localStorage.setItem("words_list", JSON.stringify(state.words));
    updateWordsListUI();
    document.getElementById("new-word-input").value = "";
    saveSettingsToGAS();
  }
});

document.getElementById("btn-reset-words").addEventListener("click", () => {
  state.words = ["mas", "kan", "pun", "min", "lah", "dar", "pas", "tum", "run", "bor", "tek", "sing", "wan", "lam", "pos"];
  localStorage.setItem("words_list", JSON.stringify(state.words));
  updateWordsListUI();
  saveSettingsToGAS();
});

// GAS Syncing Core Mechanics
document.getElementById("btn-save-gas").addEventListener("click", () => {
  const url = document.getElementById("gas-url-input").value.trim();
  state.gasUrl = url;
  localStorage.setItem("gas_url", url);
  alert("บันทึก URL backend สำเร็จ!");
  fetchDataFromGAS();
});
// JSONP helper to bypass CORS when running from file:// origin
function jsonpRequest(url) {
  return new Promise((resolve, reject) => {
    const callbackName = "jsonp_cb_" + Math.random().toString(36).substring(2, 15);
    window[callbackName] = function (data) {
      resolve(data);
      cleanup();
    };

    function cleanup() {
      delete window[callbackName];
      const script = document.getElementById(callbackName);
      if (script) script.remove();
    }

    const separator = url.indexOf("?") === -1 ? "?" : "&";
    const script = document.createElement("script");
    script.id = callbackName;
    script.src = `${url}${separator}callback=${callbackName}`;
    script.onerror = () => {
      reject(new Error("JSONP request failed"));
      cleanup();
    };

    document.body.appendChild(script);
  });
}

function saveScoreToGAS(groupName, members, score, cupsPlaced, wordsUsed) {
  if (!state.gasUrl) {
    // Save locally if no URL setup
    state.scores.push({
      timestamp: new Date().toISOString(),
      groupName: groupName,
      members: members,
      score: score,
      cupsPlaced: cupsPlaced,
      wordsUsed: wordsUsed
    });
    localStorage.setItem("scores_list", JSON.stringify(state.scores));
    renderLeaderboard();
    return;
  }

  const url = `${state.gasUrl}?action=saveScore&groupName=${encodeURIComponent(groupName)}&members=${encodeURIComponent(JSON.stringify(members))}&score=${encodeURIComponent(score)}&cupsPlaced=${cupsPlaced}&wordsUsed=${encodeURIComponent(JSON.stringify(wordsUsed))}`;

  jsonpRequest(url)
    .then(() => {
      fetchDataFromGAS();
    })
    .catch(err => {
      console.error("Error saving score to GAS via JSONP:", err);
    });
}

function saveSettingsToGAS() {
  if (!state.gasUrl) return;

  const url = `${state.gasUrl}?action=saveSettings&students=${encodeURIComponent(JSON.stringify(state.students))}&words=${encodeURIComponent(JSON.stringify(state.words))}`;

  jsonpRequest(url)
    .catch(err => console.error("Error saving settings to GAS via JSONP:", err));
}

function fetchDataFromGAS() {
  if (!state.gasUrl) {
    // Load local scores fallback
    const localScr = localStorage.getItem("scores_list");
    state.scores = safeJsonParse(localScr, []);
    renderLeaderboard();
    return;
  }

  jsonpRequest(state.gasUrl)
    .then(data => {
      document.getElementById("db-status-warning").innerHTML = "";
      if (data.scores) state.scores = data.scores;
      if (data.students && data.students.length > 0) {
        state.students = data.students;
        updateStudentsListUI();
      }
      if (data.words && data.words.length > 0) {
        state.words = data.words;
        updateWordsListUI();
      }
      renderLeaderboard();
    })
    .catch(err => {
      console.error("Error fetching data from GAS via JSONP:", err);
      document.getElementById("db-status-warning").innerHTML = `
        <div class="status-badge fallback" style="display:flex; width:100%; margin-bottom:1.5rem; justify-content:center; padding: 0.75rem;">
          ⚠️ กำลังทำงานในโหมดออฟไลน์ (เชื่อมต่อ Google Sheet ไม่สำเร็จ โปรดตรวจสอบการ Deploy Web App เป็น 'Anyone' หรือตรวจสอบสัญญาณอินเทอร์เน็ต)
        </div>
      `;
      // Fallback to local storage on connection failure
      const localScr = localStorage.getItem("scores_list");
      state.scores = safeJsonParse(localScr, []);
      renderLeaderboard();
    });
}

function renderLeaderboard() {
  const container = document.getElementById("leaderboard-list");

  // Sort scores by cupsPlaced desc, then height desc
  const sorted = [...state.scores].sort((a, b) => b.cupsPlaced - a.cupsPlaced);

  container.innerHTML = sorted.map((s, idx) => {
    const membersList = Array.isArray(s.members) ? s.members.join(", ") : "-";
    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${s.groupName}</strong></td>
        <td style="font-size:0.9rem; color:var(--text-muted)">${membersList}</td>
        <td>${s.score}</td>
        <td>${s.cupsPlaced}</td>
        <td>${new Date(s.timestamp).toLocaleString()}</td>
      </tr>
    `;
  }).join("");
}

// Navigation Tabs
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    btn.classList.add("active");
    const tabId = btn.getAttribute("data-tab");
    document.getElementById(tabId).classList.add("active");

    if (tabId === "tab-game") {
      // Auto trigger webcam activation when switching to Game Room
      if (!state.cameraStream) {
        initMediaPipe();
      }
    }
  });
});

// App Startup
window.addEventListener("DOMContentLoaded", () => {
  generatePyramidSlots();
  initCups();
  loadSettingsData();
  fetchDataFromGAS();
  drawGame();

  // แสดงเวลาเริ่มต้นตามที่ครูกำหนดไว้ใน global-time-input
  const timerDisplay = document.getElementById("timer-display");
  const globalTimeInput = document.getElementById("global-time-input");
  timerDisplay.innerText = `${state.globalTimeLimit}s`;

  // อัปเดต timer-display ทันทีเมื่อครูเปลี่ยนค่าเวลา (ก่อนเริ่มเกม)
  globalTimeInput.addEventListener("input", () => {
    if (!state.gameActive) {
      const val = parseInt(globalTimeInput.value, 10) || 60;
      timerDisplay.innerText = `${val}s`;
    }
  });
});

