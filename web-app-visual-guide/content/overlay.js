/**
 * VisualGuideOverlay - renders step-by-step overlay on the page
 * Uses Shadow DOM for style isolation
 */
class VisualGuideOverlay {
  constructor() {
    this.currentStep = null;
    this.currentStepNumber = 0;
    this.host = null;
    this.shadow = null;
    this.scrollHandler = null;
    this.resizeObserver = null;
  }

  showSingle(step, stepNumber) {
    this.destroy();
    this.currentStep = step;
    this.currentStepNumber = stepNumber;
    this._createHost();

    const targetEl = this._findElement(step);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => this._renderStep(step, targetEl), 300);
    } else {
      this._renderStep(step, null);
    }

    this._attachListeners();
  }

  showLoading() {
    this._ensureHost();
    this._clearRoot();

    const root = document.createElement('div');
    root.className = 'guide-root';
    root.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none;';

    const panel = document.createElement('div');
    panel.className = 'guide-panel loading-panel';
    panel.style.pointerEvents = 'auto';
    panel.innerHTML = `
      <div class="panel-header">
        <span class="step-badge">ガイド実行中</span>
        <button class="close-btn" title="閉じる">✕</button>
      </div>
      <div class="panel-body loading-body">
        <div class="loading-spinner"></div>
        <p class="loading-text">次の操作を確認中...</p>
      </div>
    `;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    panel.style.cssText = `
      position: absolute;
      top: ${vh / 2 - 70}px;
      left: ${vw / 2 - 140}px;
      width: 280px;
      z-index: 2147483647;
    `;

    panel.querySelector('.close-btn').addEventListener('click', () => this.destroy());
    root.appendChild(panel);
    this.shadow.appendChild(root);
  }

  showCompleted(summary) {
    this._ensureHost();
    this._clearRoot();

    const root = document.createElement('div');
    root.className = 'guide-root';
    root.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none;';

    const panel = document.createElement('div');
    panel.className = 'guide-panel';
    panel.style.pointerEvents = 'auto';
    panel.innerHTML = `
      <div class="panel-header completed-header">
        <span class="step-badge">完了</span>
        <button class="close-btn" title="閉じる">✕</button>
      </div>
      <div class="panel-body">
        <p class="completed-icon">✓</p>
        <p class="panel-description">${this._escape(summary)}</p>
      </div>
      <div class="panel-footer">
        <button class="nav-btn close-guide-btn">閉じる</button>
      </div>
    `;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    panel.style.cssText = `
      position: absolute;
      top: ${vh / 2 - 80}px;
      left: ${vw / 2 - 140}px;
      width: 280px;
      z-index: 2147483647;
    `;

    panel.querySelector('.close-btn').addEventListener('click', () => this.destroy());
    panel.querySelector('.close-guide-btn').addEventListener('click', () => this.destroy());
    root.appendChild(panel);
    this.shadow.appendChild(root);
  }

  showError(message) {
    this._ensureHost();
    this._clearRoot();

    const root = document.createElement('div');
    root.className = 'guide-root';
    root.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none;';

    const panel = document.createElement('div');
    panel.className = 'guide-panel';
    panel.style.pointerEvents = 'auto';
    panel.innerHTML = `
      <div class="panel-header error-header">
        <span class="step-badge">エラー</span>
        <button class="close-btn" title="閉じる">✕</button>
      </div>
      <div class="panel-body">
        <p class="panel-description error-text">${this._escape(message)}</p>
      </div>
      <div class="panel-footer">
        <button class="nav-btn retry-btn">再試行</button>
        <button class="nav-btn close-guide-btn">閉じる</button>
      </div>
    `;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    panel.style.cssText = `
      position: absolute;
      top: ${vh / 2 - 80}px;
      left: ${vw / 2 - 140}px;
      width: 280px;
      z-index: 2147483647;
    `;

    panel.querySelector('.close-btn').addEventListener('click', () => this.destroy());
    panel.querySelector('.close-guide-btn').addEventListener('click', () => this.destroy());
    panel.querySelector('.retry-btn').addEventListener('click', () => {
      if (this.currentStep) {
        window.dispatchEvent(new CustomEvent('guideNextStep', {
          detail: { currentStep: this.currentStep }
        }));
      }
    });
    root.appendChild(panel);
    this.shadow.appendChild(root);
  }

  recalculatePositions() {
    if (this.currentStep) {
      this._renderStep(this.currentStep, this._findElement(this.currentStep));
    }
  }

  destroy() {
    this._detachListeners();
    if (this.host && this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
    this.host = null;
    this.shadow = null;
    this.currentStep = null;
  }

  _ensureHost() {
    if (!this.host) {
      this._createHost();
    }
  }

  _createHost() {
    this.host = document.createElement('div');
    this.host.id = 'visual-guide-host';
    this.host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;';
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = this._getStyles();
    this.shadow.appendChild(style);

    document.documentElement.appendChild(this.host);
  }

  _clearRoot() {
    const existing = this.shadow.querySelector('.guide-root');
    if (existing) existing.remove();
  }

  _renderStep(step, targetEl) {
    this._clearRoot();

    const root = document.createElement('div');
    root.className = 'guide-root';
    root.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none;';

    let rect = null;
    if (targetEl) {
      rect = targetEl.getBoundingClientRect();
    } else if (step.fallback?.approximatePosition) {
      const pos = step.fallback.approximatePosition;
      const top = parseFloat(pos.top) / 100 * window.innerHeight;
      const left = parseFloat(pos.left) / 100 * window.innerWidth;
      rect = { top, left, width: 100, height: 40 };
    }

    const svg = this._createSVG(rect);
    root.appendChild(svg);

    const panel = this._createPanel(step, rect, targetEl);
    root.appendChild(panel);

    this.shadow.appendChild(root);
  }

  _createSVG(rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', vw);
    svg.setAttribute('height', vh);
    svg.style.cssText = 'position: absolute; top: 0; left: 0; pointer-events: none;';

    if (!rect) {
      const dimRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      dimRect.setAttribute('x', 0);
      dimRect.setAttribute('y', 0);
      dimRect.setAttribute('width', vw);
      dimRect.setAttribute('height', vh);
      dimRect.setAttribute('fill', 'rgba(0,0,0,0.5)');
      svg.appendChild(dimRect);
      return svg;
    }

    const pad = 6;
    const rx = rect.left - pad;
    const ry = rect.top - pad;
    const rw = rect.width + pad * 2;
    const rh = rect.height + pad * 2;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const maskEl = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
    maskEl.setAttribute('id', 'spotlight-mask');

    const whiteRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    whiteRect.setAttribute('x', 0);
    whiteRect.setAttribute('y', 0);
    whiteRect.setAttribute('width', vw);
    whiteRect.setAttribute('height', vh);
    whiteRect.setAttribute('fill', 'white');

    const holeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    holeRect.setAttribute('x', rx);
    holeRect.setAttribute('y', ry);
    holeRect.setAttribute('width', rw);
    holeRect.setAttribute('height', rh);
    holeRect.setAttribute('rx', 6);
    holeRect.setAttribute('fill', 'black');

    maskEl.appendChild(whiteRect);
    maskEl.appendChild(holeRect);
    defs.appendChild(maskEl);
    svg.appendChild(defs);

    const dimRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    dimRect.setAttribute('x', 0);
    dimRect.setAttribute('y', 0);
    dimRect.setAttribute('width', vw);
    dimRect.setAttribute('height', vh);
    dimRect.setAttribute('fill', 'rgba(0,0,0,0.5)');
    dimRect.setAttribute('mask', 'url(#spotlight-mask)');
    svg.appendChild(dimRect);

    const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    highlight.setAttribute('x', rx);
    highlight.setAttribute('y', ry);
    highlight.setAttribute('width', rw);
    highlight.setAttribute('height', rh);
    highlight.setAttribute('rx', 6);
    highlight.setAttribute('fill', 'none');
    highlight.setAttribute('stroke', '#FF4444');
    highlight.setAttribute('stroke-width', '3');
    highlight.setAttribute('class', 'pulse-rect');    
    svg.appendChild(highlight);

    const badgeR = 14;
    const bx = rx + badgeR;
    const by = ry - badgeR;
    const badgeClamp_x = Math.max(badgeR, Math.min(bx, vw - badgeR));
    const badgeClamp_y = Math.max(badgeR, by);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', badgeClamp_x);
    circle.setAttribute('cy', badgeClamp_y);
    circle.setAttribute('r', badgeR);
    circle.setAttribute('fill', '#FF4444');
    svg.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', badgeClamp_x);
    text.setAttribute('y', badgeClamp_y + 1);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', 'white');
    text.setAttribute('font-size', '12');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('font-family', 'Arial, sans-serif');
    text.textContent = this.currentStepNumber;
    svg.appendChild(text);

    return svg;
  }

  _createPanel(step, rect, targetEl) {
    const panel = document.createElement('div');
    panel.className = 'guide-panel';
    panel.style.pointerEvents = 'auto';

    const isFallback = !targetEl && step.fallback;

    panel.innerHTML = `
      <div class="panel-header">
        <span class="step-badge">ステップ ${this.currentStepNumber}</span>
        <button class="close-btn" title="閉じる">✕</button>
      </div>
      <div class="panel-body">
        ${isFallback ? '<div class="fallback-notice">⚠ この付近を探してください</div>' : ''}
        <p class="panel-description">${this._escape(step.description)}</p>
      </div>
      <div class="panel-footer">
        <button class="nav-btn next-btn">操作を実行して次へ →</button>
      </div>
    `;

    this._positionPanel(panel, rect);

    panel.querySelector('.close-btn').addEventListener('click', () => this.destroy());
    panel.querySelector('.next-btn').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('guideNextStep', {
        detail: { currentStep: step }
      }));
    });

    return panel;
  }

  _positionPanel(panel, rect) {
    const panelW = 280;
    const panelH = 150;
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top, left;

    if (!rect) {
      top = vh / 2 - panelH / 2;
      left = vw / 2 - panelW / 2;
    } else {
      top = rect.top + rect.height + margin + window.scrollY;
      left = rect.left + rect.width / 2 - panelW / 2;

      if (rect.top + rect.height + margin + panelH > vh) {
        top = rect.top - panelH - margin + window.scrollY;
      }

      left = Math.max(margin, Math.min(left, vw - panelW - margin));
      if (top < 0) {
        top = margin;
      }
    }

    panel.style.cssText = `
      position: absolute;
      top: ${top}px;
      left: ${left}px;
      width: ${panelW}px;
      z-index: 2147483647;
    `;
  }

  // Phase 3: 要素検索フォールバックの強化（3段階）
  _findElement(step) {
    // 1. CSSセレクタで検索
    if (step.selector) {
      try {
        const el = document.querySelector(step.selector);
        if (el && this._isVisible(el)) return el;
      } catch { /* ignore */ }
    }

    // 2. aria-labelで検索
    if (step.fallback?.ariaLabel) {
      try {
        const el = document.querySelector(`[aria-label="${CSS.escape(step.fallback.ariaLabel)}"]`);
        if (el && this._isVisible(el)) return el;
      } catch { /* ignore */ }
    }

    // 3. テキスト内容で検索（完全一致 → 部分一致）
    if (step.fallback?.text) {
      const text = step.fallback.text.toLowerCase();
      const candidates = document.querySelectorAll(
        'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], ' +
        'input, select, textarea, [onclick], [tabindex], .btn, [data-action]'
      );
      let partial = null;
      for (const el of candidates) {
        if (!this._isVisible(el)) continue;
        const elText = el.textContent.trim().toLowerCase();
        if (elText === text) return el;
        if (!partial && elText.includes(text)) partial = el;
      }
      if (partial) return partial;
    }

    return null;
  }

  _isVisible(el) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  _attachListeners() {
    this._detachListeners();

    this.scrollHandler = () => {
      if (this.currentStep) {
        requestAnimationFrame(() => this._renderStep(this.currentStep, this._findElement(this.currentStep)));
      }
    };
    window.addEventListener('scroll', this.scrollHandler, { passive: true });

    this.resizeObserver = new ResizeObserver(() => {
      if (this.currentStep) {
        requestAnimationFrame(() => this._renderStep(this.currentStep, this._findElement(this.currentStep)));
      }
    });
    this.resizeObserver.observe(document.body);
  }

  _detachListeners() {
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _getStyles() {
    return `
      @keyframes pulse-ring {
        0%   { opacity: 1; }
        50%  { opacity: 0.5; }
        100% { opacity: 1; }
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .pulse-rect {
        animation: pulse-ring 1.5s ease-in-out infinite;
      }

      .guide-panel {
        background: #FFFFFF;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.25), 0 1px 6px rgba(0,0,0,0.15);
        font-family: 'Google Sans', Roboto, Arial, sans-serif;
        font-size: 14px;
        color: #202124;
        overflow: hidden;
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #4285F4;
        color: white;
      }

      .completed-header {
        background: #34A853;
      }

      .error-header {
        background: #EA4335;
      }

      .step-badge {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.3px;
      }

      .close-btn {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 14px;
        padding: 0 4px;
        opacity: 0.8;
        line-height: 1;
      }

      .close-btn:hover { opacity: 1; }

      .panel-body {
        padding: 12px 14px;
      }

      .loading-body {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 16px 14px;
      }

      .loading-spinner {
        width: 20px;
        height: 20px;
        border: 3px solid #DADCE0;
        border-top-color: #4285F4;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        flex-shrink: 0;
      }

      .loading-text {
        margin: 0;
        color: #5F6368;
        font-size: 13px;
      }

      .fallback-notice {
        font-size: 11px;
        color: #E65100;
        background: #FFF3E0;
        padding: 4px 8px;
        border-radius: 4px;
        margin-bottom: 8px;
      }

      .panel-description {
        margin: 0;
        line-height: 1.5;
        color: #202124;
      }

      .error-text {
        color: #EA4335;
      }

      .completed-icon {
        margin: 0 0 8px;
        font-size: 24px;
        color: #34A853;
        text-align: center;
      }

      .panel-footer {
        display: flex;
        gap: 8px;
        padding: 8px 14px 12px;
      }

      .nav-btn {
        flex: 1;
        padding: 7px 12px;
        border: 1px solid #DADCE0;
        border-radius: 6px;
        background: #F8F9FA;
        color: #4285F4;
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.15s;
      }

      .nav-btn:hover:not(:disabled) {
        background: #E8F0FE;
        border-color: #4285F4;
      }

      .next-btn {
        background: #4285F4;
        color: white;
        border-color: #4285F4;
      }

      .next-btn:hover {
        background: #3367D6;
        border-color: #3367D6;
      }

      .retry-btn {
        background: #EA4335;
        color: white;
        border-color: #EA4335;
      }

      .retry-btn:hover {
        background: #C5221F;
        border-color: #C5221F;
      }

      .close-guide-btn {
        color: #5F6368;
      }
    `;
  }
}
