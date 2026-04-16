// background.js — DSA Dopamine Engine Service Worker
// Handles all API calls, storage, and message routing

// ── Backend URL Config ──
const PRODUCTION_URL = 'https://dsabittle-production.up.railway.app';
const LOCAL_URL      = 'http://localhost:8000';
const BACKEND_URL    = PRODUCTION_URL || LOCAL_URL;

// ── Fetch with retry + timeout (handles Railway cold-start drops) ──
// Railway free tier drops the TCP connection during cold-start,
// causing 'Failed to fetch'. We retry up to 3 times with backoff.
async function fetchWithRetry(url, options = {}, { retries = 3, timeoutMs = 15000, backoffMs = 2000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      console.log(`[DSA Engine] fetch attempt ${attempt}/${retries}: ${url}`);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err.name === 'AbortError'
        ? new Error(`Timeout after ${timeoutMs / 1000}s`)
        : err;
      console.warn(`[DSA Engine] attempt ${attempt} failed:`, lastErr.message);
      if (attempt < retries) {
        // Exponential backoff: 2s, 4s
        await new Promise(r => setTimeout(r, backoffMs * attempt));
      }
    }
  }
  throw lastErr;
}


// ── Message Router ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[DSA Engine] Message received:', message.type);

  switch (message.type) {
    case 'ANALYZE_PROBLEM':
      analyzeProblem(message.payload).then(sendResponse).catch((err) => {
        console.error('[ANALYZE_PROBLEM] Error:', err);
        sendResponse({ success: false, error: err.message });
      });
      break;

    case 'DEEPER_EXPLANATION':
      getDeeperExplanation(message.payload).then(sendResponse).catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
      break;

    case 'PROBLEM_OPENED':
      saveProblemOpen(message.payload).then(sendResponse).catch(console.error);
      break;

    case 'PROBLEM_SOLVED':
      saveProblemSolved(message.payload).then(sendResponse).catch((err) => {
        console.error('[PROBLEM_SOLVED] Error:', err);
        sendResponse({ success: false });
      });
      break;

    case 'GET_STATS':
      getStats().then(sendResponse).catch(console.error);
      break;

    case 'GET_HISTORY':
      getHistory().then(sendResponse).catch(console.error);
      break;

    case 'CLEAR_DATA':
      clearAllData().then(sendResponse).catch(console.error);
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return true; // Keep message channel open for async
});

// ── AI Analysis via FastAPI Backend ──
async function analyzeProblem(data) {
  try {
    const response = await fetchWithRetry(`${BACKEND_URL}/analyze-problem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.title,
        description: data.description || '',
        difficulty: data.difficulty || 'Unknown',
        tags: data.tags || [],
      }),
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status ${response.status}`);
    }

    const result = await response.json();
    return { success: true, data: result };
  } catch (err) {
    console.error('[Backend] analyzeProblem failed:', err.message);
    // Return cached/fallback insights so the UI doesn't break
    return {
      success: true,
      data: generateFallbackInsights(data),
      cached: true,
    };
  }
}

// Fallback when backend is offline
function generateFallbackInsights(data) {
  const patternMap = {
    'array': 'Array Traversal',
    'hash table': 'Hash Map Lookup',
    'sliding window': 'Sliding Window',
    'dynamic programming': 'Dynamic Programming',
    'graph': 'Graph Traversal (BFS/DFS)',
    'tree': 'Tree DFS/BFS',
    'binary search': 'Binary Search',
    'two pointers': 'Two Pointers',
    'stack': 'Monotonic Stack',
    'heap': 'Priority Queue / Heap',
    'linked list': 'Linked List Pointer',
  };

  const tags = (data.tags || []).map((t) => t.toLowerCase());
  let pattern = 'General Problem Solving';
  for (const [key, val] of Object.entries(patternMap)) {
    if (tags.some((t) => t.includes(key))) {
      pattern = val;
      break;
    }
  }

  return {
    pattern,
    difficulty: data.difficulty || 'Unknown',
    useCases: [
      'Used in search & indexing systems (Google, Elasticsearch)',
      'Core concept in database query optimization',
      'Applied in real-time data processing pipelines',
    ],
    companies: ['Google', 'Amazon', 'Microsoft', 'Meta'],
    whyMatters:
      'This pattern appears frequently in production systems that need to process large datasets efficiently. Mastering it gives you the mental model to optimize any algorithm.',
    analogy:
      '⚠️ Backend offline — showing cached insights. Start your FastAPI server for live AI analysis.',
  };
}

