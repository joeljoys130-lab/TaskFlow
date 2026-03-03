/* ============================================================
   TaskFlow – App Logic (app.js)
   ============================================================ */

"use strict";

// ── State ──────────────────────────────────────────────────
let tasks = [];
let currentFilter = "all";
let currentSort = "newest";
let searchQuery = "";
let editingId = null;
let isZenMode = false;

// ── DOM Refs ───────────────────────────────────────────────
const taskInput = document.getElementById("taskInput");
const addBtn = document.getElementById("addBtn");
const voiceBtn = document.getElementById("voiceBtn");
const prioritySelect = document.getElementById("prioritySelect");
const categorySelect = document.getElementById("categorySelect");
const dueDateInput = document.getElementById("dueDateInput");
const taskList = document.getElementById("taskList");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const sortSelect = document.getElementById("sortSelect");
const filterTabs = document.querySelectorAll(".filter-tab");
const themeToggle = document.getElementById("themeToggle");
const zenModeBtn = document.getElementById("zenModeBtn");
const exitZenBtn = document.getElementById("exitZenBtn");
const toast = document.getElementById("toast");
const dateDisplay = document.getElementById("date-display");
const bulkClearCompleted = document.getElementById("clearCompleted");
const bulkClearAll = document.getElementById("clearAll");
// Add Task Modal
const openAddModalBtn = document.getElementById("openAddModalBtn");
const addTaskOverlay = document.getElementById("addTaskOverlay");
const closeAddModal = document.getElementById("closeAddModal");
// Confirm dialog
const confirmOverlay = document.getElementById("confirmOverlay");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMsg = document.getElementById("confirmMsg");
const confirmIcon = document.getElementById("confirmIcon");
const confirmOk = document.getElementById("confirmOk");
const confirmCancel = document.getElementById("confirmCancel");
// Modal
const modalOverlay = document.getElementById("modalOverlay");
const editInput = document.getElementById("editInput");
const editPriority = document.getElementById("editPriority");
const editCategory = document.getElementById("editCategory");
const editDueDate = document.getElementById("editDueDate");
const editNotes = document.getElementById("editNotes");
const modalClose = document.getElementById("modalClose");
const modalCancel = document.getElementById("modalCancel");
const modalSave = document.getElementById("modalSave");
// Timer Modal
const timerOverlay = document.getElementById("timerOverlay");
const timerClose = document.getElementById("timerClose");
const timerTaskName = document.getElementById("timerTaskName");
const timerDisplay = document.getElementById("timerDisplay");
const timerStartBtn = document.getElementById("timerStart");
const timerPauseBtn = document.getElementById("timerPause");
const timerResetBtn = document.getElementById("timerReset");
// Stats
const statTotal = document.getElementById("stat-total");
const statActive = document.getElementById("stat-active");
const statDone = document.getElementById("stat-done");
const ringFill = document.getElementById("ringFill");
const ringPct = document.getElementById("ringPct");

// ── Utilities ──────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function notifyDevice(title, body, taskId = null) {
  if (!("Notification" in window)) return;

  const showNotification = () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => {
          const options = {
            body: body,
            icon: "icon.svg",
            vibrate: [200, 100, 200],
          };
          if (taskId) {
            options.data = { taskId: taskId };
            options.actions = [
              { action: "mark-done", title: "✅ Mark as Done" },
              { action: "open", title: "Open App" },
            ];
          }
          registration.showNotification(title, options);
        })
        .catch(() => {
          new Notification(title, { body, icon: "icon.svg" });
        });
    } else {
      new Notification(title, { body, icon: "icon.svg" });
    }
  };

  if (Notification.permission === "granted") {
    showNotification();
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        showNotification();
      }
    });
  }
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const datePart = dateStr.split("T")[0];
  const timePart = dateStr.split("T")[1];
  const [y, m, d] = datePart.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let formatted = `${d} ${months[+m - 1]}`;
  if (timePart) {
    let [hh, mm] = timePart.split(":");
    const ampm = +hh >= 12 ? "PM" : "AM";
    const h = +hh % 12 || 12;
    formatted += ` ${h}:${mm} ${ampm}`;
  }
  return formatted;
}

