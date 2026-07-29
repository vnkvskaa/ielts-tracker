// ---- config ----
const OWNER = 'vnkvskaa';
const REPO = 'ielts-tracker';
const DATA_PATH = 'data.json';
const TOKEN_KEY = 'ielts_gh_token';
const CACHE_KEY = 'ielts_data_cache';

const SKILL_LABELS = { listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking' };
const SKILL_INITIALS = { listening: 'L', reading: 'R', writing: 'W', speaking: 'S' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function defaultState() {
  const d = new Date(); d.setDate(d.getDate() + 45);
  return { examDate: toISO(d), targetBand: 7.5, entries: [], links: [] };
}
function withDefaults(obj) {
  const d = defaultState();
  return {
    examDate: (obj && obj.examDate) || d.examDate,
    targetBand: (obj && obj.targetBand) || d.targetBand,
    entries: (obj && obj.entries) || [],
    links: (obj && obj.links) || [],
  };
}
function normalizeUrl(u) {
  const t = u.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

// ---- state ----
let state = withDefaults(null);
let sha = null;
let form = { skill: 'listening', minutes: 30, score: '', essayDraft: '', essayRevised: '' };
let linkForm = { label: '', url: '' };
const decoCells = Array.from({ length: 48 }, () => ({ op: (Math.random() * 0.5 + 0.1).toFixed(2) }));

function loadLocal() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) state = withDefaults(JSON.parse(raw));
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
  if (res.status === 404) { sha = null; return true; }
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  const json = await res.json();
  sha = json.sha;
  state = withDefaults(JSON.parse(decodeURIComponent(escape(atob(json.content)))));
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
    setStatus(`Sync failed (${res.status}). Saved locally only.`, true);
    saveLocal();
    return;
  }
  const json = await res.json();
  sha = json.content.sha;
  saveLocal();
  setStatus('Synced ✓');
}
function setStatus(text, isError) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('status--error', Boolean(isError));
}

// ---- entries ----
function addEntry() {
  const minutes = Number(form.minutes) || 0;
  if (minutes <= 0) return;
  const draft = form.essayDraft.trim();
  const revised = form.essayRevised.trim();
  const entry = {
    id: crypto.randomUUID(),
    date: toISO(new Date()),
    skill: form.skill,
    minutes,
    score: form.score === '' ? null : Number(form.score),
    essay: (form.skill === 'writing' && (draft || revised)) ? { draft, revised } : null,
  };
  state.entries = [entry, ...state.entries];
  form.minutes = 30; form.score = ''; form.essayDraft = ''; form.essayRevised = '';
  saveLocal();
  render();
  ghSave();
}
function deleteEntry(id) {
  state.entries = state.entries.filter((e) => e.id !== id);
  saveLocal();
  render();
  ghSave();
}

// ---- links ----
function addLink() {
  const url = normalizeUrl(linkForm.url);
  if (!url) return;
  state.links = [{ id: crypto.randomUUID(), label: linkForm.label.trim(), url }, ...state.links];
  linkForm = { label: '', url: '' };
  saveLocal();
  render();
  ghSave();
}
function deleteLink(id) {
  state.links = state.links.filter((l) => l.id !== id);
  saveLocal();
  render();
  ghSave();
}

// ---- heatmap levels ----
function levelForSkillMinutes(mins) {
  if (mins === 0) return 0;
  if (mins < 20) return 1;
  if (mins < 40) return 2;
  if (mins < 70) return 3;
  return 4;
}
function levelForAllMinutes(mins) {
  if (mins === 0) return 0;
  if (mins < 40) return 1;
  if (mins < 80) return 2;
  if (mins < 140) return 3;
  return 4;
}
function heatLevelStyle(level) {
  const specs = [null,
    { pattern: 'radial-gradient(circle, #161616 0.9px, transparent 0.9px)', size: '7px 7px' },
    { pattern: 'radial-gradient(circle, #161616 1.1px, transparent 1.1px)', size: '5px 5px' },
    { pattern: 'radial-gradient(circle, #161616 1.3px, transparent 1.3px)', size: '4px 4px' },
    null];
  if (level === 0) return { base: 'oklch(var(--card-lch))', pattern: 'none', size: 'auto' };
  if (level === 4) return { base: 'oklch(var(--ink-lch))', pattern: 'none', size: 'auto' };
  return { base: 'oklch(var(--card-lch))', pattern: specs[level].pattern, size: specs[level].size };
}
function skillPattern(skillKey) {
  return {
    listening: 'none',
    reading: 'repeating-linear-gradient(45deg, #e8e4dc 0 3px, transparent 3px 6px)',
    writing: 'radial-gradient(circle, #e8e4dc 1.4px, transparent 1.4px)',
    speaking: 'repeating-linear-gradient(45deg,#e8e4dc 0 2px, transparent 2px 5px), repeating-linear-gradient(-45deg,#e8e4dc 0 2px, transparent 2px 5px)',
  }[skillKey];
}

