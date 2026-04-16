// popup.js — DSA Engine Popup
const BACKEND_URL = 'https://dsabittle-production.up.railway.app';

const LEVELS = [
  { name: 'Beginner',     min: 0,    max: 100  },
  { name: 'Apprentice',   min: 100,  max: 300  },
  { name: 'Intermediate', min: 300,  max: 600  },
  { name: 'Advanced',     min: 600,  max: 1200 },
  { name: 'Expert',       min: 1200, max: 2400 },
  { name: 'Master',       min: 2400, max: 9999 },
];

function getLevelInfo(xp) {
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp < LEVELS[i].max) {
      const next = LEVELS[i + 1] || LEVELS[i];
      const pct  = Math.min(100, Math.round(((xp - LEVELS[i].min) / (LEVELS[i].max - LEVELS[i].min)) * 100));
      return { current: LEVELS[i].name, next: next.name, pct };
    }
  }
  return { current: 'Master', next: 'Master', pct: 100 };
}

function formatTime(s) {
  if (!s) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts, m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function todayKey() { return new Date().toISOString().slice(0, 10); }
function $id(id)    { return document.getElementById(id); }

// ── Theme ──
function initTheme() {
  chrome.storage.local.get(['theme'], d => {
    const theme = d.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  });

  $id('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next    = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    chrome.storage.local.set({ theme: next });
  });
}

// ── Minimize ──
function initMinimize() {
  const popup = $id('popup-shell');
  const btn   = $id('gp-minimize');
  if (!popup || !btn) return;

  chrome.storage.local.get(['popupMinimized'], d => {
    if (d.popupMinimized) popup.classList.add('minimized');
  });

  btn.addEventListener('click', () => {
    const min = popup.classList.toggle('minimized');
    const poly = btn.querySelector('polyline');
    if (poly) poly.setAttribute('points', min ? '6 9 12 15 18 9' : '18 15 12 9 6 15');
    chrome.storage.local.set({ popupMinimized: min });
  });
}