function isOverdue(dateStr) {
  return dateStr && dateStr.split("T")[0] < today();
}

function isToday(dateStr) {
  return dateStr && dateStr.split("T")[0] === today();
}

function dayOfWeek() {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[new Date().getDay()];
}

function formatFullDate() {
  const d = new Date();
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${dayOfWeek()}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Persistence ────────────────────────────────────────────
function saveTasks() {
  try {
    localStorage.setItem("taskflow_tasks", JSON.stringify(tasks));
  } catch (_) { }
  syncTasksToCloud();
}

async function syncTasksToCloud() {
  console.log("[SYNC] syncTasksToCloud started");
  // Only attempt if auth.js has loaded Firebase and a session exists
  if (typeof firebase === "undefined" || typeof getSession === "undefined")
    return console.log("[SYNC] Missing firebase or getSession");
  const session = getSession();
  if (!session || !session.id)
    return console.log("[SYNC] Missing session or session.id");

  // Ensure Firebase Auth is fully initialized
  await new Promise((resolve) => {
    const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
      console.log("[SYNC] ToCloud onAuthStateChanged fired, user =", user?.uid);
      unsubscribe();
      resolve(user);
    });
  });

  if (!firebase.auth().currentUser) {
    return console.log("[SYNC] No firebase currentUser, aborting save");
  }

  try {
    console.log("[SYNC] Executing firestore save for doc", session.id, tasks);
    await firebase.firestore().collection("user_tasks").doc(session.id).set({
      tasks: tasks,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    console.log("[SYNC] Save successful!");
  } catch (err) {
    console.error("[SYNC] Firebase save error:", err);
    showAuthToast("⚠️ Error saving to cloud");
  }
}

async function syncTasksFromCloud() {
  console.log("[SYNC] syncTasksFromCloud started");
  if (typeof firebase === "undefined" || typeof getSession === "undefined")
    return console.log("[SYNC] Missing firebase or getSession");
  const session = getSession();
  if (!session || !session.id)
    return console.log("[SYNC] Missing session or session.id");

  // Ensure Firebase Auth is fully initialized
  await new Promise((resolve) => {
    const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
      console.log(
        "[SYNC] FromCloud onAuthStateChanged fired, user =",
        user?.uid,
      );
      unsubscribe();
      resolve(user);
    });
  });

  if (!firebase.auth().currentUser) {
    return console.log("[SYNC] No firebase currentUser, aborting load");
  }

  try {
    console.log("[SYNC] Executing firestore get for doc", session.id);
    const doc = await firebase
      .firestore()
      .collection("user_tasks")
      .doc(session.id)
      .get();
    if (doc.exists && doc.data().tasks) {
      console.log("[SYNC] Retrieved tasks from cloud", doc.data().tasks);
      tasks = doc.data().tasks;
      try {
        localStorage.setItem("taskflow_tasks", JSON.stringify(tasks));
      } catch (_) { }
      render();
      showAuthToast("☁️ Tasks synced from cloud!");
    } else {
      console.log("[SYNC] No tasks found in cloud doc.");
    }
  } catch (err) {
    console.error("[SYNC] Firebase load error:", err);
    showAuthToast("⚠️ Error loading from cloud");
  }
}

function clearLocalTasks() {
  tasks = [];
  try {
    localStorage.removeItem("taskflow_tasks");
  } catch (_) { }
  render();
}

function loadTasks() {
  try {
    const saved = localStorage.getItem("taskflow_tasks");
    if (saved) tasks = JSON.parse(saved);
  } catch (_) {
    tasks = [];
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem("taskflow_theme", theme);
  } catch (_) { }
}

function loadTheme() {
  try {
    return localStorage.getItem("taskflow_theme") || "dark";
  } catch (_) {
    return "dark";
  }
}

// ── Theme ──────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  saveTheme(theme);
}

// ── Toast ──────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, duration = 2200) {
  toast.textContent = msg;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}

