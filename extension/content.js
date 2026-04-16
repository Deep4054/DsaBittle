// content.js — DSA Dopamine Engine
// Injected into every LeetCode problem page

(function () {
  'use strict';

  console.log('[DSA Engine] content.js injected on:', window.location.href);

  let startTime = Date.now();
  let problemData = null;
  let timerInterval = null;
  let panelInitialized = false;

  // ── STEP 1: Extract problem data from LeetCode DOM ──
  // LeetCode changes class names frequently — we try many selectors + URL fallback
  function extractProblemData() {
    // ── Title: 8 selector cascade + URL fallback ──
    const titleEl =
      document.querySelector('[data-cy="question-title"]') ||
      document.querySelector('.mr-2.text-label-1') ||
      document.querySelector('a[href*="/problems/"] .text-title-large') ||
      document.querySelector('.text-title-large') ||
      document.querySelector('h4.text-label-1') ||
      document.querySelector('[class*="title"][class*="question"]') ||
      document.querySelector('div[class*="titleBar"] a') ||
      document.querySelector('h1') ||
      document.querySelector('[class*="questionTitle"]');

    // ── Difficulty ──
    const difficultyEl =
      document.querySelector('[diff]') ||
      document.querySelector('.text-difficulty-easy') ||
      document.querySelector('.text-difficulty-medium') ||
      document.querySelector('.text-difficulty-hard') ||
      document.querySelector('[class*="difficulty"]') ||
      document.querySelector('.mt-3 .text-olive') ||
      document.querySelector('[class*="Difficulty"]');

    // ── Tags ──
    const tagsEl = document.querySelectorAll(
      '.topic-tag__1jni, a[href*="/tag/"], [class*="tag"] a, [class*="Tag"] a'
    );

    // ── Description ──
    const descriptionEl =
      document.querySelector('[data-track-load="description_content"]') ||
      document.querySelector('.elfjS') ||
      document.querySelector('.question-content__JfgR') ||
      document.querySelector('[class*="description_content"]') ||
      document.querySelector('[class*="questionContent"]') ||
      document.querySelector('[class*="Description"]');

    // Always get title — worst case use slug from URL
    const titleFromDOM = titleEl?.innerText?.trim();
    const titleFromURL = extractTitleFromURL();
    const title = (titleFromDOM && titleFromDOM.length > 1) ? titleFromDOM : titleFromURL;

    const difficulty = extractDifficulty(difficultyEl);
    const tags = Array.from(tagsEl)
      .map((el) => el.innerText?.trim())
      .filter(Boolean)
      .filter((t) => t.length < 40);
    const description = descriptionEl?.innerText?.slice(0, 800) || '';
    const url = window.location.href;
    const slug = url.split('/problems/')[1]?.split('/')[0] || '';

    console.log('[DSA Engine] Extracted:', { title, difficulty, tags: tags.slice(0,3), source: titleFromDOM ? 'DOM' : 'URL' });
    return { title, difficulty, tags, description, url, slug, startTime };
  }

  function extractTitleFromURL() {
    const slug =
      window.location.href.split('/problems/')[1]?.split('/')[0] || 'Unknown';
    return slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function extractDifficulty(el) {
    if (!el) return 'Unknown';
    const text = el.innerText?.trim() || el.className;
    if (text.toLowerCase().includes('easy')) return 'Easy';
    if (text.toLowerCase().includes('medium')) return 'Medium';
    if (text.toLowerCase().includes('hard')) return 'Hard';
    return el.innerText?.trim() || 'Unknown';
  }

  // ── STEP 2: Create the floating side panel ──
  function createPanel() {
    const existing = document.getElementById('dsa-dopamine-panel');
    if (existing) existing.remove();
    if (timerInterval) clearInterval(timerInterval);

    const panel = document.createElement('div');
    panel.id = 'dsa-dopamine-panel';
    panel.innerHTML = `
      <div class="ddp-header">
        <div class="ddp-header-left">
          <div class="ddp-logo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
              <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
            </svg>
          </div>
          <span class="ddp-title">DSA Engine</span>
        </div>
        <div class="ddp-header-right">
          <div class="ddp-timer" id="ddp-timer">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            --:--
          </div>
          <button class="ddp-close" id="ddp-close-btn" title="Minimize panel">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
        </div>
      </div>
      <div class="ddp-body" id="ddp-body">
        <div class="ddp-loading">
          <div class="ddp-spinner"></div>
          <p>Analyzing with AI...</p>
          <small>Powered by NVIDIA NIM</small>
        </div>
      </div>
      <div class="ddp-footer" id="ddp-footer" style="display:none">
        <button class="ddp-btn ddp-btn-timer" id="ddp-timer-btn" title="Start timer when you begin solving">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Timer
        </button>
        <button class="ddp-btn ddp-btn-secondary" id="ddp-explain-more">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          Deep Dive
        </button>
        <button class="ddp-btn ddp-btn-success" id="ddp-mark-solved">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Solved
        </button>
      </div>
    `;

    document.body.appendChild(panel);
    addToggleButton(panel);
    makeDraggable(panel);

    document.getElementById('ddp-close-btn').addEventListener('click', () => {
      const panel = document.getElementById('dsa-dopamine-panel');
      const btn = document.getElementById('ddp-close-btn');
      const isMin = panel.classList.toggle('ddp-minimized');
      btn.querySelector('svg polyline').setAttribute('points', isMin ? '6 9 12 15 18 9' : '18 15 12 9 6 15');
    });

    // Timer — manual start/stop, NOT auto-start
    let timerRunning = false;
    document.getElementById('ddp-timer-btn').addEventListener('click', () => {
      const btn = document.getElementById('ddp-timer-btn');
      if (!timerRunning) {
        timerRunning = true;
        startTimer();
        btn.classList.add('running');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause`;
      } else {
        timerRunning = false;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        btn.classList.remove('running');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Timer`;
      }
    });

    panelInitialized = true;
  }

  function addToggleButton(panel) {
    const existing = document.getElementById('ddp-toggle-btn');
    if (existing) existing.remove();
    const toggle = document.createElement('button');
    toggle.id = 'ddp-toggle-btn';
    toggle.title = 'DSA Dopamine Engine';
    toggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>`;
    toggle.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    });
    document.body.appendChild(toggle);
  }

  // ── Drag support ──
  function makeDraggable(panel) {
    const handle = panel.querySelector('.ddp-header');
    if (!handle) return;
    let dragging = false, ox = 0, oy = 0;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.ddp-close')) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;
      panel.style.right = 'auto';
      panel.style.left  = rect.left + 'px';
      panel.style.top   = rect.top  + 'px';
      panel.classList.add('ddp-dragging');
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const x = Math.max(0, Math.min(window.innerWidth  - panel.offsetWidth,  e.clientX - ox));
      const y = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, e.clientY - oy));
      panel.style.left = x + 'px';
      panel.style.top  = y + 'px';
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
      panel.classList.remove('ddp-dragging');
    });
  }

  // ── Timer (called only when user clicks Timer button) ──
  function startTimer() {
    startTime = Date.now();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      // Stop timer if extension context is gone
      if (!chrome.runtime?.id) { clearInterval(timerInterval); timerInterval = null; return; }
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      const timerEl = document.getElementById('ddp-timer');
      if (timerEl) {
        timerEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${mins}:${secs}`;
        timerEl.classList.add('ddp-timer-running');
      }
    }, 1000);
  }

  // ── STEP 4: Request AI Insights ──
  function requestAIInsights(data) {
    if (!chrome.runtime?.id) { renderError('Extension was reloaded — please refresh the page.'); return; }
    chrome.runtime.sendMessage(
      { type: 'ANALYZE_PROBLEM', payload: data },
      (response) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || '';
          if (msg.includes('context invalidated') || msg.includes('receiving end does not exist')) {
            renderError('Extension was reloaded — please refresh the page.');
          } else {
            renderError('Extension error: ' + msg);
          }
          return;
        }
        if (response?.success) {
          renderInsights(response.data, data);
          if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({
              type: 'PROBLEM_OPENED',
              payload: { ...data, timestamp: startTime },
            });
          }
        } else {
          renderError(response?.error || 'Could not load AI insights.');
        }
      }
    );
  }

  // ── STEP 5: Render AI insights ──
  function renderInsights(insights, data) {
    const body   = document.getElementById('ddp-body');
    const footer = document.getElementById('ddp-footer');
    if (!body) return;

    const diffClass = (insights.difficulty || data.difficulty || 'unknown').toLowerCase();

    const whySolve   = insights.whySolveThis || insights.whyMatters || '';
    const realWorld  = insights.realWorldConnection || '';
    const whereUsed  = insights.whereUsed || insights.useCases || [];
    const whyAsk     = insights.whyCompaniesAsk || '';
    const companies  = insights.companies || [];
    const analogy    = insights.analogy || '';

    body.innerHTML = `
      <div class="ddp-problem-meta">
        <span class="ddp-diff-badge ddp-diff-${diffClass}">${insights.difficulty || data.difficulty || 'Unknown'}</span>
        <span class="ddp-pattern-badge">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          ${insights.pattern || 'General'}
        </span>
      </div>

      ${realWorld ? `
      <div class="ddp-section ddp-realworld-box">
        <div class="ddp-section-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          Real-World Connection
        </div>
        <p class="ddp-realworld-text">${realWorld}</p>
      </div>` : ''}

      <div class="ddp-section">
        <div class="ddp-section-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Why Solve This?
        </div>
        <div class="ddp-why-box"><p class="ddp-text">${whySolve}</p></div>
      </div>

      <div class="ddp-section">
        <div class="ddp-section-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          Used In Production
        </div>
        <ul class="ddp-list">${whereUsed.map(u => `<li>${u}</li>`).join('')}</ul>
      </div>

      ${whyAsk ? `
      <div class="ddp-section">
        <div class="ddp-section-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Why Companies Ask This
        </div>
        <p class="ddp-text">${whyAsk}</p>
      </div>` : ''}

      <div class="ddp-section">
        <div class="ddp-section-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          Companies That Ask
        </div>
        <div class="ddp-chips">${companies.map(c => `<span class="ddp-chip">${c}</span>`).join('')}</div>
      </div>

      ${analogy ? `
      <div class="ddp-section ddp-analogy-box">
        <div class="ddp-section-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          Mental Model
        </div>
        <p class="ddp-analogy-text">${analogy}</p>
      </div>` : ''}
    `;

    if (footer) footer.style.display = 'flex';
    document.getElementById('ddp-explain-more')?.addEventListener('click', () => {
      requestDeeperExplanation(data, insights.pattern);
    });
    document.getElementById('ddp-mark-solved')?.addEventListener('click', () => {
      markSolved(data, insights);
    });
  }

  // ── STEP 6: Deeper explanation ──
  function requestDeeperExplanation(data, pattern) {
    const body = document.getElementById('ddp-body');
    if (body) {
      // Remove existing deep dive if any
      document.getElementById('ddp-deeper')?.remove();
      const deeperDiv = document.createElement('div');
      deeperDiv.id = 'ddp-deeper';
      deeperDiv.innerHTML = `
        <div class="ddp-deeper-loading">
          <div class="ddp-spinner ddp-spinner-sm"></div>
          <span>Loading deeper analysis...</span>
        </div>
      `;
      body.appendChild(deeperDiv);
    }

    chrome.runtime.sendMessage(
      { type: 'DEEPER_EXPLANATION', payload: { title: data.title, pattern } },
      (response) => {
        if (chrome.runtime.lastError) {
          const deeperEl = document.getElementById('ddp-deeper');
          if (deeperEl) deeperEl.innerHTML = `<div class="ddp-error-box"><p>Extension reloaded — refresh page to retry.</p></div>`;
          return;
        }
        const deeperEl = document.getElementById('ddp-deeper');
        if (!deeperEl) return;
        if (response?.success) {
          const d = response.data;
          deeperEl.innerHTML = `
            <div class="ddp-deep-title">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Deep Dive
            </div>

            <div class="ddp-complexity-row">
              <div class="ddp-complexity-card">
                <div class="label">⏱ Time</div>
                <div class="value">${d.timeComplexity || 'N/A'}</div>
              </div>
              <div class="ddp-complexity-card">
                <div class="label">💾 Space</div>
                <div class="value">${d.spaceComplexity || 'N/A'}</div>
              </div>
            </div>

            <div class="ddp-deep-section">
              <div class="ddp-section-title">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                System Design Link
              </div>
              <p class="ddp-text">${d.systemDesignConnection || ''}</p>
            </div>

            <div class="ddp-deep-section">
              <div class="ddp-section-title">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                Edge Cases
              </div>
              <ul class="ddp-list">${(d.edgeCases || []).map(e => `<li>${e}</li>`).join('')}</ul>
            </div>

            <div class="ddp-deep-section">
              <div class="ddp-section-title">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                Follow-Up Problems
              </div>
              <div class="ddp-chips">${(d.followUpProblems || []).map(p => `<span class="ddp-chip ddp-chip-blue">${p}</span>`).join('')}</div>
            </div>

            <div class="ddp-deep-section">
              <div class="ddp-section-title">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42"/></svg>
                Mental Model
              </div>
              <div class="ddp-mental-box">
                <p class="ddp-mental-text">${d.mentalModel || ''}</p>
              </div>
            </div>
          `;
        } else {
          deeperEl.innerHTML = `<div class="ddp-error-box"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>Deep analysis unavailable</p></div>`;
        }
      }
    );
  }

  function markSolved(data, insights) {
    if (!chrome.runtime?.id) { showToast('Extension reloaded — refresh the page first.'); return; }
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    const btn = document.getElementById('ddp-mark-solved');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<div class="ddp-spinner ddp-spinner-sm"></div> Saving...`;
    }

    chrome.runtime.sendMessage(
      {
        type: 'PROBLEM_SOLVED',
        payload: {
          ...data,
          pattern: insights?.pattern || '',
          timeSpent,
          solvedAt: Date.now(),
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          showToast('Extension reloaded — refresh the page.');
          return;
        }
        if (btn) {
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg> Solved!`;
          btn.classList.add('ddp-btn-done');
        }
        showToast(response?.dopamine || 'Problem solved — great work!');
      }
    );
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'ddp-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('ddp-toast-show'), 100);
    setTimeout(() => {
      toast.classList.remove('ddp-toast-show');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  function renderError(message) {
    const body = document.getElementById('ddp-body');
    if (body) {
      body.innerHTML = `
        <div class="ddp-error-box">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p>${message}</p>
          <small>Backend: Railway may be cold-starting — retry in ~10 seconds</small>
        </div>
      `;
    }
  }

  // ── INIT ──
  function init() {
    console.log('[DSA Engine] init() called');

    // ── Strategy 1: DOM polling for title element (LeetCode loads async)
    let attempts = 0;
    const maxAttempts = 30; // 15 seconds total

    const tryInit = () => {
      if (panelInitialized) return;

      const titleEl =
        document.querySelector('[data-cy="question-title"]') ||
        document.querySelector('.mr-2.text-label-1') ||
        document.querySelector('.text-title-large') ||
        document.querySelector('[class*="titleBar"] a') ||
        document.querySelector('h1') ||
        document.querySelector('[class*="questionTitle"]');

      console.log(`[DSA Engine] attempt ${attempts+1}/${maxAttempts} — title found: ${!!titleEl}`);

      if (titleEl) {
        problemData = extractProblemData();
        createPanel();
        requestAIInsights(problemData);
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(tryInit, 500);
      } else {
        // ── Strategy 2: Fallback — use URL slug as title, show panel anyway
        console.log('[DSA Engine] DOM title not found — falling back to URL slug');
        problemData = extractProblemData(); // title will come from URL
        createPanel();
        requestAIInsights(problemData);
      }
    };

    // ── Strategy 3: MutationObserver for SPA navigation changes
    const observer = new MutationObserver(() => {
      if (!panelInitialized) tryInit();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 20000);

    // Start polling after 800ms (LeetCode needs a moment to hydrate React)
    setTimeout(tryInit, 800);
  }

  init();
})();