// ---- band charts ----
const CHART = { w: 320, h: 140, padL: 24, padR: 8, padT: 10, padB: 18, minBand: 4, maxBand: 9 };
function yForBand(v) {
  const plotH = CHART.h - CHART.padT - CHART.padB;
  const clamped = Math.max(CHART.minBand, Math.min(CHART.maxBand, v));
  return CHART.padT + plotH - ((clamped - CHART.minBand) / (CHART.maxBand - CHART.minBand)) * plotH;
}
function xForIndex(i, n) {
  const plotW = CHART.w - CHART.padL - CHART.padR;
  if (n <= 1) return CHART.padL + plotW / 2;
  return CHART.padL + (i / (n - 1)) * plotW;
}
function buildSeries(scoredEntries) {
  const pts = scoredEntries.map((e, i) => ({ x: xForIndex(i, scoredEntries.length), y: yForBand(e.score), score: e.score }));
  const pathD = pts.length > 1 ? 'M ' + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ') : '';
  const points = pts.map((p) => ({ x: p.x.toFixed(1), y: p.y.toFixed(1) }));
  const latest = pts.length ? scoredEntries[scoredEntries.length - 1].score : null;
  const first = pts.length ? scoredEntries[0].score : null;
  let detail = 'no scores yet';
  if (latest != null && first != null) {
    const delta = Math.round((latest - first) * 10) / 10;
    detail = pts.length === 1 ? `band ${latest}` : `${latest} (${delta >= 0 ? '+' : ''}${delta} vs first)`;
  }
  return { hasLine: pts.length > 1, points, pathD, detail };
}
function buildBandChart(label, scoredEntries, targetBand) {
  const series = buildSeries(scoredEntries);
  return {
    label,
    detail: series.detail,
    gridLines: [4, 6, 8].map((v) => ({ y: yForBand(v).toFixed(1), textY: (yForBand(v) + 3).toFixed(1), label: v })),
    hasTarget: !!targetBand,
    targetY: yForBand(Number(targetBand)).toFixed(1),
    series,
  };
}