// ── Deeper Explanation ──
async function getDeeperExplanation(data) {
  try {
    // Shorter timeout for deep dive — 10s, 1 retry only
    const response = await fetchWithRetry(
      `${BACKEND_URL}/deeper-explanation`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: data.title, pattern: data.pattern }),
      },
      { retries: 1, timeoutMs: 10000, backoffMs: 1000 }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    console.log('[DSA Engine] Deeper explanation received:', Object.keys(result));
    return { success: true, data: result };
  } catch (err) {
    console.warn('[DSA Engine] getDeeperExplanation failed, using fallback:', err.message);
    // Always return a fallback so the UI shows something
    return {
      success: true,
      data: generateFallbackDeepDive(data),
      cached: true,
    };
  }
}

// Fallback deep dive data
function generateFallbackDeepDive(data) {
  const pattern = data.pattern || 'General';
  const title   = data.title || 'This problem';
  return {
    timeComplexity: 'O(n) — see editorial for details',
    spaceComplexity: 'O(1) — see editorial for details',
    systemDesignConnection: `${pattern} patterns are commonly used in distributed systems for rate-limiting, caching, and streaming data pipelines. This specific problem type often appears in design interviews at FAANG companies.`,
    edgeCases: [
      'Empty or null input array/string',
      'Single element (boundary condition)',
      'All elements identical or monotonic',
      'Integer overflow with very large values',
    ],
    followUpProblems: [
      `${title} — Follow-up: optimize space`,
      'Similar harder variant on LeetCode',
    ],
    mentalModel: `Recognize the ${pattern} structure first — identify what you\'re tracking and why. Then consider the constraints to choose the right data structure. Finally, handle edge cases at the boundaries.`,
  };
}

// ── Save problem open event ──
async function saveProblemOpen(data) {
  await chrome.storage.local.set({
    activeProblem: {
      ...data,
      openedAt: Date.now(),
    },
  });

  // Update daily activity
  const storage = await chrome.storage.local.get(['stats']);
  const stats = storage.stats || getDefaultStats();
  const today = getTodayKey();
  if (!stats.dailyActivity) stats.dailyActivity = {};
  // Just record the visit (not a solve yet)
  await chrome.storage.local.set({ stats });

  return { success: true };
}

// ── Save solved problem + update all analytics ──
async function saveProblemSolved(data) {
  const storage = await chrome.storage.local.get(['history', 'stats']);
  const history = storage.history || [];
  const stats = storage.stats || getDefaultStats();

  // Build history entry
  const entry = {
    id: Date.now(),
    title: data.title,
    slug: data.slug || '',
    difficulty: data.difficulty || 'Unknown',
    tags: data.tags || [],
    timeSpent: data.timeSpent || 0,
    solvedAt: data.solvedAt || Date.now(),
    url: data.url || '',
    pattern: data.pattern || '',
  };

  history.unshift(entry);
  if (history.length > 500) history.pop();

  // ── Update counts ──
  stats.totalSolved = (stats.totalSolved || 0) + 1;
  const diffKey = (data.difficulty || 'unknown').toLowerCase();
  stats[diffKey] = (stats[diffKey] || 0) + 1;

  // ── Update tag analytics ──
  (data.tags || []).forEach((tag) => {
    if (!stats.tagStats) stats.tagStats = {};
    if (!stats.tagStats[tag]) {
      stats.tagStats[tag] = { count: 0, totalTime: 0, avgTime: 0 };
    }
    stats.tagStats[tag].count++;
    stats.tagStats[tag].totalTime += data.timeSpent || 0;
    stats.tagStats[tag].avgTime = Math.floor(
      stats.tagStats[tag].totalTime / stats.tagStats[tag].count
    );
  });

  // ── Update streak ──
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (stats.lastSolvedDate === yesterday) {
    stats.streak = (stats.streak || 0) + 1;
  } else if (stats.lastSolvedDate !== today) {
    stats.streak = 1;
  }
  stats.lastSolvedDate = today;

  // ── Update daily heatmap ──
  const todayKey = getTodayKey();
  if (!stats.dailyActivity) stats.dailyActivity = {};
  stats.dailyActivity[todayKey] = (stats.dailyActivity[todayKey] || 0) + 1;

  // ── XP System ──
  const xpMap = { easy: 10, medium: 25, hard: 60 };
  const xpGain = xpMap[diffKey] || 10;
  stats.xp = (stats.xp || 0) + xpGain;
  stats.level = computeLevel(stats.xp);

  await chrome.storage.local.set({ history, stats });

  const dopamine = getDopamineMessage(data, stats, xpGain);
  return { success: true, dopamine };
}

