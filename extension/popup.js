// popup.js — DSA Dopamine Engine Popup (Glass UI v2)
// Reads from chrome.storage.local and renders the mini-dashboard

const BACKEND_URL = 'https://dsabittle-production.up.railway.app';

// ── XP level thresholds ──
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
      const pct  = Math.min(
        100,
        Math.round(((xp - LEVELS[i].min) / (LEVELS[i].max - LEVELS[i].min)) * 100)
      );
      return { current: LEVELS[i].name, next: next.name, nextXP: LEVELS[i].max, pct };
    }
  }
  return { current: 'Master', next: 'Master', nextXP: 9999, pct: 100 };
}

function formatTime(seconds) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m    = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ── Main render function ──
async function renderPopup() {
  const data = await new Promise((resolve) => {
    chrome.storage.local.get(['stats', 'history'], resolve);
  });

  const stats   = data.stats   || {};
  const history = data.history || [];

  // Hide loading, show content
  document.getElementById('popup-loading').style.display  = 'none';
  document.getElementById('popup-content').style.display = 'block';

  const total      = stats.totalSolved || 0;
  const streak     = stats.streak      || 0;
  const xp         = stats.xp          || 0;
  const easy       = stats.easy        || 0;
  const medium     = stats.medium      || 0;
  const hard       = stats.hard        || 0;
  const todayCount = (stats.dailyActivity || {})[todayKey()] || 0;

  // ── Header ──
  const levelInfo = getLevelInfo(xp);
  document.getElementById('popup-level').textContent    = levelInfo.current;
  document.getElementById('popup-subtitle').textContent =
    total === 0
      ? 'Open a LeetCode problem to start!'
      : `${total} problem${total !== 1 ? 's' : ''} solved • ${streak} day streak 🔥`;

  // ── Stats Cards ──
  document.getElementById('stat-total').textContent  = total;
  document.getElementById('stat-streak').textContent = streak;
  document.getElementById('stat-xp').textContent     = xp;
  document.getElementById('stat-today').textContent  = todayCount;

  // ── XP Bar ──
  document.getElementById('xp-bar-current-level').textContent = levelInfo.current;
  document.getElementById('xp-bar-next-level').textContent    =
    levelInfo.current === 'Master' ? '🏆 Max' : `${levelInfo.next}`;
  setTimeout(() => {
    document.getElementById('xp-bar-fill').style.width = `${levelInfo.pct}%`;
  }, 100);

  // ── Difficulty Bars ──
  const maxDiff = Math.max(easy, medium, hard, 1);
  document.getElementById('count-easy').textContent   = easy;
  document.getElementById('count-medium').textContent = medium;
  document.getElementById('count-hard').textContent   = hard;
  setTimeout(() => {
    document.getElementById('bar-easy').style.width   = `${(easy   / maxDiff) * 100}%`;
    document.getElementById('bar-medium').style.width = `${(medium / maxDiff) * 100}%`;
    document.getElementById('bar-hard').style.width   = `${(hard   / maxDiff) * 100}%`;
  }, 120);

  // ── Recent History ──
  const listEl  = document.getElementById('popup-history-list');
  if (history.length === 0) {
    listEl.innerHTML = `
      <div class="popup-empty">
        <div class="popup-empty-icon">🚀</div>
        <p>No problems solved yet</p>
        <small>Open a LeetCode problem and click "Mark Solved"</small>
      </div>
    `;
  } else {
    const recent = history.slice(0, 6);
    listEl.innerHTML = recent.map((item) => {
      const diff  = (item.difficulty || 'easy').toLowerCase();
      const ago   = timeAgo(item.solvedAt);
      const time  = formatTime(item.timeSpent);
      const title = item.title || 'Unknown Problem';
      return `
        <a class="history-item" href="${item.url || '#'}" target="_blank" rel="noopener">
          <div class="history-dot ${diff}"></div>
          <span class="history-title">${title}</span>
          <span class="history-time">${time} · ${ago}</span>
        </a>
      `;
    }).join('');
  }
}

// ── MINIMIZE / EXPAND TOGGLE ──
(function initMinimize() {
  const popup = document.getElementById('glass-popup');
  const btn   = document.getElementById('gp-minimize');

  // Restore saved state
  chrome.storage.local.get(['popupMinimized'], (data) => {
    if (data.popupMinimized) {
      popup.classList.add('minimized');
    }
  });

  btn.addEventListener('click', () => {
    const isNowMinimized = popup.classList.toggle('minimized');
    chrome.storage.local.set({ popupMinimized: isNowMinimized });
  });
})();

