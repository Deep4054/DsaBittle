// popup.js — DSA Dopamine Engine Popup
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
      const pct = Math.min(
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
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
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
  // Fetch stats and history from chrome.storage
  const data = await new Promise((resolve) => {
    chrome.storage.local.get(['stats', 'history'], resolve);
  });

  const stats   = data.stats   || {};
  const history = data.history || [];

  // Hide loading, show content
  document.getElementById('popup-loading').style.display  = 'none';
  document.getElementById('popup-content').style.display = 'block';

  const total   = stats.totalSolved || 0;
  const streak  = stats.streak      || 0;
  const xp      = stats.xp          || 0;
  const easy    = stats.easy         || 0;
  const medium  = stats.medium       || 0;
  const hard    = stats.hard         || 0;
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
    levelInfo.current === 'Master'
      ? '🏆 Max Level!'
      : `${levelInfo.next} (${levelInfo.nextXP} XP)`;
  // Slight delay for animation
  setTimeout(() => {
    document.getElementById('xp-bar-fill').style.width = `${levelInfo.pct}%`;
  }, 80);

  // ── Difficulty Bars ──
  const maxDiff = Math.max(easy, medium, hard, 1);
  document.getElementById('count-easy').textContent   = easy;
  document.getElementById('count-medium').textContent = medium;
  document.getElementById('count-hard').textContent   = hard;
  setTimeout(() => {
    document.getElementById('bar-easy').style.width   = `${(easy   / maxDiff) * 100}%`;
    document.getElementById('bar-medium').style.width = `${(medium / maxDiff) * 100}%`;
    document.getElementById('bar-hard').style.width   = `${(hard   / maxDiff) * 100}%`;
  }, 100);

  // ── Recent History ──
  const listEl = document.getElementById('popup-history-list');

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
      const diff   = (item.difficulty || 'easy').toLowerCase();
      const ago    = timeAgo(item.solvedAt);
      const time   = formatTime(item.timeSpent);
      const title  = item.title || 'Unknown Problem';
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
    btn.textContent = '🤖 AI Report';
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
    showPopupToast('⚠️ Start your backend server first!');
  } finally {
    btn.disabled    = false;
    btn.textContent = '🤖 AI Report';
  }
});

// ── AI Report Modal (rendered inside popup) ──
function showReportModal(report) {
  // Remove existing modal
  document.getElementById('report-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'report-modal';
  modal.style.cssText = `
    position: fixed; inset: 0; background: #0f1117;
    z-index: 9999; overflow-y: auto; padding: 0;
    font-family: 'Inter', sans-serif; color: #e2e8f0;
    animation: ddpSlideIn 0.3s ease;
  `;

  const levelColor = {
    beginner: '#22c55e', apprentice: '#22c55e',
    intermediate: '#f59e0b', advanced: '#ef4444', expert: '#a78bfa',
  };
  const lvl = (report.predictedLevel || 'Intermediate').toLowerCase();
  const color = levelColor[lvl] || '#60a5fa';

  modal.innerHTML = `
    <div style="background: linear-gradient(135deg,#1e1b4b,#0f172a); padding:16px 18px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:space-between;">
      <span style="font-size:14px; font-weight:700; background:linear-gradient(135deg,#a78bfa,#60a5fa); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">🧠 AI Coach Report</span>
      <button id="close-report" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;">✕</button>
    </div>

    <div style="padding:16px 18px; display:flex; flex-direction:column; gap:14px;">

      <!-- Level Badge -->
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:11px; font-weight:700; padding:4px 12px; border-radius:20px; background:rgba(108,99,255,0.15); color:#a78bfa; border:1px solid rgba(108,99,255,0.3);">
          📊 ${report.predictedLevel || 'Intermediate'}
        </span>
      </div>

      <!-- Assessment -->
      <div>
        <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.7px; margin-bottom:6px;">Where You Stand</div>
        <p style="font-size:12.5px; line-height:1.6; margin:0; color:#e2e8f0;">${report.overallAssessment || ''}</p>
      </div>

      <!-- Strengths / Weaknesses -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div style="background:#1a1d2e; border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:10px;">
          <div style="font-size:10px; font-weight:700; color:#22c55e; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">💪 Strong</div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            ${(report.strongTopics || []).map((t) => `
              <span style="font-size:11px; background:rgba(34,197,94,0.1); color:#22c55e; padding:2px 7px; border-radius:10px; border:1px solid rgba(34,197,94,0.2);">${t}</span>
            `).join('')}
          </div>
        </div>
        <div style="background:#1a1d2e; border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:10px;">
          <div style="font-size:10px; font-weight:700; color:#ef4444; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">⚠️ Needs Work</div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            ${(report.weakTopics || []).map((t) => `
              <span style="font-size:11px; background:rgba(239,68,68,0.1); color:#ef4444; padding:2px 7px; border-radius:10px; border:1px solid rgba(239,68,68,0.2);">${t}</span>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Key Insight -->
      <div style="background:linear-gradient(135deg,rgba(108,99,255,0.08),rgba(96,165,250,0.08)); border:1px solid rgba(108,99,255,0.2); border-radius:8px; padding:12px;">
        <div style="font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.7px; margin-bottom:6px;">🔍 Key Insight (Your Data)</div>
        <p style="font-size:12.5px; line-height:1.6; margin:0; color:#e2e8f0;">${report.insight || ''}</p>
      </div>

      <!-- Focus Next -->
      <div>
        <div style="font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.7px; margin-bottom:6px;">🎯 Focus Next</div>
        <p style="font-size:12.5px; line-height:1.6; margin:0; color:#e2e8f0;">${report.recommendation || ''}</p>
      </div>

      <!-- Motivation -->
      <div style="background:linear-gradient(135deg,#1e1b4b,#172554); border-radius:8px; padding:12px; text-align:center;">
        <p style="font-size:13px; font-style:italic; color:#a78bfa; margin:0; line-height:1.5;">"${report.motivationalMessage || 'Keep grinding — every problem makes you stronger!'}"</p>
      </div>

    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById('close-report').addEventListener('click', () => modal.remove());
}

// ── Toast helper for popup ──
function showPopupToast(msg) {
  const old = document.getElementById('popup-toast');
  if (old) old.remove();

  const toast = document.createElement('div');
  toast.id = 'popup-toast';
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%) translateY(10px);
    background: #1a1d2e; border: 1px solid rgba(108,99,255,0.4); color: #e2e8f0;
    font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600;
    padding: 8px 16px; border-radius: 20px; z-index: 99999;
    opacity: 0; transition: all 0.3s ease; white-space: nowrap;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }, 50);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', renderPopup);
