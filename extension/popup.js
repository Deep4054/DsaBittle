// popup.js — DSA Engine
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
  if (!s) return '';
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

const MOTIVATIONS = [
  'Consistency beats intensity. Keep going.',
  'One more problem, one more win.',
  'Top 1% grind starts here.',
  'Your future self is watching.',
  'Every problem sharpens your edge.',
];

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
  $id('popup-level').textContent = lvl.current;

  // Ticker
  $id('popup-subtitle').textContent = total === 0
    ? 'Open a LeetCode problem to start.'
    : MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)];

  // Stats
  $id('stat-total').textContent  = total;
  $id('stat-streak').textContent = streak;
  $id('stat-today').textContent  = today;
  $id('stat-xp').textContent     = `${xp} XP`;

  // XP
  $id('xp-bar-current-level').textContent = lvl.current;
  $id('xp-bar-next-level').textContent    = lvl.current === 'Master' ? 'Max' : lvl.next;
  $id('xp-pct').textContent               = `${lvl.pct}%`;
  setTimeout(() => { $id('xp-bar-fill').style.width = `${lvl.pct}%`; }, 120);

  // Difficulty
  const maxD = Math.max(easy, medium, hard, 1);
  $id('count-easy').textContent   = easy;
  $id('count-medium').textContent = medium;
  $id('count-hard').textContent   = hard;
  setTimeout(() => {
    $id('bar-easy').style.width   = `${(easy   / maxD) * 100}%`;
    $id('bar-medium').style.width = `${(medium / maxD) * 100}%`;
    $id('bar-hard').style.width   = `${(hard   / maxD) * 100}%`;
  }, 140);

  // History
  const listEl = $id('popup-history-list');
  if (!history.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p>No problems solved yet</p>
        <small>Open a LeetCode problem and mark it solved</small>
      </div>`;
  } else {
    listEl.innerHTML = history.slice(0, 5).map(item => {
      const diff  = (item.difficulty || 'easy').toLowerCase();
      const title = item.title || 'Unknown Problem';
      const time  = formatTime(item.timeSpent);
      const ago   = timeAgo(item.solvedAt);
      return `
        <a class="history-item" href="${item.url || '#'}" target="_blank" rel="noopener">
          <div class="h-dot ${diff}"></div>
          <span class="h-title">${title}</span>
          <span class="h-time">${[time, ago].filter(Boolean).join(' · ')}</span>
        </a>`;
    }).join('');
  }
}

// AI Report Modal
function showReportModal(report) {
  document.getElementById('report-modal')?.remove();

  const lvl = (report.predictedLevel || 'Intermediate').toLowerCase();
  const lvlColor = {
    beginner:'#15803d', apprentice:'#15803d',
    intermediate:'#b45309', advanced:'#b45309',
    expert:'#111', master:'#111'
  }[lvl] || '#111';

  const modal = document.createElement('div');
  modal.id = 'report-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.5);
    backdrop-filter:blur(8px);z-index:9999;overflow-y:auto;padding:14px;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  `;

  modal.innerHTML = `
    <style>@keyframes fadeIn{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:none}}</style>
    <div style="background:#FAF8F3;border:1px solid rgba(0,0,0,0.08);border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.3);animation:fadeIn 0.22s ease;">
      <div style="padding:14px 16px 13px;border-bottom:1px solid rgba(0,0,0,0.07);display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:9px;">
          <div style="width:28px;height:28px;background:#111;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FAF8F3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>
          </div>
          <span style="font-size:13px;font-weight:700;color:#111;letter-spacing:-0.2px;">AI Coach Report</span>
        </div>
        <button id="close-report" style="width:26px;height:26px;background:transparent;border:1px solid rgba(0,0,0,0.12);border-radius:50%;color:rgba(0,0,0,0.35);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;">&#x2715;</button>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:14px;">
        <div style="background:#FFF8EE;border-left:3px solid #E8A020;padding:12px 12px 12px 10px;border-radius:0 10px 10px 0;">
          <div style="font-size:8.5px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:rgba(146,64,14,0.7);margin-bottom:6px;">Predicted Level</div>
          <span style="font-size:12px;font-weight:700;color:${lvlColor};">${report.predictedLevel || 'Intermediate'}</span>
        </div>
        <div>
          <div style="font-size:8.5px;font-weight:600;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Assessment</div>
          <p style="font-size:12px;line-height:1.7;margin:0;color:rgba(0,0,0,0.55);font-weight:400;">${report.overallAssessment || ''}</p>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;padding:11px;">
            <div style="font-size:8.5px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:7px;">Strong At</div>
            <div style="display:flex;flex-direction:column;gap:4px;">${(report.strongTopics||[]).map(t=>`<span style="font-size:10.5px;font-weight:500;color:#15803d;">${t}</span>`).join('')}</div>
          </div>
          <div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;padding:11px;">
            <div style="font-size:8.5px;font-weight:600;color:#b91c1c;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:7px;">Work On</div>
            <div style="display:flex;flex-direction:column;gap:4px;">${(report.weakTopics||[]).map(t=>`<span style="font-size:10.5px;font-weight:500;color:#b91c1c;">${t}</span>`).join('')}</div>
          </div>
        </div>
        <div>
          <div style="font-size:8.5px;font-weight:600;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Key Insight</div>
          <p style="font-size:12px;line-height:1.7;margin:0;color:rgba(0,0,0,0.55);">${report.insight || ''}</p>
        </div>
        <div>
          <div style="font-size:8.5px;font-weight:600;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Focus Next</div>
          <p style="font-size:12px;line-height:1.7;margin:0;color:rgba(0,0,0,0.55);">${report.recommendation || ''}</p>
        </div>
        <div style="border-top:1px solid rgba(0,0,0,0.07);padding-top:12px;">
          <p style="font-size:12px;font-style:italic;color:rgba(0,0,0,0.4);margin:0;line-height:1.65;text-align:center;">"${report.motivationalMessage || 'Every problem you solve sharpens the edge.'}"</p>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  document.getElementById('close-report').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

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

document.addEventListener('DOMContentLoaded', () => {
  renderPopup();

  $id('btn-leetcode').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://leetcode.com/problemset/' });
  });

  $id('btn-dashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });

  $id('btn-report').addEventListener('click', async () => {
    const btn  = $id('btn-report');
    const orig = btn.innerHTML;

    btn.disabled  = true;
    btn.innerHTML = 'Generating...';

    const data    = await new Promise(r => chrome.storage.local.get(['stats', 'history'], r));
    const history = data.history || [];
    const stats   = data.stats   || {};

    if (!history.length) {
      showToast('Solve at least one problem first.');
      btn.disabled = false; btn.innerHTML = orig;
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
      showToast('Backend cold-starting — retry in 10s');
    } finally {
      btn.disabled = false; btn.innerHTML = orig;
    }
  });
});