// ── Footer Buttons ──
document.getElementById('btn-leetcode').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://leetcode.com/problemset/' });
});

document.getElementById('btn-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

document.getElementById('btn-report').addEventListener('click', async () => {
  const btn = document.getElementById('btn-report');
  btn.disabled    = true;
  btn.textContent = '⏳ Generating...';

  const data = await new Promise((resolve) => {
    chrome.storage.local.get(['stats', 'history'], resolve);
  });

  const stats   = data.stats   || {};
  const history = data.history || [];

  if (history.length === 0) {
    btn.disabled    = false;
    btn.innerHTML   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg> AI Report`;
    showPopupToast('Solve at least one problem first! 🚀');
    return;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/daily-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: history.slice(0, 20), stats }),
    });

    if (!response.ok) throw new Error('Backend offline');

    const report = await response.json();
    showReportModal(report);
  } catch (err) {
    showPopupToast('⚠️ Backend not reachable. Check Railway.');
  } finally {
    btn.disabled    = false;
    btn.innerHTML   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg> AI Report`;
  }
});

// ── AI Report Modal (glass style) ──
function showReportModal(report) {
  document.getElementById('report-modal')?.remove();

  const modal = document.createElement('div');
  modal.id    = 'report-modal';
  modal.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.75);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    z-index: 9999; overflow-y: auto; padding: 16px;
    font-family: 'Inter', sans-serif; color: rgba(255,255,255,0.9);
    animation: gpFadeIn 0.25s ease;
  `;

  const lvl   = (report.predictedLevel || 'Intermediate').toLowerCase();
  const lvlColors = {
    beginner: '#4ade80', apprentice: '#4ade80',
    intermediate: '#fbbf24', advanced: '#f87171', expert: '#a78bfa', master: '#60a5fa'
  };
  const color = lvlColors[lvl] || '#60a5fa';

  modal.innerHTML = `
    <style>@keyframes gpFadeIn { from{opacity:0;transform:scale(0.97)} to{opacity:1;transform:scale(1)} }</style>
    <div style="background:rgba(15,15,25,0.85);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.12);border-radius:20px;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.7);">

      <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;">🧠</div>
          <span style="font-size:14px;font-weight:800;color:#fff;">AI Coach Report</span>
        </div>
        <button id="close-report" style="width:28px;height:28px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:7px;color:rgba(255,255,255,0.5);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>

      <div style="padding:16px 18px;display:flex;flex-direction:column;gap:14px;">

        <div>
          <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Predicted Level</div>
          <span style="font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.14);color:${color};">
            ✦ ${report.predictedLevel || 'Intermediate'}
          </span>
        </div>

        <div>
          <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Where You Stand</div>
          <p style="font-size:13px;line-height:1.65;margin:0;color:rgba(255,255,255,0.85);">${report.overallAssessment || ''}</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;">
            <div style="font-size:9px;font-weight:700;color:#4ade80;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">💪 Strong</div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              ${(report.strongTopics || []).map(t => `<span style="font-size:11px;background:rgba(74,222,128,0.1);color:#4ade80;padding:3px 8px;border-radius:20px;border:1px solid rgba(74,222,128,0.2);">${t}</span>`).join('')}
            </div>
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;">
            <div style="font-size:9px;font-weight:700;color:#f87171;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">⚠️ Work On</div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              ${(report.weakTopics || []).map(t => `<span style="font-size:11px;background:rgba(248,113,113,0.1);color:#f87171;padding:3px 8px;border-radius:20px;border:1px solid rgba(248,113,113,0.2);">${t}</span>`).join('')}
            </div>
          </div>
        </div>

        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:13px;">
          <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">🔍 Key Insight</div>
          <p style="font-size:13px;line-height:1.65;margin:0;color:rgba(255,255,255,0.85);">${report.insight || ''}</p>
        </div>

        <div>
          <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">🎯 Focus Next</div>
          <p style="font-size:13px;line-height:1.65;margin:0;color:rgba(255,255,255,0.85);">${report.recommendation || ''}</p>
        </div>

        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:13px;text-align:center;">
          <p style="font-size:13px;font-style:italic;color:rgba(255,255,255,0.7);margin:0;line-height:1.6;">"${report.motivationalMessage || 'Every problem you solve sharpens the edge.'}"</p>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById('close-report').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ── Toast helper ──
function showPopupToast(msg) {
  const old = document.getElementById('popup-toast');
  if (old) old.remove();

  const toast = document.createElement('div');
  toast.id    = 'popup-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity   = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }, 50);
  setTimeout(() => {
    toast.style.opacity   = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', renderPopup);
