/* ============================================================
   TaskFlow – App Logic (app.js)
   ============================================================ */

'use strict';

// ── State ──────────────────────────────────────────────────
let tasks = [];
let currentFilter = 'all';
let currentSort = 'newest';
let searchQuery = '';
let editingId = null;

// ── DOM Refs ───────────────────────────────────────────────
const taskInput = document.getElementById('taskInput');
const addBtn = document.getElementById('addBtn');
const prioritySelect = document.getElementById('prioritySelect');
const categorySelect = document.getElementById('categorySelect');
const dueDateInput = document.getElementById('dueDateInput');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const clearSearch = document.getElementById('clearSearch');
const sortSelect = document.getElementById('sortSelect');
const filterTabs = document.querySelectorAll('.filter-tab');
const themeToggle = document.getElementById('themeToggle');
const toast = document.getElementById('toast');
const dateDisplay = document.getElementById('date-display');
const bulkClearCompleted = document.getElementById('clearCompleted');
const bulkClearAll = document.getElementById('clearAll');
// Confirm dialog
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmTitle = document.getElementById('confirmTitle');
const confirmMsg = document.getElementById('confirmMsg');
const confirmIcon = document.getElementById('confirmIcon');
const confirmOk = document.getElementById('confirmOk');
const confirmCancel = document.getElementById('confirmCancel');
// Modal
const modalOverlay = document.getElementById('modalOverlay');
const editInput = document.getElementById('editInput');
const editPriority = document.getElementById('editPriority');
const editCategory = document.getElementById('editCategory');
const editDueDate = document.getElementById('editDueDate');
const editNotes = document.getElementById('editNotes');
const modalClose = document.getElementById('modalClose');
const modalCancel = document.getElementById('modalCancel');
const modalSave = document.getElementById('modalSave');
// Stats
const statTotal = document.getElementById('stat-total');
const statActive = document.getElementById('stat-active');
const statDone = document.getElementById('stat-done');
const ringFill = document.getElementById('ringFill');
const ringPct = document.getElementById('ringPct');

// ── Utilities ──────────────────────────────────────────────
function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function today() {
    return new Date().toISOString().split('T')[0];
}

function notifyDevice(title, body) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
        new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                new Notification(title, { body });
            }
        });
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const datePart = dateStr.split('T')[0];
    const timePart = dateStr.split('T')[1];
    const [y, m, d] = datePart.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let formatted = `${d} ${months[+m - 1]}`;
    if (timePart) {
        let [hh, mm] = timePart.split(':');
        const ampm = +hh >= 12 ? 'PM' : 'AM';
        const h = +hh % 12 || 12;
        formatted += ` ${h}:${mm} ${ampm}`;
    }
    return formatted;
}

function isOverdue(dateStr) {
    return dateStr && dateStr.split('T')[0] < today();
}

function isToday(dateStr) {
    return dateStr && dateStr.split('T')[0] === today();
}

function dayOfWeek() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
}

function formatFullDate() {
    const d = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${dayOfWeek()}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Persistence ────────────────────────────────────────────
function saveTasks() {
    try { localStorage.setItem('taskflow_tasks', JSON.stringify(tasks)); } catch (_) { }
    syncTasksToCloud();
}

function syncTasksToCloud() {
    // Only attempt if auth.js has loaded Firebase and a session exists
    if (!window.firebase || !window.getSession) return;
    const session = getSession();
    if (!session || !session.userId) return;

    try {
        firebase.firestore().collection('user_tasks').doc(session.userId).set({
            tasks: tasks,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.log('Firebase save error:', err);
    }
}

async function syncTasksFromCloud() {
    if (!window.firebase || !window.getSession) return;
    const session = getSession();
    if (!session || !session.userId) return;

    try {
        const doc = await firebase.firestore().collection('user_tasks').doc(session.userId).get();
        if (doc.exists && doc.data().tasks) {
            tasks = doc.data().tasks;
            try { localStorage.setItem('taskflow_tasks', JSON.stringify(tasks)); } catch (_) { }
            render();
            showToast('☁️ Tasks synced from cloud!');
        }
    } catch (err) {
        console.log('Firebase load error:', err);
    }
}

function clearLocalTasks() {
    tasks = [];
    try { localStorage.removeItem('taskflow_tasks'); } catch (_) { }
    render();
}

function loadTasks() {
    try {
        const saved = localStorage.getItem('taskflow_tasks');
        if (saved) tasks = JSON.parse(saved);
    } catch (_) { tasks = []; }
}

function saveTheme(theme) {
    try { localStorage.setItem('taskflow_theme', theme); } catch (_) { }
}

function loadTheme() {
    try { return localStorage.getItem('taskflow_theme') || 'dark'; } catch (_) { return 'dark'; }
}

// ── Theme ──────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    saveTheme(theme);
}

// ── Toast ──────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, duration = 2200) {
    toast.textContent = msg;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ── Priority order ─────────────────────────────────────────
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// ── Filter & Sort Tasks ────────────────────────────────────
function getFilteredTasks() {
    let filtered = [...tasks];

    // Search
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(t =>
            t.text.toLowerCase().includes(q) ||
            (t.notes && t.notes.toLowerCase().includes(q)) ||
            t.category.toLowerCase().includes(q)
        );
    }

    // Filter tab
    if (currentFilter === 'active') {
        filtered = filtered.filter(t => !t.completed);
    } else if (currentFilter === 'completed') {
        filtered = filtered.filter(t => t.completed);
    } else if (currentFilter === 'high') {
        filtered = filtered.filter(t => t.priority === 'high');
    } else if (currentFilter === 'today') {
        filtered = filtered.filter(t => isToday(t.dueDate));
    }

    // Sort
    if (currentSort === 'newest') {
        filtered.sort((a, b) => b.createdAt - a.createdAt);
    } else if (currentSort === 'oldest') {
        filtered.sort((a, b) => a.createdAt - b.createdAt);
    } else if (currentSort === 'priority') {
        filtered.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    } else if (currentSort === 'duedate') {
        filtered.sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate.localeCompare(b.dueDate);
        });
    } else if (currentSort === 'alpha') {
        filtered.sort((a, b) => a.text.localeCompare(b.text));
    }

    return filtered;
}

