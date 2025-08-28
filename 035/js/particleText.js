;(function (window) {
  'use strict';

  window.requestAnimationFrame = window.requestAnimationFrame
    || window.mozRequestAnimationFrame
    || window.webkitRequestAnimationFrame
    || window.msRequestAnimationFrame;

  const RADIUS = Math.PI * 2;
  // 粒子改少一些（更通透）
  const PARTICLE_NUM = 4200;   // 原 9000 -> 4200（性能允许可 4500~5200）
  let CANVASWIDTH = 500;
  let CANVASHEIGHT = 150;
  const CANVASID = 'text';       // 改：使用独立文字画布 #text

  // 新增：像素点绘制控制（缺失导致 ReferenceError）
  const USE_SQUARE_DOTS = true;  // 方块点更清晰；若想要圆点设为 false
  const DOT_PX = 2;              // 方块边长（逻辑像素 1~2 建议）

  // 新增：字间距（随字号缩放）
  const LETTER_SPACING_EM = 0.10;  // 间距 = 字号 * 0.10，可调 0.06~0.14
  let letterSpacingPx = 0;         // 运行时像素值

  // 新增：中文优先的字体栈（Windows 优先使用微软雅黑）
  const FONT_FAMILY = '"Microsoft YaHei","Noto Sans SC","Source Han Sans SC","PingFang SC","HarmonyOS Sans SC","Helvetica Neue",Arial,sans-serif';
  const FONT_WEIGHT = 600;     // 原 700 -> 600，避免笔画过厚

  // 左侧加大内边距，避免最左笔画被裁
  const PADDING_LEFT = 120;      // 加大左内边距，防止靠左截断
  const PADDING_RIGHT = 40;
  const PADDING_TOP = 0;
  const PADDING_BOTTOM = 0;

  const LEFT_EDGE_PERCENT = 0.06; // 与 #text CSS 保持接近（只是兜底）
  const TOP_OFFSET_PERCENT = 0.15;

  const SAMPLE_STEP = 1;
  // 采样稀释参数
  const DOT_SPACING = 6;
  const JITTER = 0;
  const FILL_RATIO = 0.75;     // 使用多少比例的可用点(0.6~0.9)
  let   CUR_TIME = 0;
  // 删除旧的状态机计时变量，改为全局起始时间
  // let lastActiveCount = -1;
  // let lineStartTime = 0;
  let SCHEDULE_START = 0;   // 新增：时间轴起点（init 时设定）

  // 文案（保持原顺序）
  let texts = [
    '抱歉','被拒绝的我','无法抗拒自己的内心','ARE YOU','LOOKING AT THE',
    'SAME STAR','WITH ME ?','HAPPY','CHINESE','VALENTINE\'S','DAY','I MISS YOU'
  ];

  let activeCount = 1;
  let reveal = 0;
  // const REVEAL_SPEED = 0.02;
  // const MAX_LINE_MS = 1700;      // 不再使用
  // 时间驱动参数（毫秒）
  const REVEAL_MS = 900;          // 每行从左到右显露用时
  const HOLD_MS   = 200;          // 显露完成后停留时间
  const DURATION_MS = REVEAL_MS + HOLD_MS;  // 新增：一行总时长
  let lineHeight = 48;
  let textSize = 40;
  const LINE_GAP = 8;

  // 离屏画布：开启 willReadFrequently 减少读回退化
  const offCanvas = document.createElement('canvas');
  const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

  let canvas, ctx;
  let particles = [];
  let quiver = false;                        // 关闭抖动，避免糊边
  let DPR = 1;                               // 新增：记录设备像素比

  // 预采样的每行点阵数据
  let lineDots = [];  // [{x0, width, points: [[x,y], ...]}, ...]

  // 预采样：为每一行生成均匀网格点（一次性，resize 后重建）
  function buildLineDots() {
    lineDots = [];

    offCtx.clearRect(0, 0, CANVASWIDTH, CANVASHEIGHT);
    offCtx.fillStyle = '#fff';
    offCtx.textBaseline = 'middle';
    offCtx.textAlign = 'left';
    offCtx.font = FONT_WEIGHT + ' ' + textSize + 'px ' + FONT_FAMILY;

    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d', { willReadFrequently: true });

    let yCenter = PADDING_TOP + lineHeight * 0.5;

    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      const pad = 4;
      const h = Math.ceil(lineHeight * 1.4);

      // 逐字测宽 + 叠加字间距，得到“加间距后”的总宽
      tctx.font = offCtx.font;
      const chars = Array.from(t);
      const widths = chars.map(ch => tctx.measureText(ch).width);
      const totalGlyphW = widths.reduce((a, b) => a + b, 0);
      const wSpaced = Math.round(totalGlyphW + Math.max(0, chars.length - 1) * letterSpacingPx);

      tmp.width = wSpaced + pad * 2;
      tmp.height = h;

      tctx.clearRect(0, 0, tmp.width, tmp.height);
      tctx.fillStyle = '#fff';
      tctx.textBaseline = 'middle';
      tctx.textAlign = 'left';
      tctx.font = offCtx.font;

      // 逐字绘制，加入字间距
      let cx = pad;
      for (let k = 0; k < chars.length; k++) {
        tctx.fillText(chars[k], cx, h / 2);
        cx += widths[k] + letterSpacingPx;
      }

      // 采样像素点 → 全局坐标（保持整数像素对齐）
      const img = tctx.getImageData(0, 0, tmp.width, tmp.height).data;
      const points = [];
      for (let yy = 0; yy < h; yy += DOT_SPACING) {
        for (let xx = 0; xx < tmp.width; xx += DOT_SPACING) {
          const idx = (xx + yy * tmp.width) << 2;
          if (img[idx] > 8) {
            const X = Math.round(PADDING_LEFT + (xx - pad));
            const Y = Math.round((yCenter - h / 2) + yy);
            points.push([X, Y]);
          }
        }
      }

      // 等距抽样，保证分布均匀
      const keep = Math.max(1, Math.floor(points.length * FILL_RATIO));
      const slim = sampleEven(points, keep);

      lineDots.push({ x0: PADDING_LEFT, width: wSpaced, points: slim });
      yCenter += lineHeight + LINE_GAP;
    }
  }

  // 依据“应显示的行数 + 当前行进度”汇总目标点
  function getVisibleTargets(activeCount, progress) {
    const out = [];
    if (!lineDots.length) return out;

    // 已完成的行：整行取点
    for (let i = 0; i < activeCount - 1 && i < lineDots.length; i++) {
      out.push(...lineDots[i].points);
    }
    // 当前显露的行：按 x 截断
    const cur = lineDots[activeCount - 1];   // 修复：原来是 “st cur”，应为 “const cur”
    if (cur) {
      const cutX = cur.x0 + cur.width * progress;
      for (const p of cur.points) {
        if (p[0] <= cutX) out.push(p);
      }
    }
    return out;
  }

  // 用“均匀抽样”把目标点分配给粒子（防止上方行独占）
  function mapParticlesToTargets(targets) {
    const total = targets.length;
    const use = Math.min(particles.length, total);
    if (use <= 0) return;

    const stride = Math.max(1, Math.floor(total / use));
    let j = 0;

    for (let i = 0; i < use; i++) {
      const p = particles[i];
      const target = targets[j]; j += stride; if (j >= total) j = total - 1;

      const dx = target[0] - p.px, dy = target[1] - p.py;
      const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      p.x = p.px + Math.cos(a) * d * p.delta;
      p.y = p.py + Math.sin(a) * d * p.delta;
      p.px = p.x; p.py = p.y;
      p.inText = true; p.fadeIn(); p.draw(ctx);
    }

    for (let i = use; i < particles.length; i++) {
      const p = particles[i]; p.fadeOut();
      const dx = p.mx - p.px, dy = p.my - p.py, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      p.x = p.px + Math.cos(a) * d * p.delta / 2;
      p.y = p.py + Math.sin(a) * d * p.delta / 2;
      p.px = p.x; p.py = p.y; p.draw(ctx);
    }
  }

  class Particle {
    constructor(canvas) {
      const logicalW = canvas.clientWidth || CANVASWIDTH;
      const logicalH = canvas.clientHeight || CANVASHEIGHT;
      const spread = logicalH;

      // 方块模式下不需要半径随机，统一像素尺寸即可
      this.size = USE_SQUARE_DOTS ? DOT_PX : (0.9 + Math.random() * 0.4);

      this.delta = 0.065;
      this.x = 0; this.y = 0;
      this.px = Math.random() * logicalW;
      this.py = (logicalH * 0.5) + ((Math.random() - 0.5) * spread);
      this.mx = this.px; this.my = this.py;
      this.inText = false;
      this.opacity = 0;
      this.fadeInRate = 0.02;
      this.fadeOutRate = 0.03;
      this.opacityTresh = 0.98;
      this.fadingOut = true;
      this.fadingIn = true;
    }

    // 新增：淡入
    fadeIn() {
      if (this.opacity >= 1) { this.opacity = 1; this.fadingIn = false; return; }
      this.fadingIn = this.opacity > this.opacityTresh ? false : true;
      if (this.fadingIn) {
        this.opacity += this.fadeInRate;
        if (this.opacity > 1) this.opacity = 1;
      } else {
        this.opacity = 1;
      }
    }

    // 新增：淡出
    fadeOut() {
      if (this.opacity <= 0) { this.opacity = 0; this.fadingOut = false; return; }
      this.fadingOut = this.opacity < 0 ? false : true;
      if (this.fadingOut) {
        this.opacity -= this.fadeOutRate;
        if (this.opacity < 0) this.opacity = 0;
      } else {
        this.opacity = 0;
      }
    }

    draw(ctx) {
      // 颜色用 globalAlpha 更稳定
      ctx.fillStyle = '#E2E18E';
      ctx.globalAlpha = this.opacity;

      if (USE_SQUARE_DOTS) {
        // 对齐整数像素，避免半像素抗锯齿
        const s = this.size;                   // 逻辑像素
        const x = Math.round(this.x - s / 2);
        const y = Math.round(this.y - s / 2);
        ctx.fillRect(x, y, s, s);
      } else {
        // 圆点模式：仍做 DPR 对齐以尽量锐利
        const x = Math.round(this.x * DPR) / DPR;
        const y = Math.round(this.y * DPR) / DPR;
        ctx.beginPath();
        ctx.arc(x, y, this.size, 0, RADIUS, true);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

// 固定宽度、DPR 对齐，防止右移与模糊
  function setDimensions () {
    const maxViewportW = Math.floor(window.innerWidth * 0.8);
    const targetH = Math.max(260, Math.floor(window.innerHeight * 0.55));
    lineHeight = Math.max(36, Math.floor(targetH / texts.length));
    textSize   = Math.max(30, Math.floor(lineHeight * 0.9));

    // 计算字间距（随字号缩放）
    letterSpacingPx = Math.round(textSize * LETTER_SPACING_EM);

    // 设置字体（修复这里多余的引号）
    offCtx.font = FONT_WEIGHT + ' ' + textSize + 'px ' + FONT_FAMILY;

    // 用“逐字+字间距”的方式测所有行的最大宽度
    let maxLineW = 0;
    for (let i = 0; i < texts.length; i++) {
      maxLineW = Math.max(maxLineW, measureSpacedWidth(texts[i]));
    }
    const ideal = Math.ceil(PADDING_LEFT + maxLineW + PADDING_RIGHT);

    CANVASWIDTH = Math.max(560, Math.min(maxViewportW, Math.max(ideal, 560)));

    const wantedH = PADDING_TOP + (lineHeight * texts.length + LINE_GAP * (texts.length - 1)) + PADDING_BOTTOM;
    const topPx = Math.floor(window.innerHeight * TOP_OFFSET_PERCENT);
    const availH = Math.max(200, window.innerHeight - topPx - 24);
    if (wantedH > availH) {
      const scale = availH / wantedH;
      lineHeight = Math.max(24, Math.floor(lineHeight * scale));
      textSize   = Math.max(18, Math.floor(textSize * scale));
    }
    CANVASHEIGHT = PADDING_TOP + (lineHeight * texts.length + LINE_GAP * (texts.length - 1)) + PADDING_BOTTOM;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    DPR = dpr;
    canvas.width  = Math.floor(CANVASWIDTH * dpr);
    canvas.height = Math.floor(CANVASHEIGHT * dpr);
    canvas.style.width  = CANVASWIDTH + 'px';
    canvas.style.height = CANVASHEIGHT + 'px';

    offCanvas.width = CANVASWIDTH;
    offCanvas.height = CANVASHEIGHT;

    const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
    ctx2d.imageSmoothingEnabled = false;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx = ctx2d;

    canvas.style.position = 'fixed';
    canvas.style.left = (LEFT_EDGE_PERCENT * 100) + '%';
    canvas.style.top = Math.floor(window.innerHeight * TOP_OFFSET_PERCENT) + 'px';
    canvas.style.transform = 'none';
    canvas.style.zIndex = '6';
    canvas.style.pointerEvents = 'none';

    buildLineDots();                 // 宽高确定后重建点阵
    SCHEDULE_START = performance.now();
  }

  function init () {
    const el = document.getElementById(CANVASID);
    if (!el || !el.getContext) return;
    canvas = el;
    setDimensions();
    particles.length = 0;
    for (let i = 0; i < PARTICLE_NUM; i++) particles[i] = new Particle(canvas);

    // 启动时间轴（替代旧的行计时）
    SCHEDULE_START = performance.now();

    window.addEventListener('resize', setDimensions);
    draw();
  }
  init();

  // 新增/覆盖：基于时间轴 + 预采样的主绘制循环
  function draw() {
    // 1) 依据绝对时间计算应该显示到第几行，以及本行的显露进度
    const now = performance.now();
    const elapsedTotal = Math.max(0, now - SCHEDULE_START);

    const targetActive = Math.min(texts.length, Math.floor(elapsedTotal / DURATION_MS) + 1);
    if (targetActive !== activeCount) activeCount = targetActive;

    const lineElapsed = elapsedTotal - (activeCount - 1) * DURATION_MS;
    const progress = Math.max(0, Math.min(1, lineElapsed / REVEAL_MS));
    reveal = progress;

    // 2) 从预采样的 lineDots 里取出当前应该可见的所有点
    const targets = getVisibleTargets(activeCount, progress);

    // 3) 清屏并把粒子均匀映射到可见点
    ctx.clearRect(0, 0, CANVASWIDTH, CANVASHEIGHT);
    for (let i = 0; i < particles.length; i++) particles[i].inText = false;
    mapParticlesToTargets(targets);

    // 4) 下一帧
    requestAnimationFrame(draw);
  }

  // 1) 新增：等距抽样工具函数（从数组头到尾均匀取 n 个）
  function sampleEven(arr, n) {
    const total = arr.length;
    if (n <= 0 || total === 0) return [];
    if (n >= total) return arr.slice();
    const out = new Array(n);
    const denom = Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      const idx = Math.round(i * (total - 1) / denom);
      out[i] = arr[idx];
    }
    return out;
  }

  // 新增：按“逐字+字间距”测一行宽度
  function measureSpacedWidth(t) {
    const chars = Array.from(t);
    let w = 0;
    for (const ch of chars) w += offCtx.measureText(ch).width;
    return Math.round(w + Math.max(0, chars.length - 1) * letterSpacingPx);
  }
})(window);