function getDefaultStats() {
  return {
    totalSolved: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    streak: 0,
    lastSolvedDate: null,
    xp: 0,
    level: 'Beginner',
    tagStats: {},
    dailyActivity: {},
  };
}

function computeLevel(xp) {
  if (xp < 100) return 'Beginner';
  if (xp < 300) return 'Apprentice';
  if (xp < 600) return 'Intermediate';
  if (xp < 1200) return 'Advanced';
  return 'Expert';
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-04-15"
}

function getDopamineMessage(data, stats, xpGain) {
  const streak = stats.streak || 1;
  const total = stats.totalSolved || 1;
  const diff = (data.difficulty || 'Easy').toLowerCase();

  const messages = [
    `🔥 ${streak} day streak! Keep it up!`,
    `⚡ +${xpGain} XP! Total: ${stats.xp} XP | Level: ${stats.level}`,
    `🏆 Problem #${total} solved! You're in the top grind!`,
    `💡 You just used the "${data.pattern || 'core'}" pattern — engineers at Google do this daily!`,
    diff === 'hard'
      ? `🚀 HARD problem done! That's the stuff interviews are made of!`
      : `🎯 ${total} problems solved — every one builds your muscle memory!`,
  ];

  return messages[Math.floor(Math.random() * messages.length)];
}

// ── Stats & History getters ──
async function getStats() {
  const storage = await chrome.storage.local.get(['stats']);
  return storage.stats || getDefaultStats();
}

async function getHistory() {
  const storage = await chrome.storage.local.get(['history']);
  return storage.history || [];
}

async function clearAllData() {
  await chrome.storage.local.clear();
  return { success: true };
}

// ── Alarms: weekly report + Railway keep-alive ──
chrome.runtime.onInstalled.addListener(() => {
  // Weekly report reminder
  chrome.alarms.create('weekly-report', {
    periodInMinutes: 60 * 24 * 7,
  });
  // Keep Railway warm — ping every 4 minutes to prevent cold-starts
  chrome.alarms.create('keep-alive', {
    periodInMinutes: 4,
  });
  console.log('[DSA Engine] Extension installed. Backend:', BACKEND_URL);
});

// Also recreate keep-alive on service worker startup (in case it was lost)
chrome.alarms.get('keep-alive', (alarm) => {
  if (!alarm) {
    chrome.alarms.create('keep-alive', { periodInMinutes: 4 });
    console.log('[DSA Engine] Recreated keep-alive alarm');
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'weekly-report') {
    chrome.storage.local.get(['stats'], (storage) => {
      const stats = storage.stats || {};
      if ((stats.totalSolved || 0) > 0) {
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '🧠 DSA Weekly Report Ready',
          message: `You solved ${stats.totalSolved} problems this week! Check your dashboard.`,
        });
      }
    });
  }

  if (alarm.name === 'keep-alive') {
    // Silent ping to keep Railway from sleeping
    fetch(`${BACKEND_URL}/health`)
      .then(r => r.json())
      .then(d => console.log('[DSA Engine] Keep-alive ping OK:', d.status))
      .catch(e => console.warn('[DSA Engine] Keep-alive ping failed:', e.message));
  }
});
