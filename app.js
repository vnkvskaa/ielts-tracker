// ---- config ----
const OWNER = 'vnkvskaa';
const REPO = 'ielts-tracker';
const DATA_PATH = 'data.json';
const TOKEN_KEY = 'ielts_gh_token';
const CACHE_KEY = 'ielts_data_cache';

const SECTIONS = ['Listening', 'Reading', 'Writing', 'Speaking', 'Overall'];

// ---- prompt pools (deterministic "today's task") ----
const WRITING_PROMPTS = [
  'Some people think that governments should invest more in public transport instead of building new roads. To what extent do you agree or disagree?',
  'Many people believe that social media has a negative effect on both individuals and society. Discuss both views and give your own opinion.',
  'In some countries, young people are encouraged to work or travel for a year between finishing school and starting university studies. Discuss the advantages and disadvantages.',
  'Describe a graph/chart you saw recently in the news (Task 1 style): summarise the main trends and make comparisons where relevant.',
  'Some people think that unpaid community service should be a compulsory part of high school programmes. To what extent do you agree?',
  'The advantages of having a global culture outweigh the disadvantages. To what extent do you agree or disagree?',
  'Some people believe that it is best to accept a bad situation, others think it is better to try and improve it. Discuss both views.',
  'Nowadays the way many people interact with each other has changed because of technology. In what ways has technology affected the types of relationships people make? Is this a positive or negative development?',
  'Some people think that the best way to improve public health is by increasing the number of sports facilities. Others believe there are more effective ways. Discuss both views.',
  'Describe a line graph showing changes in a country’s population over the last 50 years and predicted changes for the next 50 years.',
];

const SPEAKING_CUE_CARDS = [
  'Describe a skill you learned recently. You should say: what it was, how you learned it, how long it took, and explain why you decided to learn it.',
  'Describe a piece of technology you find useful. You should say: what it is, how often you use it, what you use it for, and explain why it is useful to you.',
  'Describe a memorable journey you have taken. You should say: where you went, who you went with, what you did, and explain why it was memorable.',
  'Describe a book that had an important influence on you. You should say: what the book was, what it was about, when you read it, and explain why it influenced you.',
  'Describe a person who has influenced you a lot. You should say: who this person is, how you know them, what they have done, and explain why they influenced you.',
  'Describe a decision that was difficult to make. You should say: what the decision was, when you made it, what the alternatives were, and explain why it was difficult.',
  'Describe a place you would like to visit in the future. You should say: where it is, how you know about it, what you would do there, and explain why you want to visit it.',
  'Describe an event that made you very happy. You should say: what the event was, when it happened, who was there, and explain why it made you happy.',
];

const RESOURCES = [
  { group: 'Полные пробники', items: [
    ['IELTS Online Tests', 'https://ieltsonlinetests.com'],
    ['British Council — Road to IELTS', 'https://roadtoielts.com'],
    ['Cambridge English — official practice materials', 'https://www.cambridgeenglish.org/exams-and-tests/ielts/'],
  ]},
  { group: 'Listening', items: [
    ['IELTS Up — Listening practice', 'https://ieltsup.com/listening.html'],
    ['E2 IELTS (YouTube)', 'https://www.youtube.com/@E2Test'],
  ]},
  { group: 'Reading', items: [
    ['IELTS Reading Online', 'https://ieltsreadingonline.com'],
  ]},
  { group: 'Writing', items: [
    ['IELTS Simon', 'https://ielts-simon.com'],
    ['IELTS Liz', 'https://ieltsliz.com'],
  ]},
  { group: 'Speaking', items: [
    ['IELTS Speaking cue cards — IELTS Liz', 'https://ieltsliz.com/ielts-speaking-part-2-topics/'],
  ]},
  { group: 'Словарный запас', items: [
    ['Magoosh IELTS Blog', 'https://magoosh.com/ielts/'],
  ]},
];

// ---- date helpers ----
const todayStr = () => new Date().toISOString().slice(0, 10);
function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}
function pickForToday(pool) {
  return pool[dayOfYear(new Date()) % pool.length];
}

// ---- state ----
let state = { entries: [] };
let sha = null;

function loadLocal() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) { /* ignore corrupt cache */ }
}
function saveLocal() {
  localStorage.setItem(CACHE_KEY, JSON.stringify(state));
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

// ---- GitHub sync ----
async function ghFetch() {
  const token = getToken();
  if (!token) return false;
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) { sha = null; return true; } // no data.json yet
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  const json = await res.json();
  sha = json.sha;
  state = JSON.parse(decodeURIComponent(escape(atob(json.content))));
  saveLocal();
  return true;
}

