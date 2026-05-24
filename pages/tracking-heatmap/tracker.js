/**
 * 行为追踪引擎
 * 记录鼠标移动、点击、滚动、停留区域
 */
class BehaviorTracker {
  constructor(targetEl) {
    this.target = targetEl;
    this.startTime = Date.now();
    this.events = [];           // 所有事件时间线
    this.mousePositions = [];   // 鼠标位置采样 [{x, y, t}]
    this.clicks = [];           // 点击 [{x, y, t, target}]
    this.scrollEvents = [];     // 滚动 [{scrollY, t}]
    this.hoverZones = new Map();// 区域停留时间
    this.maxScrollDepth = 0;
    this.totalMouseDist = 0;
    this.lastMousePos = null;
    this.lastMoveTime = 0;
    this.speeds = [];

    this._bindEvents();
  }

  _bindEvents() {
    // 鼠标移动（节流 50ms）
    let moveThrottle = 0;
    this._onMouseMove = (e) => {
      const now = Date.now();
      if (now - moveThrottle < 50) return;
      moveThrottle = now;

      const rect = this.target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top + this.target.scrollTop;
      const t = now - this.startTime;

      // 计算距离和速度
      if (this.lastMousePos) {
        const dx = x - this.lastMousePos.x;
        const dy = y - this.lastMousePos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.totalMouseDist += dist;

        const dt = now - this.lastMoveTime;
        if (dt > 0) {
          this.speeds.push(dist / dt * 1000); // px/s
        }
      }
      this.lastMousePos = { x, y };
      this.lastMoveTime = now;

      this.mousePositions.push({ x, y, t });

      // 记录悬停区域
      const zone = this._getZone(e.target);
      if (zone) {
        const prev = this.hoverZones.get(zone) || 0;
        this.hoverZones.set(zone, prev + 50);
      }
    };

    // 点击
    this._onClick = (e) => {
      const rect = this.target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top + this.target.scrollTop;
      const t = Date.now() - this.startTime;
      const targetDesc = this._describeTarget(e.target);
      this.clicks.push({ x, y, t, target: targetDesc });
      this.events.push({ type: 'click', t, desc: `点击了「${targetDesc}」` });
    };

    // 滚动
    this._onScroll = () => {
      const t = Date.now() - this.startTime;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const depth = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;
      if (depth > this.maxScrollDepth) {
        this.maxScrollDepth = depth;
      }
      this.scrollEvents.push({ scrollY: scrollTop, depth, t });

      // 限制事件记录频率
      if (this.events.length === 0 || this.events[this.events.length - 1].type !== 'scroll' ||
          t - this.events[this.events.length - 1].t > 2000) {
        this.events.push({ type: 'scroll', t, desc: `滚动到 ${depth}% 深度` });
      }
    };

    // 页面可见性
    this._onVisibility = () => {
      const t = Date.now() - this.startTime;
      if (document.hidden) {
        this.events.push({ type: 'idle', t, desc: '切换到其他标签页（可能在比价）' });
      } else {
        this.events.push({ type: 'idle', t, desc: '回到本页面' });
      }
    };

    this.target.addEventListener('mousemove', this._onMouseMove);
    this.target.addEventListener('click', this._onClick);
    window.addEventListener('scroll', this._onScroll, { passive: true });
    document.addEventListener('visibilitychange', this._onVisibility);

    // 初始事件
    this.events.push({ type: 'hover', t: 0, desc: '进入页面' });
  }

  _getZone(el) {
    // 向上找最近有意义的区域
    let current = el;
    while (current && current !== this.target) {
      if (current.classList.contains('product-price')) return '价格区域';
      if (current.classList.contains('product-title')) return '标题区域';
      if (current.classList.contains('product-actions')) return '按钮区域';
      if (current.classList.contains('review-list')) return '评价区域';
      if (current.classList.contains('feature-grid')) return '卖点区域';
      if (current.classList.contains('spec-table')) return '规格区域';
      if (current.classList.contains('product-specs')) return '选项区域';
      if (current.classList.contains('product-meta')) return '销量区域';
      if (current.classList.contains('img-placeholder')) return '图片区域';
      current = current.parentElement;
    }
    return '其他区域';
  }

  _describeTarget(el) {
    if (el.classList.contains('btn-buy')) return '立即购买';
    if (el.classList.contains('btn-cart')) return '加入购物车';
    if (el.classList.contains('btn-fav')) return '收藏';
    if (el.classList.contains('spec-option')) return `规格选项「${el.textContent.trim()}」`;
    if (el.classList.contains('tab')) return `标签页「${el.textContent.trim()}」`;
    if (el.classList.contains('thumb')) return '商品缩略图';
    if (el.closest('.review-item')) return '用户评价';
    if (el.closest('.feature-item')) return '卖点描述';
    if (el.closest('.product-price')) return '价格';
    return el.textContent.trim().slice(0, 15) || el.tagName.toLowerCase();
  }

  getReport() {
    const duration = (Date.now() - this.startTime) / 1000;
    const avgSpeed = this.speeds.length > 0
      ? Math.round(this.speeds.reduce((a, b) => a + b, 0) / this.speeds.length)
      : 0;

    return {
      duration: Math.round(duration),
      totalMouseDist: Math.round(this.totalMouseDist),
      clicks: this.clicks,
      clickCount: this.clicks.length,
      scrollDepth: this.maxScrollDepth,
      hoverZones: Object.fromEntries(this.hoverZones),
      hoverZoneCount: this.hoverZones.size,
      avgSpeed,
      mousePositions: this.mousePositions,
      events: this.events,
      scrollEvents: this.scrollEvents
    };
  }

  destroy() {
    this.target.removeEventListener('mousemove', this._onMouseMove);
    this.target.removeEventListener('click', this._onClick);
    window.removeEventListener('scroll', this._onScroll);
    document.removeEventListener('visibilitychange', this._onVisibility);
  }
}
