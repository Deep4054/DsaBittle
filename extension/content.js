// content.js — DSA Engine · Card-based toggleable UI · Dark/Light mode
// Injected into LeetCode + HackerRank problem pages

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

  // ── SVG icons ──
  const SVG = {
    brain:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>`,
    clock:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    chevron: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
    sun:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
    moon:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
    check:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    pause:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
    plus:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
    pulse:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    globe:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    bag:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    users:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`,
    warn:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    star:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    home:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    screen:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    link:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  };

  let isDark = false;

  // ── Card builder — toggleable sections ──
  function buildCard({ icon, iconClass, label, preview, content, open = false }) {
    const id = 'ddpc-' + Math.random().toString(36).slice(2, 8);
    return `
      <div class="ddp-card${open ? ' open' : ''}" id="${id}">
        <div class="ddp-card-header" onclick="(function(el){el.classList.toggle('open')})(document.getElementById('${id}'))">
          <div class="ddp-card-header-left">
            <div class="ddp-card-icon ${iconClass}">${icon}</div>
            <span class="ddp-card-label">${label}</span>
          </div>
          <span class="ddp-card-chevron">${SVG.chevron}</span>
        </div>
        ${preview ? `<div class="ddp-card-preview">${preview}</div>` : ''}
        <div class="ddp-card-body">${content}</div>
      </div>`;
  }

  // ── STEP 2: Create the floating side panel ──
  function createPanel() {
    document.getElementById('dsa-dopamine-panel')?.remove();
    document.getElementById('ddp-toggle-btn')?.remove();
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

    // Load saved theme
    try {
      if (chrome.runtime?.id) {
        chrome.storage.local.get(['ddpDark'], d => { isDark = !!d.ddpDark; applyTheme(); });
      }
    } catch(e) {}

    const panel = document.createElement('div');
    panel.id = 'dsa-dopamine-panel';
    panel.innerHTML = `
      <div class="ddp-header">
        <div class="ddp-header-left">
          <div class="ddp-logo">${SVG.brain}</div>
          <span class="ddp-title">DSA Engine</span>
        </div>
        <div class="ddp-header-right">
          <div class="ddp-timer" id="ddp-timer">${SVG.clock} --:--</div>
          <button class="ddp-theme-btn" id="ddp-theme-btn" title="Toggle theme">${SVG.moon}</button>
          <button class="ddp-close" id="ddp-close-btn" title="Minimize">${SVG.chevron}</button>
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
        <button class="ddp-btn ddp-btn-timer" id="ddp-timer-btn">${SVG.clock} Timer</button>
        <button class="ddp-btn ddp-btn-secondary" id="ddp-explain-more">${SVG.plus} Deep Dive</button>
        <button class="ddp-btn ddp-btn-success" id="ddp-mark-solved">${SVG.check} Solved</button>
      </div>
    `;

    document.body.appendChild(panel);
    applyTheme();
    addToggleButton(panel);
    makeDraggable(panel);

    // Minimize
    document.getElementById('ddp-close-btn').addEventListener('click', () => {
      const p = document.getElementById('dsa-dopamine-panel');
      const b = document.getElementById('ddp-close-btn');
      const isMin = p.classList.toggle('ddp-minimized');
      b.innerHTML = isMin
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
        : SVG.chevron;
    });

    // Theme toggle
    document.getElementById('ddp-theme-btn').addEventListener('click', () => {
      isDark = !isDark;
      applyTheme();
      try { chrome.storage.local.set({ ddpDark: isDark }); } catch(e) {}
    });

    // Timer
    let timerRunning = false;
    document.getElementById('ddp-timer-btn').addEventListener('click', () => {
      const btn = document.getElementById('ddp-timer-btn');
      if (!timerRunning) {
        timerRunning = true; startTimer();
        btn.classList.add('running');
        btn.innerHTML = `${SVG.pause} Pause`;
      } else {
        timerRunning = false;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        btn.classList.remove('running');
        btn.innerHTML = `${SVG.clock} Timer`;
      }
    });

    panelInitialized = true;
  }

  function applyTheme() {
    const panel = document.getElementById('dsa-dopamine-panel');
    if (!panel) return;
    if (isDark) {
      panel.classList.add('ddp-dark');
      const btn = document.getElementById('ddp-theme-btn');
      if (btn) btn.innerHTML = SVG.sun;
    } else {
      panel.classList.remove('ddp-dark');
      const btn = document.getElementById('ddp-theme-btn');
      if (btn) btn.innerHTML = SVG.moon;
    }
  }

  function addToggleButton(panel) {
    document.getElementById('ddp-toggle-btn')?.remove();
    const toggle = document.createElement('button');
    toggle.id = 'ddp-toggle-btn';
    toggle.title = 'DSA Engine';
    toggle.innerHTML = SVG.brain;
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
      if (e.target.closest('.ddp-close') || e.target.closest('.ddp-theme-btn') || e.target.closest('.ddp-timer')) return;
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
        timerEl.innerHTML = `${SVG.clock}${mins}:${secs}`;
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

  // ── STEP 5: Render AI insights as toggleable cards ──
  function renderInsights(insights, data) {
    const body   = document.getElementById('ddp-body');
    const footer = document.getElementById('ddp-footer');
    if (!body) return;

    const diffClass    = (insights.difficulty || data.difficulty || 'unknown').toLowerCase();
    const whySolve     = insights.whySolveThis || insights.whyMatters || insights.whyThisProblemMatters || '';
    const realWorld    = insights.realWorldConnection || insights.problemSolves || '';
    const casualCases  = insights.casualUseCases || [];
    const productsNeed = insights.productsNeedThis || [];
    const whereUsed    = insights.whereUsed || insights.useCases || [];
    const costWrong    = insights.costOfGettingWrong || '';
    const skillGain    = insights.skillYouGain || '';
    const prodReality  = insights.productionReality || '';
    const whyAsk       = insights.whyCompaniesAsk || '';
    const companies    = insights.companies || [];
    const analogy      = insights.analogy || '';

    const productItems = productsNeed.map(p =>
      typeof p === 'object' && p.product
        ? `<li><strong>${p.product}:</strong> ${p.whyTheNeed}</li>`
        : `<li>${p}</li>`
    ).join('') || whereUsed.map(u => `<li>${u}</li>`).join('');

    let html = '<div class="ddp-problem-meta"><span class="ddp-diff-badge ddp-diff-' + diffClass + '">' + (insights.difficulty || data.difficulty || 'Unknown') + '</span><span class="ddp-pattern-badge">' + SVG.pulse + ' ' + (insights.pattern || 'General') + '</span></div>';

    if (realWorld)        html += buildCard({ icon: SVG.globe,  iconClass: 'ddp-icon-blue',   label: 'What This Actually Solves',  preview: realWorld.slice(0,62)+'...', content: '<p>'+realWorld+'</p>', open: true });
    if (productItems)     html += buildCard({ icon: SVG.bag,    iconClass: 'ddp-icon-indigo',  label: 'Products That Need This',    preview: 'Google � Meta � Uber � ...', content: '<ul class="ddp-list">'+productItems+'</ul>' });
    if (casualCases.length) html += buildCard({ icon: SVG.users, iconClass: 'ddp-icon-green', label: 'In Your Daily Life',         preview: (casualCases[0]||'').slice(0,58)+'...', content: '<div class="ddp-casual-list">'+casualCases.map(function(c){return '<div class="ddp-casual-item">'+c+'</div>';}).join('')+'</div>' });
    if (costWrong)        html += buildCard({ icon: SVG.warn,   iconClass: 'ddp-icon-red',    label: 'Cost of Getting It Wrong',   preview: costWrong.slice(0,58)+'...', content: '<div class="ddp-warn-box"><p>'+costWrong+'</p></div>' });
    if (whySolve)         html += buildCard({ icon: SVG.info,   iconClass: 'ddp-icon-blue',   label: 'Why This Matters',           preview: whySolve.slice(0,58)+'...', content: '<p>'+whySolve+'</p>' });
    if (skillGain)        html += buildCard({ icon: SVG.star,   iconClass: 'ddp-icon-amber',  label: 'Skill You Gain',             preview: skillGain.slice(0,58)+'...', content: '<p>'+skillGain+'</p>' });
    if (whyAsk)           html += buildCard({ icon: SVG.home,   iconClass: 'ddp-icon-indigo', label: 'Why Companies Ask This',     preview: whyAsk.slice(0,58)+'...', content: '<p>'+whyAsk+'</p>' });
    if (companies.length) html += buildCard({ icon: SVG.bag,    iconClass: 'ddp-icon-green',  label: 'Companies That Ask',         preview: companies.slice(0,4).join(' � '), content: '<div class="ddp-chips">'+companies.map(function(c){return '<span class="ddp-chip">'+c+'</span>';}).join('')+'</div>' });
    if (prodReality||analogy) html += buildCard({ icon: SVG.screen, iconClass: 'ddp-icon-purple', label: prodReality ? 'Production Reality' : 'Analogy', preview: (prodReality||analogy).slice(0,58)+'...', content: '<div class="ddp-quote-box"><p>'+(prodReality||analogy)+'</p></div>' });

    body.innerHTML = html;
    if (footer) footer.style.display = 'flex';
    document.getElementById('ddp-explain-more')?.addEventListener('click', () => {
      requestDeeperExplanation(data, insights.pattern);
    });
    document.getElementById('ddp-mark-solved')?.addEventListener('click', () => {
      markSolved(data, insights);
    });
  }

  // ── STEP 6: Deeper explanation — rendered as a card ──
  function requestDeeperExplanation(data, pattern) {
    document.getElementById('ddp-deeper')?.remove();
    const body = document.getElementById('ddp-body');
    if (!body) return;

    const loadCard = document.createElement('div');
    loadCard.id = 'ddp-deeper';
    loadCard.className = 'ddp-card open';
    loadCard.innerHTML = `
      <div class="ddp-card-header" style="cursor:default">
        <div class="ddp-card-header-left">
          <div class="ddp-card-icon ddp-icon-indigo">${SVG.plus}</div>
          <span class="ddp-card-label">Deep Dive</span>
        </div>
      </div>
      <div class="ddp-card-body" style="display:block">
        <div class="ddp-loading" style="padding:16px 0">
          <div class="ddp-spinner"></div><p>Loading analysis...</p>
        </div>
      </div>`;
    body.appendChild(loadCard);
    loadCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    if (!chrome.runtime?.id) {
      const deeperEl = document.getElementById('ddp-deeper');
      if (deeperEl) deeperEl.innerHTML = `<div class="ddp-error-box"><p>Extension reloaded — refresh page to retry.</p></div>`;
      return;
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
        const cardBody = deeperEl.querySelector('.ddp-card-body');
        if (!cardBody) return;
        if (response?.success) {
          const d = response.data;
          cardBody.innerHTML = `
            <div class="ddp-complexity-row">
              <div class="ddp-complexity-card"><div class="label">⏱ Time</div><div class="value">${d.timeComplexity || 'N/A'}</div></div>
              <div class="ddp-complexity-card"><div class="label">💾 Space</div><div class="value">${d.spaceComplexity || 'N/A'}</div></div>
            </div>
            ${d.systemDesignConnection ? `<div class="ddp-deep-section"><div class="ddp-section-title">${SVG.screen} System Design</div><p class="ddp-text">${d.systemDesignConnection}</p></div>` : ''}
            ${(d.edgeCases||[]).length ? `<div class="ddp-deep-section"><div class="ddp-section-title">${SVG.warn} Edge Cases</div><ul class="ddp-list">${d.edgeCases.map(e=>`<li>${e}</li>`).join('')}</ul></div>` : ''}
            ${(d.followUpProblems||[]).length ? `<div class="ddp-deep-section"><div class="ddp-section-title">${SVG.link} Follow-Ups</div><div class="ddp-chips">${d.followUpProblems.map(p=>`<span class="ddp-chip ddp-chip-blue">${p}</span>`).join('')}</div></div>` : ''}
            ${d.mentalModel ? `<div class="ddp-deep-section"><div class="ddp-section-title">${SVG.brain} Mental Model</div><div class="ddp-mental-box"><p>${d.mentalModel}</p></div></div>` : ''}
          `;
        } else {
          cardBody.innerHTML = `<div class="ddp-error-box">${SVG.info}<p>Deep analysis unavailable</p></div>`;
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
          btn.innerHTML = `${SVG.check} Solved!`;
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