// ── Priority order ─────────────────────────────────────────
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// ── Filter & Sort Tasks ────────────────────────────────────
function getFilteredTasks() {
  let filtered = [...tasks];

  if (isZenMode) {
    // Show up to 3 non-completed tasks prioritized
    filtered = filtered.filter(t => !t.completed);
    filtered.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    return filtered.slice(0, 3);
  }

  // Search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.text.toLowerCase().includes(q) ||
        (t.notes && t.notes.toLowerCase().includes(q)) ||
        t.category.toLowerCase().includes(q),
    );
  }

  // Filter tab
  if (currentFilter === "active") {
    filtered = filtered.filter((t) => !t.completed);
  } else if (currentFilter === "completed") {
    filtered = filtered.filter((t) => t.completed);
  } else if (currentFilter === "high") {
    filtered = filtered.filter((t) => t.priority === "high");
  } else if (currentFilter === "today") {
    filtered = filtered.filter((t) => isToday(t.dueDate));
  }

  // Sort
  if (currentSort === "newest") {
    filtered.sort((a, b) => b.createdAt - a.createdAt);
  } else if (currentSort === "oldest") {
    filtered.sort((a, b) => a.createdAt - b.createdAt);
  } else if (currentSort === "priority") {
    filtered.sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
    );
  } else if (currentSort === "duedate") {
    filtered.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  } else if (currentSort === "alpha") {
    filtered.sort((a, b) => a.text.localeCompare(b.text));
  }

  return filtered;
}

