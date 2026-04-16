// popup.js — DSA Dopamine Engine Popup
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
      return { current: LEVELS[i].name, next: next.name, nextXP: LEVELS[i].max, pct };
    }
  }
  return { current: 'Master', next: 'Master', nextXP: 9999, pct: 100 };
}

function formatTime(seconds) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
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

function $id(id) { return document.getElementById(id); }

// ── Main render ──
async function renderPopup() {
  const data    = await new Promise(r => chrome.storage.local.get(['stats', 'history'], r));
  const stats   = data.stats   || {};
  const history = data.history || [];

  $id('popup-loading').style.display = 'none';
  $id('popup-content').style.display = 'block';

  const total      = stats.totalSolved || 0;
  const streak     = stats.streak      || 0;
  const xp         = stats.xp          || 0;
  const easy       = stats.easy        || 0;
  const medium     = stats.medium      || 0;
  const hard       = stats.hard        || 0;
  const todayCount = (stats.dailyActivity || {})[todayKey()] || 0;

  const levelInfo = getLevelInfo(xp);

  // Header
  $id('popup-level').textContent   = levelInfo.current;
  $id('popup-subtitle').textContent = total === 0
    ? 'Open a LeetCode problem to start!'
    : `${total} problem${total !== 1 ? 's' : ''} solved • ${streak} day streak 🔥`;

  // Stats
  $id('stat-total').textContent  = total;
  $id('stat-streak').textContent = streak;
  $id('stat-xp').textContent     = xp;
  $id('stat-today').textContent  = todayCount;

  // XP bar
  $id('xp-bar-current-level').textContent = levelInfo.current;
  $id('xp-bar-next-level').textContent    = levelInfo.current === 'Master' ? '🏆 Max' : levelInfo.next;
  $id('xp-pct').textContent               = `${levelInfo.pct}%`;
  setTimeout(() => { $id('xp-bar-fill').style.width = `${levelInfo.pct}%`; }, 100);

  // Difficulty bars
  const maxDiff = Math.max(easy, medium, hard, 1);
  $id('count-easy').textContent   = easy;
  $id('count-medium').textContent = medium;
  $id('count-hard').textContent   = hard;
  setTimeout(() => {
    $id('bar-easy').style.width   = `${(easy   / maxDiff) * 100}%`;
    $id('bar-medium').style.width = `${(medium / maxDiff) * 100}%`;
    $id('bar-hard').style.width   = `${(hard   / maxDiff) * 100}%`;
  }, 120);

  // History
  const listEl = $id('popup-history-list');
  if (history.length === 0) {
    listEl.innerHTML = `
      <div class="popup-empty">
        <div class="popup-empty-icon">🚀</div>
        <p>No problems solved yet</p>
        <small>Open a LeetCode problem and click "Mark Solved"</small>
      </div>`;
  } else {
    listEl.innerHTML = history.slice(0, 6).map(item => {
      const diff  = (item.difficulty || 'easy').toLowerCase();
      const ago   = timeAgo(item.solvedAt);
      const time  = formatTime(item.timeSpent);
      const title = item.title || 'Unknown Problem';
      return `
        <a class="history-item" href="${item.url || '#'}" target="_blank" rel="noopener">
          <div class="history-dot ${diff}"></div>
          <span class="history-title">${title}</span>
          <span class="history-time">${time} · ${ago}</span>
        </a>`;
    }).join('');
  }
}

// ── Minimize toggle ──
function initMinimize() {
  const popup = $id('popup-shell');
  const btn   = $id('gp-minimize');
  if (!popup || !btn) return;

  chrome.storage.local.get(['popupMinimized'], data => {
    if (data.popupMinimized) popup.classList.add('minimized');
  });

  btn.addEventListener('click', () => {
    const minimized = popup.classList.toggle('minimized');
    chrome.storage.local.set({ popupMinimized: minimized });
  });
}

