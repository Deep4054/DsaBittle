// dashboard.js — DSA Dopamine Engine Full Dashboard
// IMPORTANT: Must be a separate file (CSP blocks inline scripts in extensions)

const BACKEND = 'https://dsabittle-production.up.railway.app';

const LEVELS = [
  { name: 'Beginner',     min: 0,    max: 100  },
  { name: 'Apprentice',   min: 100,  max: 300  },
  { name: 'Intermediate', min: 300,  max: 600  },
  { name: 'Advanced',     min: 600,  max: 1200 },
  { name: 'Expert',       min: 1200, max: 2400 },
  { name: 'Master',       min: 2400, max: 99999},
];

function getLevelInfo(xp) {
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp < LEVELS[i].max) {
      const pct = Math.min(100, Math.round(((xp - LEVELS[i].min) / (LEVELS[i].max - LEVELS[i].min)) * 100));
      const next = LEVELS[i + 1] || LEVELS[i];
      return { current: LEVELS[i].name, next: next.name, nextXP: LEVELS[i].max, pct, remaining: LEVELS[i].max - xp };
    }
  }
  return { current: 'Master', next: 'Master', nextXP: 99999, pct: 100, remaining: 0 };
}

function todayKey() { return new Date().toISOString().slice(0, 10); }

function timeAgo(ts) {
  const d = Date.now() - ts, m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function fmt(s) {
  if (!s) return '—';
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60), r = s % 60;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}

// ── Heatmap ──
function buildHeatmap(activity) {
  const grid   = document.getElementById('hm-grid');
  const months = document.getElementById('hm-months');
  if (!grid || !months) return;
  grid.innerHTML = ''; months.innerHTML = '';

  const today = new Date(), weeks = 26;
  const start = new Date(today);
  start.setDate(today.getDate() - weeks * 7 + 1);
  start.setDate(start.getDate() - start.getDay()); // align to Sunday

  let curMonth = -1;

  for (let w = 0; w < weeks + 1; w++) {
    const wd = document.createElement('div');
    wd.className = 'heatmap-week';

    for (let d = 0; d < 7; d++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + w * 7 + d);
      if (dt > today) break;

      const key = dt.toISOString().slice(0, 10);
      const cnt = Math.min(activity[key] || 0, 4);
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.setAttribute('data-v', cnt);
      cell.title = `${key}: ${activity[key] || 0} solved`;
      wd.appendChild(cell);

      if (dt.getMonth() !== curMonth) {
        curMonth = dt.getMonth();
        const mn = document.createElement('span');
        mn.textContent = dt.toLocaleDateString('en', { month: 'short' });
        mn.style.minWidth = '30px';
        months.appendChild(mn);
      }
    }
    if (wd.children.length) grid.appendChild(wd);
  }
}

// ── Tag bars ──
function renderTags(id, items, valKey, fmtFn, slow = false) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<span style="font-size:12px;color:var(--ink3)">Not enough data yet</span>';
    return;
  }
  const max = Math.max(...items.map(t => t[valKey] || 0), 1);
  el.innerHTML = items.map(t => `
    <div class="tag-item">
      <span class="tag-name" title="${t.tag}">${t.tag}</span>
      <div class="tag-bg"><div class="tag-fill${slow ? ' slow' : ''}" style="width:${Math.round((t[valKey] / max) * 100)}%"></div></div>
      <span class="tag-val">${fmtFn(t)}</span>
    </div>`).join('');
}