// ── Render Task Item ───────────────────────────────────────
function createTaskEl(task) {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.completed ? ' completed' : '');
    li.dataset.id = task.id;
    li.dataset.priority = task.priority;

    const catEmoji = { personal: '👤', work: '💼', health: '🏃', shopping: '🛒', learning: '📚', other: '📌' };
    const priorityLabel = { high: 'High', medium: 'Medium', low: 'Low' };

    let dueBadge = '';
    if (task.dueDate) {
        const cls = isOverdue(task.dueDate) && !task.completed
            ? 'badge-due overdue'
            : isToday(task.dueDate)
                ? 'badge-due today'
                : 'badge-due';
        const prefix = isOverdue(task.dueDate) && !task.completed ? '⚠️ ' : isToday(task.dueDate) ? '⏰ ' : '📅 ';
        dueBadge = `<span class="${cls}">${prefix}${formatDate(task.dueDate)}</span>`;
    }

    li.innerHTML = `
    <div class="task-check-wrap">
      <input class="task-check" type="checkbox" ${task.completed ? 'checked' : ''}
        aria-label="Mark task as ${task.completed ? 'incomplete' : 'complete'}"
        id="chk-${task.id}" />
    </div>
    <div class="task-content">
      <p class="task-text">${escapeHtml(task.text)}</p>
      <div class="task-meta">
        <span class="task-badge badge-priority-${task.priority}">${priorityLabel[task.priority]}</span>
        <span class="task-badge badge-cat">${catEmoji[task.category] || '📌'} ${capitalize(task.category)}</span>
        ${dueBadge}
      </div>
      ${task.notes ? `<p class="task-notes">${escapeHtml(task.notes)}</p>` : ''}
    </div>
    <div class="task-actions">
      <button class="task-action-btn edit" data-id="${task.id}" title="Edit task" aria-label="Edit task">✏️</button>
      <button class="task-action-btn del" data-id="${task.id}" title="Delete task" aria-label="Delete task">🗑️</button>
    </div>
  `;

    // Toggle complete
    li.querySelector('.task-check').addEventListener('change', () => toggleTask(task.id));
    // Edit
    li.querySelector('.edit').addEventListener('click', () => openEditModal(task.id));
    // Delete
    li.querySelector('.del').addEventListener('click', () => deleteTask(task.id, li));

    return li;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Render ─────────────────────────────────────────────────
function render() {
    const filtered = getFilteredTasks();
    taskList.innerHTML = '';

    if (filtered.length === 0) {
        emptyState.classList.add('visible');
    } else {
        emptyState.classList.remove('visible');
        filtered.forEach(task => taskList.appendChild(createTaskEl(task)));
    }

    updateStats();
}

// ── Stats ──────────────────────────────────────────────────
function updateStats() {
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    const active = total - done;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    statTotal.textContent = total;
    statActive.textContent = active;
    statDone.textContent = done;
    ringPct.textContent = pct + '%';

    // Ring circumference = 2 * π * 20 ≈ 125.66
    const circumference = 125.66;
    const offset = circumference - (pct / 100) * circumference;
    ringFill.style.strokeDashoffset = offset;
}

// Inject gradient for ring SVG
function injectSvgGradients() {
    const svg = document.querySelector('.progress-ring');
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
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
    const text = taskInput.value.trim();
    if (!text) {
        taskInput.focus();
        taskInput.classList.add('shake');
        setTimeout(() => taskInput.classList.remove('shake'), 500);
        return;
    }

    const task = {
        id: uid(),
        text,
        priority: prioritySelect.value,
        category: categorySelect.value,
        dueDate: dueDateInput.value || '',
        notes: '',
        completed: false,
        notified1hr: false,
        createdAt: Date.now(),
    };

    tasks.unshift(task);
    saveTasks();

    taskInput.value = '';
    taskInput.focus();

    showToast('✅ Task added!');
    notifyDevice('TaskFlow', `New task added: "${text}"`);
    render();
}