// ── Render Task Item ───────────────────────────────────────
function createTaskEl(task) {
  const li = document.createElement("li");
  li.className = "task-item" + (task.completed ? " completed" : "");
  li.dataset.id = task.id;
  li.dataset.priority = task.priority;

  const catEmoji = {
    personal: "👤",
    work: "💼",
    health: "🏃",
    shopping: "🛒",
    learning: "📚",
    other: "📌",
  };
  const priorityLabel = { high: "High", medium: "Medium", low: "Low" };

  let dueBadge = "";
  if (task.dueDate) {
    const cls =
      isOverdue(task.dueDate) && !task.completed
        ? "badge-due overdue"
        : isToday(task.dueDate)
          ? "badge-due today"
          : "badge-due";
    const prefix =
      isOverdue(task.dueDate) && !task.completed
        ? "⚠️ "
        : isToday(task.dueDate)
          ? "⏰ "
          : "📅 ";
    dueBadge = `<span class="${cls}">${prefix}${formatDate(task.dueDate)}</span>`;
  }

  li.innerHTML = `
    <div class="task-check-wrap">
      <input class="task-check" type="checkbox" ${task.completed ? "checked" : ""}
        aria-label="Mark task as ${task.completed ? "incomplete" : "complete"}"
        id="chk-${task.id}" />
    </div>
    <div class="task-content">
      <p class="task-text">${escapeHtml(task.text)}</p>
      <div class="task-meta">
        <span class="task-badge badge-priority-${task.priority}">${priorityLabel[task.priority]}</span>
        <span class="task-badge badge-cat">${catEmoji[task.category] || "📌"} ${capitalize(task.category)}</span>
        ${dueBadge}
      </div>
      ${task.notes ? `<p class="task-notes">${escapeHtml(task.notes)}</p>` : ""}
    </div>
    <div class="task-actions">
      <button class="task-action-btn focus-btn" data-id="${task.id}" title="Focus Timer" aria-label="Start Timer">⏱️</button>
      <button class="task-action-btn edit" data-id="${task.id}" title="Edit task" aria-label="Edit task">✏️</button>
      <button class="task-action-btn del" data-id="${task.id}" title="Delete task" aria-label="Delete task">🗑️</button>
    </div>
  `;

  // Toggle complete
  li.querySelector(".task-check").addEventListener("change", () =>
    toggleTask(task.id),
  );
  // Focus Timer
  li.querySelector(".focus-btn").addEventListener("click", () =>
    openTimerModal(task),
  );
  // Edit
  li.querySelector(".edit").addEventListener("click", () =>
    openEditModal(task.id),
  );
  // Delete
  li.querySelector(".del").addEventListener("click", () =>
    deleteTask(task.id, li),
  );

  return li;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Render ─────────────────────────────────────────────────
function render() {
  const filtered = getFilteredTasks();
  taskList.innerHTML = "";

  if (filtered.length === 0) {
    emptyState.classList.add("visible");
  } else {
    emptyState.classList.remove("visible");
    filtered.forEach((task) => taskList.appendChild(createTaskEl(task)));
  }

  updateStats();
}

// ── Stats ──────────────────────────────────────────────────
function updateStats() {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const active = total - done;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  statTotal.textContent = total;
  statActive.textContent = active;
  statDone.textContent = done;
  ringPct.textContent = pct + "%";

  // Ring circumference = 2 * π * 20 ≈ 125.66
  const circumference = 125.66;
  const offset = circumference - (pct / 100) * circumference;
  ringFill.style.strokeDashoffset = offset;
}

// Inject gradient for ring SVG
function injectSvgGradients() {
  const svg = document.querySelector(".progress-ring");
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
  `;
  svg.prepend(defs);
}

// ── Add Task ───────────────────────────────────────────────
function addTask() {
  let text = taskInput.value.trim();
  if (!text) {
    taskInput.focus();
    taskInput.classList.add("shake");
    setTimeout(() => taskInput.classList.remove("shake"), 500);
    return;
  }

  // Smart Date Parsing via Chrono
  let parsedDate = "";
  if (typeof chrono !== "undefined") {
    const results = chrono.parse(text);
    if (results && results.length > 0) {
      // Pick the first parsed date
      const result = results[0];
      // Format to YYYY-MM-DDTHH:mm
      const start = result.start.date();
      const yyyy = start.getFullYear();
      const MM = String(start.getMonth() + 1).padStart(2, "0");
      const dd = String(start.getDate()).padStart(2, "0");
      const hh = String(start.getHours()).padStart(2, "0");
      const mm = String(start.getMinutes()).padStart(2, "0");
      parsedDate = `${yyyy}-${MM}-${dd}T${hh}:${mm}`;

      // Remove the detected text string from the title
      text = text.replace(result.text, "").trim();
      // Clean up stranded words like "at" or "on"
      text = text.replace(/\s+(at|on|for)$/i, "").trim();
    }
  }

  const finalDueDate = dueDateInput.value || parsedDate;

  const task = {
    id: uid(),
    text,
    priority: prioritySelect.value,
    category: categorySelect.value,
    dueDate: finalDueDate,
    notes: "",
    completed: false,
    notified1hr: false,
    notified15m: false,
    notifiedDue: false,
    createdAt: Date.now(),
  };

  tasks.unshift(task);
  saveTasks();

  if (
    "Notification" in window &&
    Notification.permission !== "granted" &&
    Notification.permission !== "denied"
  ) {
    Notification.requestPermission();
  }

  taskInput.value = "";
  taskInput.blur(); // Remove focus since it's going away

  if (addTaskOverlay) {
    addTaskOverlay.classList.remove("active");
  }

  showToast("✅ Task added!");
  render();
}

// ── Toggle Complete ────────────────────────────────────────
function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  saveTasks();
  render();
  showToast(task.completed ? "🎉 Task completed!" : "↩️ Task reopened");
}

// ── Delete Task ────────────────────────────────────────────
function deleteTask(id, liEl) {
  liEl.classList.add("removing");
  setTimeout(() => {
    tasks = tasks.filter((t) => t.id !== id);
    saveTasks();
    render();
    showToast("🗑️ Task deleted");
  }, 240);
}

// ── Edit Modal ─────────────────────────────────────────────
function openEditModal(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  editingId = id;
  editInput.value = task.text;
  editPriority.value = task.priority;
  editCategory.value = task.category;
  editDueDate.value = task.dueDate || "";
  editNotes.value = task.notes || "";
  modalOverlay.classList.add("open");
  setTimeout(() => editInput.focus(), 100);
}

function closeModal() {
  modalOverlay.classList.remove("open");
  editingId = null;
}

function saveEdit() {
  const text = editInput.value.trim();
  if (!text) {
    editInput.focus();
    return;
  }
  const task = tasks.find((t) => t.id === editingId);
  if (!task) return;
  task.text = text;
  task.priority = editPriority.value;
  task.category = editCategory.value;
  if (task.dueDate !== editDueDate.value) {
    task.notified1hr = false;
    task.notified15m = false;
    task.notifiedDue = false;
  }
  task.dueDate = editDueDate.value || "";
  task.notes = editNotes.value.trim();
  saveTasks();
  render();
  closeModal();
  showToast("✏️ Task updated!");

  if (
    "Notification" in window &&
    Notification.permission !== "granted" &&
    Notification.permission !== "denied"
  ) {
    Notification.requestPermission();
  }
}

// ── Timer Logic ────────────────────────────────────────────
let focusTimeSec = 25 * 60; // 25 mins
let focusInterval = null;

function updateTimerDisplay() {
  const m = Math.floor(focusTimeSec / 60);
  const s = focusTimeSec % 60;
  timerDisplay.textContent = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function openTimerModal(task) {
  timerTaskName.textContent = task.text;
  focusTimeSec = 25 * 60;
  updateTimerDisplay();
  clearInterval(focusInterval);
  timerStartBtn.style.display = "block";
  timerPauseBtn.style.display = "none";
  timerOverlay.classList.add("open");
}

function closeTimerModal() {
  timerOverlay.classList.remove("open");
  clearInterval(focusInterval);
}

timerStartBtn.addEventListener("click", () => {
  timerStartBtn.style.display = "none";
  timerPauseBtn.style.display = "block";
  focusInterval = setInterval(() => {
    focusTimeSec--;
    updateTimerDisplay();
    if (focusTimeSec <= 0) {
      clearInterval(focusInterval);
      timerStartBtn.style.display = "block";
      timerPauseBtn.style.display = "none";
      notifyDevice(
        "🎉 Focus Session Complete!",
        "Great job! Take a short break.",
      );
    }
  }, 1000);
});

timerPauseBtn.addEventListener("click", () => {
  clearInterval(focusInterval);
  timerStartBtn.style.display = "block";
  timerPauseBtn.style.display = "none";
});

timerResetBtn.addEventListener("click", () => {
  clearInterval(focusInterval);
  focusTimeSec = 25 * 60;
  updateTimerDisplay();
  timerStartBtn.style.display = "block";
  timerPauseBtn.style.display = "none";
});

timerClose.addEventListener("click", closeTimerModal);
timerOverlay.addEventListener("click", (e) => {
  if (e.target === timerOverlay) closeTimerModal();
});

// ── Custom Confirm Dialog ──────────────────────────────────
let confirmResolve = null;

function showConfirm({
  icon = "⚠️",
  title = "Are you sure?",
  msg = "This action cannot be undone.",
  okLabel = "Confirm",
} = {}) {
  confirmIcon.textContent = icon;
  confirmTitle.textContent = title;
  confirmMsg.textContent = msg;
  confirmOk.textContent = okLabel;
  confirmOverlay.classList.add("open");
  confirmCancel.focus();
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

function closeConfirm(result) {
  confirmOverlay.classList.remove("open");
  if (confirmResolve) {
    confirmResolve(result);
    confirmResolve = null;
  }
}

confirmOk.addEventListener("click", () => closeConfirm(true));
confirmCancel.addEventListener("click", () => closeConfirm(false));
confirmOverlay.addEventListener("click", (e) => {
  if (e.target === confirmOverlay) closeConfirm(false);
});

// ── Clear Actions ──────────────────────────────────────────
function clearCompleted() {
  const count = tasks.filter((t) => t.completed).length;
  if (count === 0) {
    showToast("No completed tasks to clear");
    return;
  }
  tasks = tasks.filter((t) => !t.completed);
  saveTasks();
  render();
  showToast(`🗑️ Cleared ${count} completed task${count > 1 ? "s" : ""}`);
}

async function clearAll() {
  if (tasks.length === 0) {
    showToast("No tasks to clear");
    return;
  }
  const confirmed = await showConfirm({
    icon: "🗑️",
    title: "Delete All Tasks?",
    msg: `This will permanently remove all ${tasks.length} task${tasks.length > 1 ? "s" : ""}. This cannot be undone.`,
    okLabel: "Delete All",
  });
  if (!confirmed) return;
  tasks = [];
  saveTasks();
  render();
  showToast("🧹 All tasks cleared");
}

// ── Event Listeners ────────────────────────────────────────
if (zenModeBtn) {
  zenModeBtn.addEventListener("click", () => {
    isZenMode = true;
    document.body.classList.add("zen-mode");
    render();
  });
}

if (exitZenBtn) {
  exitZenBtn.addEventListener("click", () => {
    isZenMode = false;
    document.body.classList.remove("zen-mode");
    render();
  });
}

if (openAddModalBtn) {
  openAddModalBtn.addEventListener("click", () => {
    addTaskOverlay.classList.add("active");
    setTimeout(() => taskInput.focus(), 100);
  });
}

if (closeAddModal) {
  closeAddModal.addEventListener("click", () => {
    addTaskOverlay.classList.remove("active");
  });
}

if (addTaskOverlay) {
  addTaskOverlay.addEventListener("click", (e) => {
    if (e.target === addTaskOverlay) addTaskOverlay.classList.remove("active");
  });
}

addBtn.addEventListener("click", addTask);

taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTask();
});

// Filter Tabs
filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    filterTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.dataset.filter;
    render();
  });
});

// Sort
sortSelect.addEventListener("change", () => {
  currentSort = sortSelect.value;
  render();
});

// Search
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  clearSearch.classList.toggle("visible", searchQuery.length > 0);
  render();
});

clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  searchQuery = "";
  clearSearch.classList.remove("visible");
  render();
});

// Theme
themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
});

// Modal
modalClose.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);
modalSave.addEventListener("click", saveEdit);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (confirmOverlay.classList.contains("open")) closeConfirm(false);
    else closeModal();
  }
});
editInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveEdit();
});

// Bulk
bulkClearCompleted.addEventListener("click", clearCompleted);
bulkClearAll.addEventListener("click", clearAll);

// ── Voice Input (Speech Recognition) ─────────────────────────
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onstart = function () {
    voiceBtn.classList.add("listening");
    taskInput.placeholder = "Listening... Speak now 🎙️";
  };

  recognition.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    taskInput.value = transcript;
    taskInput.focus();
  };

  recognition.onend = function () {
    voiceBtn.classList.remove("listening");
    taskInput.placeholder = "What needs to be done? ✨";
  };

  recognition.onerror = function (event) {
    voiceBtn.classList.remove("listening");
    taskInput.placeholder = "What needs to be done? ✨";
    showToast("⚠️ Voice input error: " + event.error);
  };

  voiceBtn.addEventListener("click", () => {
    if (voiceBtn.classList.contains("listening")) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });
} else {
  // Hide or disable the button if speeches are not supported
  voiceBtn.style.display = "none";
}

// ── Quick Picks & Flatpickr ──────────────────────────────────
let fpAdd, fpEdit;

function initDatePickers() {
  const config = {
    enableTime: true,
    altInput: true,
    altFormat: "M j, h:i K",
    dateFormat: "Y-m-d\\TH:i",
    time_24hr: false,
    disableMobile: true, // Forces Flatpickr UI on mobile for consistent 12-hour formatting
  };
  fpAdd = flatpickr(dueDateInput, config);
  fpEdit = flatpickr(editDueDate, config);
}

function setDatePreset(fpInstance, preset) {
  if (preset === "clear") {
    fpInstance.clear();
    return;
  }

  const d = new Date();
  d.setSeconds(0);
  d.setMilliseconds(0);

  if (preset === "1h") d.setHours(d.getHours() + 1);
  else if (preset === "tonight") d.setHours(20, 0);
  else if (preset === "tmrw") d.setDate(d.getDate() + 1);
  else if (preset === "wknd") {
    const daysToSat = 6 - d.getDay();
    d.setDate(d.getDate() + (daysToSat <= 0 ? 6 : daysToSat));
    d.setHours(10, 0);
  }

  fpInstance.setDate(d, true); // true to trigger change event
}

document.querySelectorAll("#addQuickPicks .qp-btn").forEach((btn) => {
  btn.addEventListener("click", () => setDatePreset(fpAdd, btn.dataset.preset));
});

document.querySelectorAll("#editQuickPicks .qp-btn").forEach((btn) => {
  btn.addEventListener("click", () =>
    setDatePreset(fpEdit, btn.dataset.preset),
  );
});

// ── Shake animation ────────────────────────────────────────
const shakeStyle = document.createElement("style");
shakeStyle.textContent = `
  @keyframes shake {
    0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)}
  }
  .shake { animation: shake .4s ease !important; border-color: #ef4444 !important; }
`;
document.head.appendChild(shakeStyle);

// ── Reminders ──────────────────────────────────────────────
function checkReminders() {
  const now = new Date();
  let updated = false;
  let notifsSent = 0; // Prevent spamming dozens of notifications at once

  tasks.forEach((task) => {
    if (task.completed || !task.dueDate) return;

    const dueTime = new Date(task.dueDate);
    const diffMs = dueTime.getTime() - now.getTime();
    const diffMins = diffMs / (1000 * 60);

    // Anti-Spam: Do not notify if this task was *just* created within the last 1 minute
    const ageMins = (now.getTime() - (task.createdAt || 0)) / (1000 * 60);
    if (ageMins < 1) return;

    // Reminder 1: 1 Hour Before Due
    if (diffMins > 55 && diffMins <= 61 && !task.notified1hr) {
      task.notified1hr = true;
      updated = true;
      if (notifsSent < 2) {
        notifyDevice(
          "⏰ Almost Due",
          `"${task.text}" is due in about 1 hour!`,
          task.id,
        );
        notifsSent++;
      }
    }

    // Reminder 2: 15 Minutes Before Due
    if (diffMins > 13 && diffMins <= 16 && !task.notified15m) {
      task.notified15m = true;
      updated = true;
      if (notifsSent < 2) {
        notifyDevice(
          "⏳ Getting Close",
          `"${task.text}" is due in 15 minutes!`,
          task.id,
        );
        notifsSent++;
      }
    }

    // Reminder 3: "Due Now" (Exactly when due or past due up to 2 hours)
    if (diffMins <= 0 && diffMins > -120 && !task.notifiedDue) {
      task.notifiedDue = true;
      updated = true;
      if (notifsSent < 2) {
        notifyDevice(
          "🚨 Task Due Now!",
          `It's time for "${task.text}"`,
          task.id,
        );
        notifsSent++;
      }
    }
  });

  if (updated) saveTasks();
}
setInterval(checkReminders, 60000); // Check every minute

// Listen for SW Messages
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "MARK_DONE") {
      const task = tasks.find((t) => t.id === event.data.taskId);
      if (task && !task.completed) {
        task.completed = true;
        saveTasks();
        render();
        showToast("🎉 Task marked as complete from notification!");
      }
    }
  });
}

// ── Init ───────────────────────────────────────────────────
function init() {
  loadTasks();

  // Check if app was opened via a notification action
  const params = new URLSearchParams(window.location.search);
  if (params.get("action") === "mark-done") {
    const taskId = params.get("taskId");
    const task = tasks.find((t) => t.id === taskId);
    if (task && !task.completed) {
      task.completed = true;
      saveTasks();
      setTimeout(() => showToast("🎉 Task completed from notification!"), 500);
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  applyTheme(loadTheme());
  injectSvgGradients();
  initDatePickers();
  dateDisplay.textContent = formatFullDate();
  // Default due date = today
  // dueDateInput.value = today(); // optional
  render();
  // No demo tasks - starting fresh per user request
}

init();