// ---- derived view model ----
function computeVals() {
  const { entries, examDate, targetBand } = state;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exam = new Date(examDate + 'T00:00:00');
  const daysLeft = Math.max(0, daysBetween(today, exam));

  const startPlan = new Date(exam); startPlan.setDate(startPlan.getDate() - 90);
  const totalSpan = Math.max(1, daysBetween(startPlan, exam));
  const elapsed = Math.max(0, Math.min(totalSpan, daysBetween(startPlan, today)));
  const examProgressPct = Math.round((elapsed / totalSpan) * 100);

  const byDate = {};
  const byDateSkill = {};
  entries.forEach((e) => {
    byDate[e.date] = (byDate[e.date] || 0) + e.minutes;
    if (!byDateSkill[e.date]) byDateSkill[e.date] = { listening: 0, reading: 0, writing: 0, speaking: 0 };
    byDateSkill[e.date][e.skill] += e.minutes;
  });

  const hasEntry = (d) => !!byDate[toISO(d)];
  let cursor = new Date(today);
  if (!hasEntry(cursor)) cursor.setDate(cursor.getDate() - 1);
  let currentStreak = 0;
  while (hasEntry(cursor)) { currentStreak++; cursor.setDate(cursor.getDate() - 1); }

  const sortedDates = Object.keys(byDate).sort();
  let bestStreak = 0, run = 0, prev = null;
  sortedDates.forEach((ds) => {
    const d = new Date(ds + 'T00:00:00');
    if (prev && daysBetween(prev, d) === 1) run++; else run = 1;
    bestStreak = Math.max(bestStreak, run);
    prev = d;
  });
  bestStreak = Math.max(bestStreak, currentStreak);

  const totalMinutes = entries.reduce((a, e) => a + e.minutes, 0);
  const totalHours = Math.round(totalMinutes / 6) / 10;
  const totalSessions = entries.length;
  const avgSessionLabel = totalSessions ? Math.round(totalMinutes / totalSessions) : 0;

  const streakMessage = currentStreak === 0 ? 'Log today to start a streak' : (hasEntry(today) ? 'Logged today — keep going' : 'Log today to keep it alive');

  const WEEKS = 17;
  const totalDays = WEEKS * 7;
  const gridStart = new Date(today); gridStart.setDate(gridStart.getDate() - (totalDays - 1));
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  function buildRow(rowKey, isAll) {
    const weeks = [];
    let d = new Date(gridStart);
    for (let w = 0; w < WEEKS + 1; w++) {
      const week = [];
      for (let day = 0; day < 7; day++) {
        const iso = toISO(d);
        const mins = isAll ? (byDate[iso] || 0) : ((byDateSkill[iso] || {})[rowKey] || 0);
        const level = isAll ? levelForAllMinutes(mins) : levelForSkillMinutes(mins);
        const ls = heatLevelStyle(level);
        week.push({ title: iso + (mins ? ` — ${mins}m` : ' — no session'), baseColor: ls.base, pattern: ls.pattern, patternSize: ls.size, borderOp: d > today ? 0 : 1 });
        d.setDate(d.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  }

  const allRow = { label: 'All skills', weeks: buildRow('all', true) };
  const skillRows = [
    { label: 'Listening', weeks: buildRow('listening', false) },
    { label: 'Reading', weeks: buildRow('reading', false) },
    { label: 'Writing', weeks: buildRow('writing', false) },
    { label: 'Speaking', weeks: buildRow('speaking', false) },
  ];

  const legendSwatches = [0, 1, 2, 3].map((lvl) => {
    const ls = heatLevelStyle(lvl === 3 ? 4 : lvl);
    return { baseColor: ls.base, pattern: ls.pattern, patternSize: ls.size };
  });

  const skillTotals = {};
  Object.keys(SKILL_LABELS).forEach((k) => (skillTotals[k] = { minutes: 0, last: null, scores: [] }));
  entries.forEach((e) => {
    const t = skillTotals[e.skill]; if (!t) return;
    t.minutes += e.minutes;
    if (!t.last || e.date > t.last) t.last = e.date;
    if (e.score != null) t.scores.push(e.score);
  });
  const maxSkillMinutes = Math.max(1, ...Object.values(skillTotals).map((t) => t.minutes));
  let mostPracticedKey = null, mostPracticedMax = 0;
  Object.keys(skillTotals).forEach((k) => { if (skillTotals[k].minutes > mostPracticedMax) { mostPracticedMax = skillTotals[k].minutes; mostPracticedKey = k; } });
  const mostPracticedLabel = mostPracticedKey ? SKILL_LABELS[mostPracticedKey] : '—';

  const skills = Object.keys(SKILL_LABELS).map((k) => {
    const t = skillTotals[k];
    const lastLabel = t.last ? formatDate(t.last) : '—';
    const avgBandLabel = t.scores.length ? `avg band ${(Math.round((t.scores.reduce((a, b) => a + b, 0) / t.scores.length) * 10) / 10).toFixed(1)}` : 'no scores';
    return { label: SKILL_LABELS[k], pattern: skillPattern(k), hoursLabel: Math.round(t.minutes / 6) / 10, pct: Math.round((t.minutes / maxSkillMinutes) * 100), lastLabel, avgBandLabel };
  });

  const bySkillScored = { listening: [], reading: [], writing: [], speaking: [] };
  entries.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => { if (e.score != null) bySkillScored[e.skill].push(e); });
  const bandCharts = [
    buildBandChart('Listening', bySkillScored.listening, targetBand),
    buildBandChart('Reading', bySkillScored.reading, targetBand),
    buildBandChart('Writing', bySkillScored.writing, targetBand),
    buildBandChart('Speaking', bySkillScored.speaking, targetBand),
  ];

  const recentEntries = entries.slice(0, 8).map((e) => ({
    ...e,
    skillLabel: SKILL_LABELS[e.skill],
    initial: SKILL_INITIALS[e.skill],
    dateLabel: formatDate(e.date),
    hasScore: e.score != null,
    hasEssay: !!(e.essay && e.essay.draft),
  }));

  const essays = entries.filter((e) => e.essay && e.essay.draft).map((e) => ({
    id: e.id,
    dateLabel: formatDate(e.date),
    draft: e.essay.draft,
    hasRevised: !!e.essay.revised,
    revised: e.essay.revised,
    hasScore: e.score != null,
    score: e.score,
  }));

  return {
    examDate, targetBand, daysLeft, examProgressPct,
    currentStreak, bestStreak, streakMessage, totalHours, totalSessions, avgSessionLabel, mostPracticedLabel,
    allRow, skillRows, legendSwatches, skills, bandCharts,
    isWritingSkill: form.skill === 'writing',
    hasEntries: entries.length > 0, hasEssays: essays.length > 0,
    recentEntries, essays,
  };
}

// ---- markup builders ----
function heatCell(day, size) {
  return `<div class="heat-cell" title="${esc(day.title)}" style="width:${size}px; height:${size}px; border-color: oklch(var(--ink-lch) / ${day.borderOp}); background-color: ${day.baseColor}; background-image: ${day.pattern}; background-size: ${day.patternSize};"></div>`;
}
function heatWeek(week, size) {
  return `<div class="heat-week">${week.map((d) => heatCell(d, size)).join('')}</div>`;
}
function heatRow(row, size) {
  return `<div class="heat-row"><div class="heat-row__label">${esc(row.label)}</div><div class="heat-weeks">${row.weeks.map((w) => heatWeek(w, size)).join('')}</div></div>`;
}
function bandChartSvg(bc) {
  return `<div class="mini-card">
    <div class="band-card__head"><span>${esc(bc.label)}</span><span>${esc(bc.detail)}</span></div>
    <svg viewBox="0 0 320 140" class="band-svg">
      ${bc.gridLines.map((g) => `<line x1="24" x2="312" y1="${g.y}" y2="${g.y}" stroke="oklch(var(--ink-lch) / 0.09)" stroke-width="1"></line><text x="2" y="${g.textY}" font-family="Space Mono, monospace" font-size="9" fill="oklch(var(--ink-soft-lch))">${g.label}</text>`).join('')}
      ${bc.hasTarget ? `<line x1="24" x2="312" y1="${bc.targetY}" y2="${bc.targetY}" stroke="oklch(var(--ink-lch))" stroke-width="1.3" stroke-dasharray="5,4"></line>` : ''}
      ${bc.series.hasLine ? `<path d="${bc.series.pathD}" fill="none" stroke="oklch(var(--ink-lch))" stroke-width="2"></path>` : ''}
      ${bc.series.points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="oklch(var(--card-lch))" stroke="oklch(var(--ink-lch))" stroke-width="2"></circle>`).join('')}
    </svg>
  </div>`;
}
function entryRow(e) {
  return `<div class="entry-row">
    <div class="entry-row__left">
      <div class="entry-row__initial">${e.initial}</div>
      <span class="entry-row__skill">${e.skillLabel}</span>
      <span class="entry-row__date">${e.dateLabel}</span>
      ${e.hasEssay ? `<span class="entry-row__badge">essay</span>` : ''}
    </div>
    <div class="entry-row__right">
      <span class="entry-row__minutes">${e.minutes}m</span>
      ${e.hasScore ? `<span class="entry-row__score">band ${e.score}</span>` : ''}
      <button class="delete-btn" data-delete="${e.id}" aria-label="Delete entry">&times;</button>
    </div>
  </div>`;
}
function essayCard(es) {
  return `<div class="essay-card">
    <div class="essay-card__head">
      <span class="essay-card__date">${es.dateLabel}</span>
      ${es.hasScore ? `<span class="essay-card__score">band ${es.score}</span>` : ''}
      <button class="delete-btn" data-delete="${es.id}" aria-label="Delete entry">&times;</button>
    </div>
    <div class="essay-card__label">Draft</div>
    <div class="essay-card__text">${esc(es.draft)}</div>
    ${es.hasRevised ? `<div class="essay-card__label">Revised</div><div class="essay-card__text">${esc(es.revised)}</div>` : ''}
  </div>`;
}
function linkRow(l) {
  return `<div class="link-row">
    <a class="link-row__url" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label || l.url)}</a>
    <button class="delete-btn" data-delete-link="${l.id}" aria-label="Delete link">&times;</button>
  </div>`;
}

function render() {
  const v = computeVals();

  document.getElementById('app').innerHTML = `
  <div class="deco"><div>${decoCells.map((c) => `<span style="color: oklch(var(--ink-lch) / ${c.op});">+</span>`).join('')}</div></div>

  <header class="top">
    <div>
      <p class="label">Band tracker</p>
      <h1>IELTS PREP</h1>
    </div>
    <div class="top__fields">
      <div class="field field--band">
        <p class="label">Target band</p>
        <input id="targetBand" type="number" step="0.5" min="1" max="9" value="${v.targetBand}" />
      </div>
      <div class="field field--date">
        <p class="label">Exam date</p>
        <input id="examDate" type="date" value="${v.examDate}" />
      </div>
    </div>
  </header>
  <p class="status" id="sync-status"></p>

  <div class="stats-grid">
    <div class="card">
      <p class="label">Countdown to exam</p>
      <div class="stat-row"><div class="stat-num">${v.daysLeft}</div><div class="stat-unit mono">days left</div></div>
      <div class="progress-track"><div class="progress-fill" style="width: ${v.examProgressPct}%;"></div></div>
    </div>
    <div class="card card--dark">
      <p class="label" style="color:inherit; opacity:0.8;">Current streak</p>
      <div class="stat-row"><div class="stat-num">${v.currentStreak}</div><div class="stat-unit mono">days</div></div>
      <div class="stat-note">${v.streakMessage}</div>
    </div>
    <div class="card">
      <p class="label">Best streak</p>
      <div class="stat-row"><div class="stat-num">${v.bestStreak}</div><div class="stat-unit mono">days</div></div>
      <div class="stat-note">${v.totalHours}h total</div>
    </div>
    <div class="card">
      <p class="label">Sessions</p>
      <div class="stat-row"><div class="stat-num">${v.totalSessions}</div><div class="stat-unit mono">logged</div></div>
      <div class="stat-note stat-note--wrap">avg ${v.avgSessionLabel}m &middot; fave ${v.mostPracticedLabel}</div>
    </div>
  </div>

  <section class="card section-card">
    <div class="section-head">
      <div><p class="label" style="margin-bottom:4px;">Consistency</p><h2 class="section-title">Activity by skill &middot; 17 weeks</h2></div>
      <div class="legend">
        <span>less</span>
        <div class="legend-swatches">${v.legendSwatches.map((sw) => `<div class="swatch" style="background-color: ${sw.baseColor}; background-image: ${sw.pattern}; background-size: ${sw.patternSize};"></div>`).join('')}</div>
        <span>more</span>
      </div>
    </div>
    ${heatRow(v.allRow, 15)}
    <div class="quad-grid">
      ${v.skillRows.map((row) => `<div class="mini-card"><div class="mini-card__label">${row.label}</div><div class="heat-weeks">${row.weeks.map((w) => heatWeek(w, 12)).join('')}</div></div>`).join('')}
    </div>
  </section>

  <section class="card section-card">
    <p class="label">Scores</p>
    <h2 class="section-title" style="margin-bottom:18px;">Band progress by skill</h2>
    <div class="quad-grid">${v.bandCharts.map(bandChartSvg).join('')}</div>
  </section>

  <div class="two-col-grid">
    <section class="card">
      <p class="label">Breakdown</p>
      <h2 class="section-title" style="margin-bottom:22px;">By skill</h2>
      ${v.skills.map((s) => `<div class="skill-item">
        <div class="skill-item__meta"><span class="skill-item__name">${s.label}</span><span class="skill-item__stats">${s.hoursLabel}h &middot; ${s.avgBandLabel} &middot; last ${s.lastLabel}</span></div>
        <div class="skill-bar"><div class="skill-bar__fill" style="background-image: ${s.pattern}; width: ${s.pct}%;"></div></div>
      </div>`).join('')}
    </section>

    <section class="card" style="display:flex; flex-direction:column;">
      <p class="label">Log</p>
      <h2 class="section-title" style="margin-bottom:18px;">Today's session</h2>
      <div class="log-form">
        <select id="formSkill">
          <option value="listening" ${form.skill === 'listening' ? 'selected' : ''}>Listening</option>
          <option value="reading" ${form.skill === 'reading' ? 'selected' : ''}>Reading</option>
          <option value="writing" ${form.skill === 'writing' ? 'selected' : ''}>Writing</option>
          <option value="speaking" ${form.skill === 'speaking' ? 'selected' : ''}>Speaking</option>
        </select>
        <input id="formMinutes" type="number" min="5" step="5" placeholder="min" value="${form.minutes}" />
        <input id="formScore" type="number" min="0" max="9" step="0.5" placeholder="score" value="${form.score}" />
        <button id="addEntry">Add</button>
      </div>
      ${v.isWritingSkill ? `<div class="essay-fields">
        <textarea id="formEssayDraft" placeholder="Paste your essay draft (optional)">${esc(form.essayDraft)}</textarea>
        <textarea id="formEssayRevised" placeholder="Revised version (optional)">${esc(form.essayRevised)}</textarea>
      </div>` : ''}
      <div class="entry-list">
        ${v.hasEntries ? v.recentEntries.map(entryRow).join('') : `<div class="empty-note">No sessions logged yet — add your first one above.</div>`}
      </div>
    </section>
  </div>

  <section class="card section-card">
    <p class="label">Writing</p>
    <h2 class="section-title" style="margin-bottom:18px;">Essay drafts</h2>
    ${v.hasEssays ? `<div class="essay-list">${v.essays.map(essayCard).join('')}</div>` : `<div class="empty-note">No essays saved yet — write a Writing session with draft text to see it here.</div>`}
  </section>

  <section class="card section-card">
    <p class="label">Resources</p>
    <h2 class="section-title" style="margin-bottom:18px;">Links</h2>
    <div class="log-form">
      <input id="linkLabel" type="text" placeholder="Label (optional)" value="${esc(linkForm.label)}" />
      <input id="linkUrl" type="text" placeholder="https://example.com" value="${esc(linkForm.url)}" />
      <button id="addLink">Add</button>
    </div>
    <div class="link-list">
      ${state.links.length ? state.links.map(linkRow).join('') : `<div class="empty-note">No links yet — add a study portal or resource above.</div>`}
    </div>
  </section>

  <section class="card settings-card">
    <p class="label">Sync</p>
    <p class="hint">Fine-grained GitHub token (Contents: Read/write, repository <code>ielts-tracker</code> only). Stored locally in this browser.</p>
    <form id="token-form" class="token-form">
      <input id="token-input" type="password" placeholder="github_pat_..." value="${esc(getToken())}" />
      <button type="submit">Connect</button>
    </form>
  </section>
  `;

  document.getElementById('examDate').addEventListener('change', (e) => { state.examDate = e.target.value; saveLocal(); render(); ghSave(); });
  document.getElementById('targetBand').addEventListener('change', (e) => { state.targetBand = e.target.value; saveLocal(); render(); ghSave(); });
  document.getElementById('formSkill').addEventListener('change', (e) => { form.skill = e.target.value; render(); });
  document.getElementById('formMinutes').addEventListener('change', (e) => { form.minutes = e.target.value; });
  document.getElementById('formScore').addEventListener('change', (e) => { form.score = e.target.value; });
  document.getElementById('addEntry').addEventListener('click', addEntry);
  const draftEl = document.getElementById('formEssayDraft');
  if (draftEl) draftEl.addEventListener('change', (e) => { form.essayDraft = e.target.value; });
  const revisedEl = document.getElementById('formEssayRevised');
  if (revisedEl) revisedEl.addEventListener('change', (e) => { form.essayRevised = e.target.value; });
  document.getElementById('app').querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteEntry(btn.getAttribute('data-delete')));
  });

  document.getElementById('linkLabel').addEventListener('change', (e) => { linkForm.label = e.target.value; });
  document.getElementById('linkUrl').addEventListener('change', (e) => { linkForm.url = e.target.value; });
  document.getElementById('addLink').addEventListener('click', addLink);
  document.getElementById('app').querySelectorAll('[data-delete-link]').forEach((btn) => {
    btn.addEventListener('click', () => deleteLink(btn.getAttribute('data-delete-link')));
  });

  const tokenInput = document.getElementById('token-input');
  document.getElementById('token-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    localStorage.setItem(TOKEN_KEY, tokenInput.value.trim());
    setStatus('Connecting…');
    btn.classList.add('is-loading');
    try {
      await ghFetch();
      render();
      setStatus('Connected ✓');
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      btn.classList.remove('is-loading');
    }
  });
}

async function init() {
  loadLocal();
  render();
  if (getToken()) {
    try {
      setStatus('Syncing…');
      await ghFetch();
      render();
      setStatus('Synced ✓');
    } catch (err) {
      setStatus(`${err.message} (using local data)`, true);
    }
  } else {
    setStatus('Not connected to GitHub — data stays in this browser only');
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
}

init();
