// utils/storage.js — Chrome Storage helpers
// Clean wrapper around chrome.storage.local with defaults

export const StorageKeys = {
  STATS:          'stats',
  HISTORY:        'history',
  ACTIVE_PROBLEM: 'activeProblem',
  KNOWLEDGE_GRAPH:'knowledgeGraph',
  SETTINGS:       'settings',
};

const DEFAULT_STATS = {
  totalSolved:    0,
  easy:           0,
  medium:         0,
  hard:           0,
  streak:         0,
  lastSolvedDate: null,
  xp:             0,
  level:          'Beginner',
  tagStats:       {},
  dailyActivity:  {},
};

const DEFAULT_SETTINGS = {
  backendUrl:      'http://localhost:8000',
  panelPosition:   'right',   // 'right' | 'left'
  showOnLoad:      true,
  dopamineEnabled: true,
};

// ── Get one or many keys ──
export async function get(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

// ── Set key(s) ──
export async function set(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

// ── Get stats with defaults ──
export async function getStats() {
  const { stats } = await get([StorageKeys.STATS]);
  return { ...DEFAULT_STATS, ...(stats || {}) };
}

// ── Get history ──
export async function getHistory(limit = 500) {
  const { history } = await get([StorageKeys.HISTORY]);
  const arr = history || [];
  return limit ? arr.slice(0, limit) : arr;
}

// ── Update stats (merge, not replace) ──
export async function updateStats(patch) {
  const current = await getStats();
  const updated = { ...current, ...patch };
  await set({ [StorageKeys.STATS]: updated });
  return updated;
}

// ── Prepend a solved entry to history ──
export async function addHistoryEntry(entry) {
  const history = await getHistory();
  history.unshift(entry);
  if (history.length > 500) history.pop();
  await set({ [StorageKeys.HISTORY]: history });
}

// ── Get settings with defaults ──
export async function getSettings() {
  const { settings } = await get([StorageKeys.SETTINGS]);
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

// ── Update settings ──
export async function updateSettings(patch) {
  const current = await getSettings();
  const updated = { ...current, ...patch };
  await set({ [StorageKeys.SETTINGS]: updated });
  return updated;
}

// ── Compute today's activity key ──
export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ── Increment today's solve count in dailyActivity ──
export async function incrementDailyActivity() {
  const stats = await getStats();
  const key = todayKey();
  const activity = stats.dailyActivity || {};
  activity[key] = (activity[key] || 0) + 1;
  await updateStats({ dailyActivity: activity });
}

// ── Clear everything (dev/debug use) ──
export async function clearAll() {
  return new Promise((resolve) => {
    chrome.storage.local.clear(resolve);
  });
}

// ── Get storage usage (bytes) ──
export async function getStorageUsage() {
  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, resolve);
  });
}