// ── AI Report Modal ──
function showReportModal(report) {
  document.getElementById('report-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'report-modal';
  modal.style.cssText = `
    position:fixed;inset:0;
    background:rgba(30,20,5,0.6);
    backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
    z-index:9999;overflow-y:auto;padding:14px;
    font-family:'Inter',sans-serif;
    animation:fadeIn 0.22s ease;
  `;

  const lvl = (report.predictedLevel || 'Intermediate').toLowerCase();
  const lvlColors = {
    beginner:'#2d8a4e', apprentice:'#2d8a4e',
    intermediate:'#a06010', advanced:'#b03030', expert:'#7c5cbf', master:'#3a7abf'
  };
  const color = lvlColors[lvl] || '#3a7abf';

  modal.innerHTML = `
    <style>@keyframes fadeIn{from{opacity:0}to{opacity:1}}</style>
    <div style="background:rgba(245,238,225,0.9);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.75);border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(100,70,20,0.25);">
      <div style="padding:14px 16px;border-bottom:1px solid rgba(180,140,90,0.18);display:flex;align-items:center;justify-content:space-between;background:rgba(255,252,245,0.5);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;background:rgba(180,140,90,0.15);border:1px solid rgba(180,140,90,0.3);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;">🧠</div>
          <span style="font-size:14px;font-weight:700;color:#2d2416;letter-spacing:-0.3px;font-family:'Inter',sans-serif;">AI Coach Report</span>
        </div>
        <button id="close-report" style="width:28px;height:28px;background:rgba(180,140,90,0.1);border:1px solid rgba(180,140,90,0.22);border-radius:7px;color:rgba(80,60,30,0.5);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>
      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:12px;font-family:'Inter',sans-serif;">
        <div>
          <div style="font-size:9px;font-weight:700;color:rgba(80,60,30,0.45);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Predicted Level</div>
          <span style="font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;background:rgba(180,140,90,0.12);border:1px solid rgba(180,140,90,0.25);color:${color};">✦ ${report.predictedLevel || 'Intermediate'}</span>
        </div>
        <div>
          <div style="font-size:9px;font-weight:700;color:rgba(80,60,30,0.45);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Where You Stand</div>
          <p style="font-size:12px;line-height:1.65;margin:0;color:#3d2a08;">${report.overallAssessment || ''}</p>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="background:rgba(255,252,245,0.6);border:1px solid rgba(180,140,90,0.2);border-radius:10px;padding:11px;">
            <div style="font-size:9px;font-weight:700;color:#2d8a4e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:7px;">💪 Strong</div>
            <div style="display:flex;flex-direction:column;gap:4px;">${(report.strongTopics||[]).map(t=>`<span style="font-size:10px;background:rgba(74,222,128,0.1);color:#2d8a4e;padding:3px 8px;border-radius:20px;border:1px solid rgba(74,222,128,0.25);">${t}</span>`).join('')}</div>
          </div>
          <div style="background:rgba(255,252,245,0.6);border:1px solid rgba(180,140,90,0.2);border-radius:10px;padding:11px;">
            <div style="font-size:9px;font-weight:700;color:#b03030;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:7px;">⚠️ Work On</div>
            <div style="display:flex;flex-direction:column;gap:4px;">${(report.weakTopics||[]).map(t=>`<span style="font-size:10px;background:rgba(220,80,80,0.1);color:#b03030;padding:3px 8px;border-radius:20px;border:1px solid rgba(220,80,80,0.2);">${t}</span>`).join('')}</div>
          </div>
        </div>
        <div style="background:rgba(255,252,245,0.6);border:1px solid rgba(180,140,90,0.2);border-radius:10px;padding:12px;">
          <div style="font-size:9px;font-weight:700;color:rgba(80,60,30,0.45);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">🔍 Key Insight</div>
          <p style="font-size:12px;line-height:1.65;margin:0;color:#3d2a08;">${report.insight || ''}</p>
        </div>
        <div>
          <div style="font-size:9px;font-weight:700;color:rgba(80,60,30,0.45);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">🎯 Focus Next</div>
          <p style="font-size:12px;line-height:1.65;margin:0;color:#3d2a08;">${report.recommendation || ''}</p>
        </div>
        <div style="background:rgba(180,140,90,0.08);border:1px solid rgba(180,140,90,0.2);border-radius:10px;padding:12px;text-align:center;">
          <p style="font-size:12px;font-style:italic;color:rgba(80,60,30,0.65);margin:0;line-height:1.6;">"${report.motivationalMessage || 'Every problem you solve sharpens the edge.'}"</p>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  document.getElementById('close-report').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ── Toast ──
function showPopupToast(msg) {
  document.getElementById('popup-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'popup-toast';
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; }, 50);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500);
}

// ── Boot — everything inside DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', () => {
  renderPopup();
  initMinimize();

  $id('btn-leetcode').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://leetcode.com/problemset/' });
  });

  $id('btn-dashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });

  $id('btn-report').addEventListener('click', async () => {
    const btn = $id('btn-report');
    const aiSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg> AI Report`;

    btn.disabled  = true;
    btn.innerHTML = '⏳ Generating...';

    const data    = await new Promise(r => chrome.storage.local.get(['stats', 'history'], r));
    const stats   = data.stats   || {};
    const history = data.history || [];

    if (!history.length) {
      showPopupToast('Solve at least one problem first! 🚀');
      btn.disabled  = false;
      btn.innerHTML = aiSvg;
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/daily-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: history.slice(0, 20), stats }),
      });
      if (!res.ok) throw new Error('Backend offline');
      showReportModal(await res.json());
    } catch {
      showPopupToast('⚠️ Backend not reachable. Check Railway.');
    } finally {
      btn.disabled  = false;
      btn.innerHTML = aiSvg;
    }
  });
});