// ── Main render ──
async function render() {
  const data    = await new Promise(r => chrome.storage.local.get(['stats', 'history'], r));
  const stats   = data.stats   || {};
  const history = data.history || [];

  if (!stats.totalSolved && !history.length) {
    document.getElementById('empty').style.display = 'block';
    return;
  }
  document.getElementById('main').style.display = 'block';

  const xp     = stats.xp     || 0;
  const total  = stats.totalSolved || 0;
  const streak = stats.streak || 0;
  const easy   = stats.easy   || 0;
  const medium = stats.medium || 0;
  const hard   = stats.hard   || 0;
  const lvl    = getLevelInfo(xp);

  // Labels
  document.getElementById('level-label').textContent = lvl.current;
  document.getElementById('s-total').textContent   = total;
  document.getElementById('s-streak').textContent  = streak;
  document.getElementById('s-xp').textContent      = xp;
  document.getElementById('s-today').textContent   = (stats.dailyActivity || {})[todayKey()] || 0;
  document.getElementById('xp-cur').textContent    = lvl.current;
  document.getElementById('xp-nxt').textContent    = lvl.current === 'Master' ? 'Max Level reached' : `${lvl.remaining} XP to ${lvl.next}`;
  setTimeout(() => { document.getElementById('xp-fill').style.width = lvl.pct + '%'; }, 120);

  // Difficulty
  const maxD = Math.max(easy, medium, hard, 1);
  document.getElementById('c-easy').textContent  = easy;
  document.getElementById('c-med').textContent   = medium;
  document.getElementById('c-hard').textContent  = hard;
  setTimeout(() => {
    document.getElementById('d-easy').style.width  = (easy   / maxD * 100) + '%';
    document.getElementById('d-med').style.width   = (medium / maxD * 100) + '%';
    document.getElementById('d-hard').style.width  = (hard   / maxD * 100) + '%';
  }, 150);

  // Streak ring
  document.getElementById('streak-num').textContent = streak;
  const pct = Math.min(streak * 10, 100);
  const ring = document.getElementById('streak-ring');
  if (ring) ring.style.setProperty('--pct', pct + '%');

  const sm = document.getElementById('streak-msg');
  if (sm) {
    const flameSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>`;
    sm.innerHTML = `${flameSvg} ${
      streak >= 7 ? `${streak} day streak — you're on fire!` :
      streak >= 3 ? `${streak} day streak — keep it up!` :
      streak > 0  ? 'Great start! Come back tomorrow!' :
                    'Start your streak today'
    }`;
  }

  buildHeatmap(stats.dailyActivity || {});

  // Tags
  const tagStats = stats.tagStats || {};
  const topTags  = Object.entries(tagStats)
    .map(([tag, v]) => ({ tag, count: v.count || 0 }))
    .sort((a, b) => b.count - a.count).slice(0, 8);
  const slowTags = Object.entries(tagStats)
    .filter(([, v]) => (v.count || 0) >= 2)
    .map(([tag, v]) => ({ tag, avgTime: Math.round((v.avgTime || 0) / 60) }))
    .sort((a, b) => b.avgTime - a.avgTime).slice(0, 8);

  renderTags('top-tags',  topTags,  'count',   t => t.count);
  renderTags('slow-tags', slowTags, 'avgTime', t => t.avgTime + 'm', true);

  // History
  const hl = document.getElementById('history-list');
  if (!hl) return;
  if (!history.length) {
    hl.innerHTML = '<p style="text-align:center;color:var(--ink3);font-size:13px;padding:20px">No problems solved yet</p>';
  } else {
    hl.innerHTML = history.slice(0, 15).map(item => {
      const d    = (item.difficulty || 'easy').toLowerCase();
      const tags = (item.tags || []).slice(0, 2).map(t => `<span class="tag-pill">${t}</span>`).join('');
      return `<a class="history-row" href="${item.url || '#'}" target="_blank">
        <div class="diff-dot ${d}"></div>
        <span class="h-title">${item.title || 'Unknown'}</span>
        <div class="h-meta">${tags}<span>${fmt(item.timeSpent)}</span><span>${timeAgo(item.solvedAt)}</span></div>
      </a>`;
    }).join('');
  }
}

// ── Excel/CSV Export ──
function exportToCSV(history, stats) {
  const headers = ['#', 'Title', 'Difficulty', 'Pattern', 'Tags', 'Time Spent (min)', 'Date Solved', 'URL'];
  const rows = history.map((item, i) => [
    i + 1,
    `"${(item.title || '').replace(/"/g, '""')}"`,
    item.difficulty || '',
    `"${(item.pattern || '').replace(/"/g, '""')}"`,
    `"${(item.tags || []).join(', ').replace(/"/g, '""')}"`,
    item.timeSpent ? (item.timeSpent / 60).toFixed(1) : '0',
    item.solvedAt ? new Date(item.solvedAt).toLocaleDateString('en-GB') : '',
    `"${item.url || ''}"`,
  ]);

  // Summary rows at top
  const summary = [
    ['DSA Dopamine Engine — Progress Export'],
    [`Exported on: ${new Date().toLocaleDateString('en-GB')}`],
    [`Total Solved: ${stats.totalSolved || 0}`, `Easy: ${stats.easy || 0}`, `Medium: ${stats.medium || 0}`, `Hard: ${stats.hard || 0}`],
    [`Current Streak: ${stats.streak || 0} days`, `Total XP: ${stats.xp || 0}`, `Level: ${stats.level || 'Beginner'}`],
    [],
    headers,
    ...rows,
  ];

  const csv = summary.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `dsa-progress-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('btn-export')?.addEventListener('click', async () => {
  const data    = await new Promise(r => chrome.storage.local.get(['stats', 'history'], r));
  const history = data.history || [];
  const stats   = data.stats   || {};
  if (!history.length) {
    alert('No problems solved yet — nothing to export!');
    return;
  }
  exportToCSV(history, stats);
});

// ── AI Report ──
document.getElementById('btn-report').addEventListener('click', async () => {
  const btn  = document.getElementById('btn-report');
  const body = document.getElementById('modal-body');
  const overlay = document.getElementById('overlay');

  btn.disabled = true;
  btn.textContent = 'Generating...';
  body.innerHTML = '<div class="spin"></div>';
  overlay.classList.add('open');

  const data    = await new Promise(r => chrome.storage.local.get(['stats', 'history'], r));
  const stats   = data.stats   || {};
  const history = data.history || [];

  const reportBtnHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> AI Coaching Report`;

  if (!history.length) {
    body.innerHTML = '<p style="text-align:center;color:var(--ink3);padding:40px;font-size:14px">Solve at least one problem first, then come back for your report.</p>';
    btn.disabled = false; btn.innerHTML = reportBtnHTML;
    return;
  }

  try {
    const r   = await fetch(`${BACKEND}/daily-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: history.slice(0, 20), stats }),
    });
    if (!r.ok) throw new Error('Backend returned ' + r.status);
    const rep = await r.json();

    body.innerHTML = `
      <div>
        <div class="m-section-lbl">Predicted Level</div>
        <span class="predicted-pill">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          ${rep.predictedLevel || 'Intermediate'}
        </span>
      </div>
      <div>
        <div class="m-section-lbl">Overall Assessment</div>
        <p class="m-text">${rep.overallAssessment || ''}</p>
      </div>
      <div class="m-two-col">
        <div class="m-box">
          <div class="m-section-lbl" style="color:var(--green)">Strong Topics</div>
          ${(rep.strongTopics || []).map(t => `<span class="chip chip-g">${t}</span>`).join('')}
        </div>
        <div class="m-box">
          <div class="m-section-lbl" style="color:var(--red)">Needs Work</div>
          ${(rep.weakTopics || []).map(t => `<span class="chip chip-r">${t}</span>`).join('')}
        </div>
      </div>
      <div class="insight-panel">
        <div class="m-section-lbl">Key Data-Driven Insight</div>
        <p class="m-text">${rep.insight || ''}</p>
      </div>
      <div>
        <div class="m-section-lbl">Focus Next</div>
        <p class="m-text">${rep.recommendation || ''}</p>
      </div>
      <div class="motivation-panel">
        <p class="motivation-text">"${rep.motivationalMessage || 'Keep going — every problem sharpens your edge.'}"</p>
      </div>`;
  } catch (e) {
    body.innerHTML = `<div style="text-align:center;padding:40px">
      <div style="font-size:32px;margin-bottom:12px">⚠️</div>
      <p style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:8px">AI Report Unavailable</p>
      <p style="font-size:13px;color:var(--ink2);line-height:1.6">The AI backend is cold-starting on Railway.<br>Wait 10 seconds and try again.</p>
      <button id="error-close-btn" style="margin-top:20px;padding:10px 24px;background:var(--ink);border:none;color:#fff;border-radius:999px;cursor:pointer;font-size:13px;font-weight:600;">Close</button>
    </div>`;
    document.getElementById('error-close-btn')?.addEventListener('click', () => {
      document.getElementById('overlay').classList.remove('open');
    });
  }

  btn.disabled = false;
  btn.innerHTML = reportBtnHTML;
});

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('overlay').classList.remove('open');
});
document.getElementById('overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

render();