// ── Toggle Complete ────────────────────────────────────────
function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    saveTasks();
    render();
    showToast(task.completed ? '🎉 Task completed!' : '↩️ Task reopened');
}

// ── Delete Task ────────────────────────────────────────────
function deleteTask(id, liEl) {
    liEl.classList.add('removing');
    setTimeout(() => {
        tasks = tasks.filter(t => t.id !== id);
        saveTasks();
        render();
        showToast('🗑️ Task deleted');
    }, 240);
}

// ── Edit Modal ─────────────────────────────────────────────
function openEditModal(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    editingId = id;
    editInput.value = task.text;
    editPriority.value = task.priority;
    editCategory.value = task.category;
    editDueDate.value = task.dueDate || '';
    editNotes.value = task.notes || '';
    modalOverlay.classList.add('open');
    setTimeout(() => editInput.focus(), 100);
}

function closeModal() {
    modalOverlay.classList.remove('open');
    editingId = null;
}

function saveEdit() {
    const text = editInput.value.trim();
    if (!text) { editInput.focus(); return; }
    const task = tasks.find(t => t.id === editingId);
    if (!task) return;
    task.text = text;
    task.priority = editPriority.value;
    task.category = editCategory.value;
    if (task.dueDate !== editDueDate.value) {
        task.notified1hr = false;
    }
    task.dueDate = editDueDate.value || '';
    task.notes = editNotes.value.trim();
    saveTasks();
    render();
    closeModal();
    showToast('✏️ Task updated!');
}

// ── Custom Confirm Dialog ──────────────────────────────────
let confirmResolve = null;

function showConfirm({ icon = '⚠️', title = 'Are you sure?', msg = 'This action cannot be undone.', okLabel = 'Confirm' } = {}) {
    confirmIcon.textContent = icon;
    confirmTitle.textContent = title;
    confirmMsg.textContent = msg;
    confirmOk.textContent = okLabel;
    confirmOverlay.classList.add('open');
    confirmCancel.focus();
    return new Promise(resolve => { confirmResolve = resolve; });
}

function closeConfirm(result) {
    confirmOverlay.classList.remove('open');
    if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}

confirmOk.addEventListener('click', () => closeConfirm(true));
confirmCancel.addEventListener('click', () => closeConfirm(false));
confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) closeConfirm(false); });

// ── Clear Actions ──────────────────────────────────────────
function clearCompleted() {
    const count = tasks.filter(t => t.completed).length;
    if (count === 0) { showToast('No completed tasks to clear'); return; }
    tasks = tasks.filter(t => !t.completed);
    saveTasks();
    render();
    showToast(`🗑️ Cleared ${count} completed task${count > 1 ? 's' : ''}`);
}

async function clearAll() {
    if (tasks.length === 0) { showToast('No tasks to clear'); return; }
    const confirmed = await showConfirm({
        icon: '🗑️',
        title: 'Delete All Tasks?',
        msg: `This will permanently remove all ${tasks.length} task${tasks.length > 1 ? 's' : ''}. This cannot be undone.`,
        okLabel: 'Delete All',
    });
    if (!confirmed) return;
    tasks = [];
    saveTasks();
    render();
    showToast('🧹 All tasks cleared');
}

// ── Event Listeners ────────────────────────────────────────
addBtn.addEventListener('click', addTask);

taskInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addTask();
});

// Filter Tabs
filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        render();
    });
});

// Sort
sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    render();
});

// Search
searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    clearSearch.classList.toggle('visible', searchQuery.length > 0);
    render();
});

clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearch.classList.remove('visible');
    render();
});

// Theme
themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
});

// Modal
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modalSave.addEventListener('click', saveEdit);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (confirmOverlay.classList.contains('open')) closeConfirm(false);
        else closeModal();
    }
});
editInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveEdit(); });

// Bulk
bulkClearCompleted.addEventListener('click', clearCompleted);
bulkClearAll.addEventListener('click', clearAll);

// ── Shake animation ────────────────────────────────────────
const shakeStyle = document.createElement('style');
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
    tasks.forEach(task => {
        if (!task.completed && task.dueDate && !task.notified1hr) {
            const dueTime = new Date(task.dueDate);
            const diffMs = dueTime.getTime() - now.getTime();
            // Notify when the task is between 0 and 60 minutes away
            if (diffMs > 0 && diffMs <= 60 * 60 * 1000) {
                notifyDevice("⏰ Task Reminder", `Your task "${task.text}" is due in less than an hour!`);
                task.notified1hr = true;
                updated = true;
            }
        }
    });
    if (updated) saveTasks();
}
setInterval(checkReminders, 60000); // Check every minute

// ── Init ───────────────────────────────────────────────────
function init() {
    loadTasks();
    applyTheme(loadTheme());
    injectSvgGradients();
    dateDisplay.textContent = formatFullDate();
    // Default due date = today
    // dueDateInput.value = today(); // optional
    render();
    // No demo tasks - starting fresh per user request
}

init();