// ── Render ──
async function renderPopup() {
  const data    = await new Promise(r => chrome.storage.local.get(['stats', 'history'], r));
  const stats   = data.stats   || {};
  const history = data.history || [];

  $id('popup-loading').style.display = 'none';
  $id('popup-content').style.display = 'block';

  const total  = stats.totalSolved || 0;
  const streak = stats.streak      || 0;
  const xp     = stats.xp          || 0;
  const easy   = stats.easy        || 0;
  const medium = stats.medium      || 0;
  const hard   = stats.hard        || 0;
  const today  = (stats.dailyActivity || {})[todayKey()] || 0;
  const lvl    = getLevelInfo(xp);

  // Header
  $id('popup-level').textContent    = lvl.current;
  $id('popup-subtitle').textContent = total === 0
    ? 'Open a LeetCode problem to start!'
    : `${total} problem${total !== 1 ? 's' : ''} solved · ${streak} day streak 🔥`;

  // Stats
  $id('stat-total').textContent  = total;
  $id('stat-streak').textContent = streak;
  $id('stat-xp').textContent     = xp;
  $id('stat-today').textContent  = today;

  // XP
  $id('xp-bar-current-level').textContent = lvl.current;
  $id('xp-bar-next-level').textContent    = lvl.current === 'Master' ? '🏆 Max' : lvl.next;
  $id('xp-pct').textContent               = `${lvl.pct}%`;
  setTimeout(() => { $id('xp-bar-fill').style.width = `${lvl.pct}%`; }, 100);

  // Difficulty
  const maxD = Math.max(easy, medium, hard, 1);
  $id('count-easy').textContent   = easy;
  $id('count-medium').textContent = medium;
  $id('count-hard').textContent   = hard;
  setTimeout(() => {
    $id('bar-easy').style.width   = `${(easy   / maxD) * 100}%`;
    $id('bar-medium').style.width = `${(medium / maxD) * 100}%`;
    $id('bar-hard').style.width   = `${(hard   / maxD) * 100}%`;
  }, 120);

  // History
  const listEl = $id('popup-history-list');
  if (!history.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🚀</div>
        <p>No problems solved yet</p>
        <small>Open a LeetCode problem and click "Mark Solved"</small>
      </div>`;
  } else {
    listEl.innerHTML = history.slice(0, 6).map(item => {
      const diff  = (item.difficulty || 'easy').toLowerCase();
      const title = item.title || 'Unknown Problem';
      return `
        <a class="history-item" href="${item.url || '#'}" target="_blank" rel="noopener">
          <div class="h-dot ${diff}"></div>
          <span class="h-title">${title}</span>
          <span class="h-time">${formatTime(item.timeSpent)} · ${timeAgo(item.solvedAt)}</span>
        </a>`;
    }).join('');
  }
}

// ── AI Report Modal ──
function showReportModal(report) {
  document.getElementById('report-modal')?.remove();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const bg     = isDark ? '#1a1a22' : '#ffffff';
  const text   = isDark ? '#f0f0f5' : '#0f0f18';
  const text2  = isDark ? 'rgba(240,240,245,0.55)' : 'rgba(15,15,24,0.52)';
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const card   = isDark ? '#22222e' : '#f4f4f8';

  const lvl = (report.predictedLevel || 'Intermediate').toLowerCase();
  const lvlColor = { beginner:'#00c896', apprentice:'#00c896', intermediate:'#ffa502', advanced:'#ff6b35', expert:'#7c5cfc', master:'#2d9cdb' }[lvl] || '#7c5cfc';

  const modal = document.createElement('div');
  modal.id = 'report-modal';
  modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(12px);z-index:9999;overflow-y:auto;padding:14px;font-family:'Plus Jakarta Sans',sans-serif;animation:fadeIn 0.2s ease;`;

  modal.innerHTML = `
    <style>@keyframes fadeIn{from{opacity:0}to{opacity:1}}</style>
    <div style="background:${bg};border:1.5px solid ${border};border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.5);">
      <div style="padding:16px 18px;border-bottom:1.5px solid ${border};display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;background:linear-gradient(135deg,#7c5cfc,#5b3fd4);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 4px 12px rgba(124,92,252,0.4);">🧠</div>
          <span style="font-size:15px;font-weight:800;color:${text};letter-spacing:-0.4px;">AI Coach Report</span>
        </div>
        <button id="close-report" style="width:30px;height:30px;background:${card};border:1.5px solid ${border};border-radius:8px;color:${text2};cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>
      <div style="padding:16px 18px;display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:10px;font-weight:800;color:${text2};text-transform:uppercase;letter-spacing:0.8px;">Level</span>
          <span style="font-size:12px;font-weight:800;padding:4px 12px;border-radius:20px;background:${lvlColor}22;border:1.5px solid ${lvlColor}44;color:${lvlColor};">✦ ${report.predictedLevel || 'Intermediate'}</span>
        </div>
        <div>
          <div style="font-size:10px;font-weight:800;color:${text2};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:7px;">Assessment</div>
          <p style="font-size:13px;line-height:1.65;margin:0;color:${text};font-weight:500;">${report.overallAssessment || ''}</p>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div style="background:${card};border:1.5px solid rgba(0,200,150,0.2);border-radius:12px;padding:12px;">
            <div style="font-size:10px;font-weight:800;color:#00c896;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">💪 Strong</div>
            <div style="display:flex;flex-direction:column;gap:5px;">${(report.strongTopics||[]).map(t=>`<span style="font-size:11px;background:rgba(0,200,150,0.1);color:#00c896;padding:3px 9px;border-radius:20px;border:1px solid rgba(0,200,150,0.25);font-weight:700;">${t}</span>`).join('')}</div>
          </div>
          <div style="background:${card};border:1.5px solid rgba(255,71,87,0.2);border-radius:12px;padding:12px;">
            <div style="font-size:10px;font-weight:800;color:#ff4757;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">⚠️ Work On</div>
            <div style="display:flex;flex-direction:column;gap:5px;">${(report.weakTopics||[]).map(t=>`<span style="font-size:11px;background:rgba(255,71,87,0.1);color:#ff4757;padding:3px 9px;border-radius:20px;border:1px solid rgba(255,71,87,0.25);font-weight:700;">${t}</span>`).join('')}</div>
          </div>
        </div>
        <div style="background:${card};border:1.5px solid rgba(124,92,252,0.2);border-radius:12px;padding:13px;">
          <div style="font-size:10px;font-weight:800;color:#7c5cfc;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:7px;">🔍 Key Insight</div>
          <p style="font-size:13px;line-height:1.65;margin:0;color:${text};font-weight:500;">${report.insight || ''}</p>
        </div>
        <div>
          <div style="font-size:10px;font-weight:800;color:${text2};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:7px;">🎯 Focus Next</div>
          <p style="font-size:13px;line-height:1.65;margin:0;color:${text};font-weight:500;">${report.recommendation || ''}</p>
        </div>
        <div style="background:linear-gradient(135deg,rgba(124,92,252,0.1),rgba(91,63,212,0.08));border:1.5px solid rgba(124,92,252,0.2);border-radius:12px;padding:13px;text-align:center;">
          <p style="font-size:13px;font-style:italic;color:#a78bfa;margin:0;line-height:1.65;font-weight:600;">"${report.motivationalMessage || 'Every problem you solve sharpens the edge.'}"</p>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  document.getElementById('close-report').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ── Toast ──
function showToast(msg) {
  const t = $id('popup-toast');
  if (!t) return;
  t.textContent = msg;
  t.style.opacity   = '1';
  t.style.transform = 'translateX(-50%) translateY(0)';
  setTimeout(() => {
    t.style.opacity   = '0';
    t.style.transform = 'translateX(-50%) translateY(10px)';
  }, 2500);
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMinimize();
  renderPopup();

  $id('btn-leetcode').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://leetcode.com/problemset/' });
  });

  $id('btn-dashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });

  $id('btn-report').addEventListener('click', async () => {
    const btn   = $id('btn-report');
    const aiSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg> AI Report`;

    btn.disabled  = true;
    btn.innerHTML = '⏳ Generating...';

    const data    = await new Promise(r => chrome.storage.local.get(['stats', 'history'], r));
    const history = data.history || [];
    const stats   = data.stats   || {};

    if (!history.length) {
      showToast('Solve at least one problem first! 🚀');
      btn.disabled = false; btn.innerHTML = aiSvg;
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/daily-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: history.slice(0, 20), stats }),
      });
      if (!res.ok) throw new Error('offline');
      showReportModal(await res.json());
    } catch {
      showToast('⚠️ Backend cold-starting — retry in 10s');
    } finally {
      btn.disabled = false; btn.innerHTML = aiSvg;
    }
  });
});