async function ghSave() {
  const token = getToken();
  if (!token) { saveLocal(); return; }
  const body = {
    message: `update data ${new Date().toISOString()}`,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(state, null, 2)))),
  };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    setStatus(`Ошибка синхронизации (${res.status}). Данные сохранены только локально.`, true);
    saveLocal();
    return;
  }
  const json = await res.json();
  sha = json.content.sha;
  saveLocal();
  setStatus('Синхронизировано ✓');
}

function setStatus(text, isError) {
  const el = document.getElementById('sync-status');
  el.textContent = text;
  el.style.color = isError ? '#e5533d' : '#1d9a6c';
}

// ---- entries ----
function addEntry(entry) {
  state.entries.push({ id: crypto.randomUUID(), date: todayStr(), ...entry });
  saveLocal();
  render();
  ghSave();
}

// ---- heatmap ----
function renderHeatmap() {
  const counts = {};
  for (const e of state.entries) counts[e.date] = (counts[e.date] || 0) + 1;

  const container = document.getElementById('heatmap');
  container.innerHTML = '';
  const days = 140;
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const c = counts[key] || 0;
    const cell = document.createElement('div');
    cell.className = 'hm-cell';
    cell.title = `${key}: ${c} запис(ей)`;
    cell.style.background = heatColor(c);
    container.appendChild(cell);
  }
}
function heatColor(c) {
  if (c === 0) return 'var(--hm-0)';
  if (c === 1) return 'var(--hm-1)';
  if (c === 2) return 'var(--hm-2)';
  if (c === 3) return 'var(--hm-3)';
  return 'var(--hm-4)';
}

// ---- today's task card ----
function renderTasks() {
  document.getElementById('writing-prompt').textContent = pickForToday(WRITING_PROMPTS);
  document.getElementById('speaking-prompt').textContent = pickForToday(SPEAKING_CUE_CARDS);
  const doneToday = (type) => state.entries.some((e) => e.type === type && e.date === todayStr());
  document.getElementById('writing-done-btn').disabled = doneToday('task-writing');
  document.getElementById('speaking-done-btn').disabled = doneToday('task-speaking');
}

// ---- score history ----
function renderScores() {
  const tbody = document.querySelector('#score-table tbody');
  tbody.innerHTML = '';
  const scoreEntries = state.entries
    .filter((e) => e.type === 'score')
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const e of scoreEntries) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${e.date}</td><td>${e.section}</td><td>${e.band}</td><td>${e.source || ''}</td><td>${e.note || ''}</td>`;
    tbody.appendChild(tr);
  }
  const avgRow = document.getElementById('avg-row');
  avgRow.innerHTML = '';
  for (const s of SECTIONS) {
    const vals = scoreEntries.filter((e) => e.section === s).map((e) => Number(e.band));
    const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
    const td = document.createElement('td');
    td.textContent = `${s}: ${avg}`;
    avgRow.appendChild(td);
  }
}

// ---- resources ----
function renderResources() {
  const container = document.getElementById('resources');
  container.innerHTML = '';
  for (const group of RESOURCES) {
    const h = document.createElement('h3');
    h.textContent = group.group;
    container.appendChild(h);
    const ul = document.createElement('ul');
    for (const [label, url] of group.items) {
      const li = document.createElement('li');
      li.innerHTML = `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
      ul.appendChild(li);
    }
    container.appendChild(ul);
  }
}

function render() {
  renderHeatmap();
  renderTasks();
  renderScores();
}

// ---- wiring ----
function wireEvents() {
  document.getElementById('writing-done-btn').addEventListener('click', () => {
    addEntry({ type: 'task-writing', section: 'Writing', note: 'Daily writing task' });
  });
  document.getElementById('speaking-done-btn').addEventListener('click', () => {
    addEntry({ type: 'task-speaking', section: 'Speaking', note: 'Daily speaking task' });
  });

  document.getElementById('score-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    addEntry({
      type: 'score',
      section: form.section.value,
      band: Number(form.band.value),
      source: form.source.value.trim(),
      note: form.note.value.trim(),
    });
    form.reset();
  });

  const tokenInput = document.getElementById('token-input');
  tokenInput.value = getToken();
  document.getElementById('token-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    localStorage.setItem(TOKEN_KEY, tokenInput.value.trim());
    setStatus('Подключаюсь…');
    try {
      await ghFetch();
      render();
      setStatus('Подключено ✓');
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

async function init() {
  loadLocal();
  render();
  wireEvents();
  if (getToken()) {
    try {
      setStatus('Синхронизация…');
      await ghFetch();
      render();
      setStatus('Синхронизировано ✓');
    } catch (err) {
      setStatus(`${err.message} (работаем с локальными данными)`, true);
    }
  } else {
    setStatus('Не подключено к GitHub — данные только в этом браузере');
  }
  renderResources();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
}

init();
