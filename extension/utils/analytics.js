// utils/analytics.js — Weakness analysis and insight generation
// Runs locally (no API call needed) using chrome.storage data

// ── Classify tag strength based on count + avg time ──
export function classifyTagStrengths(tagStats) {
  const results = { strong: [], moderate: [], weak: [], untouched: [] };

  const entries = Object.entries(tagStats || {});
  if (entries.length === 0) return results;

  // Compute global avg time across all tags
  const totalTimes  = entries.map(([, v]) => v.avgTime || 0);
  const globalAvg   = totalTimes.reduce((a, b) => a + b, 0) / (totalTimes.length || 1);

  entries.forEach(([tag, data]) => {
    const { count = 0, avgTime = 0 } = data;
    if (count === 0) {
      results.untouched.push(tag);
      return;
    }

    // Strength score: high count + low time = strong
    const timeRatio = globalAvg > 0 ? avgTime / globalAvg : 1;

    if (count >= 5 && timeRatio < 0.9) {
      results.strong.push({ tag, count, avgTime });
    } else if (count >= 3 && timeRatio < 1.2) {
      results.moderate.push({ tag, count, avgTime });
    } else {
      results.weak.push({ tag, count, avgTime });
    }
  });

  // Sort each group: most solved first
  results.strong.sort((a, b) => b.count - a.count);
  results.moderate.sort((a, b) => b.count - a.count);
  // Weak sorted by avgTime (slowest = most problematic first)
  results.weak.sort((a, b) => b.avgTime - a.avgTime);

  return results;
}

// ── Generate a local insight (no API) ──
export function generateLocalInsight(stats, tagStrengths) {
  const { totalSolved = 0, easy = 0, medium = 0, hard = 0, streak = 0 } = stats;

  if (totalSolved === 0) {
    return { type: 'onboard', message: 'Solve your first problem to get insights!' };
  }

  // Heavy Easy bias
  if (easy > medium * 2 && easy > 5) {
    return {
      type: 'difficulty-gap',
      message: `You've solved ${easy} Easy vs ${medium} Medium problems. Time to level up — start targeting Medium problems to prepare for real interviews.`,
    };
  }

  // Weak tag detected
  if (tagStrengths.weak.length > 0) {
    const weakest = tagStrengths.weak[0];
    const avgMins = Math.round(weakest.avgTime / 60);
    return {
      type: 'weak-topic',
      message: `Your avg time on "${weakest.tag}" is ${avgMins} min — significantly above your usual pace. Spend 3 focused sessions here.`,
    };
  }

  // Low streak
  if (streak === 0 && totalSolved > 10) {
    return {
      type: 'streak-broken',
      message: `Streak broken! Consistency beats quantity — even one problem a day compounds massively over a month.`,
    };
  }

  // Good streak
  if (streak >= 7) {
    return {
      type: 'great-streak',
      message: `${streak}-day streak 🔥 You're in the top 5% of consistent solvers. Don't break the chain!`,
    };
  }

  // General progress
  return {
    type: 'progress',
    message: `${totalSolved} problems solved. Keep pushing — 100 problems is the mental model shift that makes interviews click.`,
  };
}

// ── Top tags by solve count ──
export function getTopTags(tagStats, n = 5) {
  return Object.entries(tagStats || {})
    .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
    .slice(0, n)
    .map(([tag, data]) => ({ tag, ...data }));
}

// ── Slowest tags (by avg solve time, min 2 solves) ──
export function getSlowestTags(tagStats, n = 5) {
  return Object.entries(tagStats || {})
    .filter(([, v]) => (v.count || 0) >= 2)
    .sort((a, b) => (b[1].avgTime || 0) - (a[1].avgTime || 0))
    .slice(0, n)
    .map(([tag, data]) => ({ tag, avgMinutes: Math.round((data.avgTime || 0) / 60), ...data }));
}

// ── Radar chart data (for Phase 4 dashboard) ──
export function buildRadarData(tagStats) {
  const DSA_TOPICS = [
    'Array', 'String', 'Hash Table', 'Dynamic Programming',
    'Graph', 'Tree', 'Binary Search', 'Two Pointers',
    'Sliding Window', 'Stack', 'Heap', 'Greedy',
  ];

  return DSA_TOPICS.map((topic) => {
    const data = tagStats[topic] || { count: 0, avgTime: 0 };
    // Strength: 0-100 (count weighted, time-penalized)
    const countScore = Math.min(100, (data.count || 0) * 8);
    const timeScore  = data.avgTime > 0 ? Math.max(0, 100 - data.avgTime / 60) : 0;
    const strength   = data.count > 0 ? Math.round((countScore + timeScore) / 2) : 0;
    return { topic, strength, count: data.count || 0, avgTime: data.avgTime || 0 };
  });
}

// ── Heatmap data (last 90 days) ──
export function buildHeatmapData(dailyActivity) {
  const result = [];
  const now    = new Date();

  for (let i = 89; i >= 0; i--) {
    const d   = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: (dailyActivity || {})[key] || 0 });
  }

  return result;
}

// ── XP to next level ──
export function getXPProgress(xp) {
  const LEVELS = [
    { name: 'Beginner',     threshold: 0   },
    { name: 'Apprentice',   threshold: 100 },
    { name: 'Intermediate', threshold: 300 },
    { name: 'Advanced',     threshold: 600 },
    { name: 'Expert',       threshold: 1200},
    { name: 'Master',       threshold: 2400},
  ];

  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].threshold) {
      const current  = LEVELS[i];
      const next     = LEVELS[i + 1];
      const progress = next
        ? Math.round(((xp - current.threshold) / (next.threshold - current.threshold)) * 100)
        : 100;
      return {
        level:      current.name,
        nextLevel:  next?.name || 'Master',
        nextXP:     next?.threshold || 2400,
        currentXP:  xp,
        progress:   Math.min(progress, 100),
      };
    }
  }

  return { level: 'Beginner', nextLevel: 'Apprentice', nextXP: 100, currentXP: xp, progress: 0 };
}
