;(function (window) {
  'use strict';

  window.requestAnimationFrame = window.requestAnimationFrame
    || window.mozRequestAnimationFrame
    || window.webkitRequestAnimationFrame
    || window.msRequestAnimationFrame;

  const RADIUS = Math.PI * 2;
  const PARTICLE_NUM = 3200;
  let CANVASWIDTH = 500;
  let CANVASHEIGHT = 150;
  const CANVASID = 'canvas'; // 若你有独立文字画布，可改为 'text'

  // 左侧加大内边距，避免最左笔画被裁
  const PADDING_LEFT = 112;       // 原 96 -> 112，给最左笔画多一点安全边
  const PADDING_RIGHT = 36;
  const PADDING_TOP = 0;
  const PADDING_BOTTOM = 0;

  // 画布离页面左边再远一点，彻底避免贴边裁切
  const LEFT_EDGE_PERCENT = 0.08; // 保持 8%，如仍贴边可调到 0.10
  const TOP_OFFSET_PERCENT = 0.15;

  const SAMPLE_STEP = 2;

  // 文案（保持原顺序）
  let texts = [
    '抱歉','被拒绝的我','无法抗拒自己的内心','ARE YOU','LOOKING AT THE',
    'SAME STAR','WITH ME ?','HAPPY','CHINESE','VALENTINE\'S','DAY','I MISS YOU'
  ];

  let activeCount = 1;
  let reveal = 0;
  const REVEAL_SPEED = 0.02;
  let lineHeight = 48;
  let textSize = 40;
  const LINE_GAP = 8;

  // 离屏画布：开启 willReadFrequently 减少读回退化
  const offCanvas = document.createElement('canvas');
  const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

  let canvas, ctx;
  let particles = [];
  let quiver = true;
  // 单行模式的变量不再使用
  // let text = texts[0];
  // let textIndex = 0;

  function draw() {
    offCtx.clearRect(0, 0, CANVASWIDTH, CANVASHEIGHT);
    offCtx.fillStyle = 'rgb(255, 255, 255)';
    offCtx.textBaseline = 'middle';
    offCtx.textAlign = 'left';
    offCtx.font = textSize + 'px "SimHei","Avenir","Helvetica Neue","Arial",sans-serif';

    // 顶部对齐：自上而下逐行绘制
    let y = PADDING_TOP + lineHeight * 0.5;

    for (let i = 0; i < activeCount; i++) {
      const t = texts[i];
      const w = offCtx.measureText(t).width;
      const x = PADDING_LEFT;

      if (i < activeCount - 1) {
        offCtx.fillText(t, x, y);
      } else {
        offCtx.save();
        offCtx.beginPath();
        // 裁剪向左放宽 4px，避免最左一笔被裁；上下放宽确保不切顶/底
        const REVEAL_LEFT_PAD = 4;
        offCtx.rect(
          x - REVEAL_LEFT_PAD,
          y - lineHeight * 0.75,
          w * Math.min(reveal, 1) + REVEAL_LEFT_PAD,
          lineHeight * 1.5
        );
        offCtx.clip();
        offCtx.fillText(t, x, y);
        offCtx.restore();
      }
      y += lineHeight + LINE_GAP;
    }

    const imgData = offCtx.getImageData(0, 0, CANVASWIDTH, CANVASHEIGHT);
    ctx.clearRect(0, 0, CANVASWIDTH, CANVASHEIGHT);

    for (let i = 0; i < particles.length; i++) particles[i].inText = false;
    particleText(imgData);

    // 3) 推进当前行的渐显；完成后增加下一行，直到全部显示
    if (activeCount < texts.length) {
      reveal += REVEAL_SPEED;
      if (reveal >= 1) { activeCount++; reveal = 0; }
    } else {
      reveal = 1; // 全部显示后保持
    }
    requestAnimationFrame(draw);
  }

  // 均匀下采样工具：从整张文本像素里，等间距选取目标数量，保证整行都有粒子覆盖
  function pickEven(pxls, wantCount) {
    if (pxls.length <= wantCount) return pxls;
    const out = new Array(wantCount);
    const step = (pxls.length - 1) / (wantCount - 1);
    for (let i = 0; i < wantCount; i++) {
      out[i] = pxls[Math.round(i * step)];
    }
    return out;
  }

  function particleText(imgData) {
    const pxls = [];
    // 从右到左/从上到下扫描像素（顺序现在不重要了，因为我们会均匀抽样）
    for (let w = CANVASWIDTH - 1; w >= 0; w -= SAMPLE_STEP) {
      for (let h = 0; h < CANVASHEIGHT; h += SAMPLE_STEP) {
        const index = (w + h * CANVASWIDTH) << 2; // (w + h*W)*4
        if (imgData.data[index] > 1) pxls.push([w, h]);
      }
    }

    // 关键：像素点过多时，做“均匀下采样”，让整行都被覆盖
    const targetPxls = pickEven(pxls, Math.min(particles.length, pxls.length));

    // 把粒子映射到 targetPxls（不再使用居中偏移 j 的那套逻辑）
    const count = Math.min(particles.length, targetPxls.length);
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const prev = targetPxls[i];
      let X, Y;
      if (quiver) {
        X = prev[0] - (p.px + Math.random() * 10);
        Y = prev[1] - (p.py + Math.random() * 10);
      } else {
        X = prev[0] - p.px;
        Y = prev[1] - p.py;
      }
      const T = Math.sqrt(X * X + Y * Y);
      const A = Math.atan2(Y, X);
      const C = Math.cos(A);
      const S = Math.sin(A);
      p.x = p.px + C * T * p.delta;
      p.y = p.py + S * T * p.delta;
      p.px = p.x;
      p.py = p.y;
      p.inText = true;
      p.fadeIn();
      p.draw(ctx);
    }

    // 多余粒子（超过目标像素的）按原逻辑回到“休眠”轨迹
    for (let i = count; i < particles.length; i++) {
      const p = particles[i];
      p.fadeOut();
      const X = p.mx - p.px;
      const Y = p.my - p.py;
      const T = Math.sqrt(X * X + Y * Y);
      const A = Math.atan2(Y, X);
      const C = Math.cos(A);
      const S = Math.sin(A);
      p.x = p.px + C * T * p.delta / 2;
      p.y = p.py + S * T * p.delta / 2;
      p.px = p.x;
      p.py = p.y;
      p.draw(ctx);
    }
  }

  function setDimensions () {
    // 固定一个稳定的画布宽度区间，不随文本测量变化，避免“整体右移”的观感
    const maxViewportW = Math.floor(window.innerWidth * 0.8); // 占屏宽 80%
    const targetH = Math.max(260, Math.floor(window.innerHeight * 0.55));
    lineHeight = Math.max(36, Math.floor(targetH / texts.length));
    textSize   = Math.max(30, Math.floor(lineHeight * 0.9));

    // 固定宽度：最小 560px，最大 1200px
    CANVASWIDTH = Math.max(560, Math.min(maxViewportW, 1200));

    // 画布高度容纳全部行（顶部对齐）
    CANVASHEIGHT = PADDING_TOP + (lineHeight * texts.length + LINE_GAP * (texts.length - 1)) + PADDING_BOTTOM;

    // 高 DPI 渲染
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(CANVASWIDTH * dpr);
    canvas.height = Math.floor(CANVASHEIGHT * dpr);
    canvas.style.width = CANVASWIDTH + 'px';
    canvas.style.height = CANVASHEIGHT + 'px';

    offCanvas.width = CANVASWIDTH;
    offCanvas.height = CANVASHEIGHT;

    // 显示画布 2D 上下文（同样可开启 willReadFrequently）
    const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx = ctx2d;

    // 固定在页面左侧与顶部，不再使用居中位移
    canvas.style.position = 'fixed';
    canvas.style.left = (LEFT_EDGE_PERCENT * 100) + '%';  // 8%
    canvas.style.top = Math.floor(window.innerHeight * TOP_OFFSET_PERCENT) + 'px';
    canvas.style.transform = 'none';
    canvas.style.zIndex = '3';
    canvas.style.pointerEvents = 'none';
    canvas.style.cursor = 'default';
  }

  function bindEvents() {
    // 点击不再切换文本，保留空壳避免报错（或直接删掉此函数与调用）
  }

  class Particle {
    constructor(canvas) {
      // 使用逻辑尺寸初始化，避免 dpr 缩放导致目标偏移
      const logicalW = canvas.clientWidth || CANVASWIDTH;
      const logicalH = canvas.clientHeight || CANVASHEIGHT;
      const spread = logicalH;
      const size = 1.2 + Math.random() * 0.8;

      this.delta = 0.06;
      this.x = 0; this.y = 0;
      this.px = Math.random() * logicalW;
      this.py = (logicalH * 0.5) + ((Math.random() - 0.5) * spread);
      this.mx = this.px; this.my = this.py;
      this.size = size;
      this.inText = false;
      this.opacity = 0;
      this.fadeInRate = 0.005;
      this.fadeOutRate = 0.03;
      this.opacityTresh = 0.98;
      this.fadingOut = true;
      this.fadingIn = true;
    }
    fadeIn() {
      this.fadingIn = this.opacity > this.opacityTresh ? false : true;
      if (this.fadingIn) this.opacity += this.fadeInRate;
      else this.opacity = 1;
    }
    fadeOut() {
      this.fadingOut = this.opacity < 0 ? false : true;
      if (this.fadingOut) {
        this.opacity -= this.fadeOutRate;
        if (this.opacity < 0) this.opacity = 0;
      } else this.opacity = 0;
    }
    draw(ctx) {
      ctx.fillStyle = 'rgba(226,225,142,' + this.opacity + ')';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, RADIUS, true);
      ctx.closePath();
      ctx.fill();
    }
  }

  function init () {
    const el = document.getElementById(CANVASID);
    if (!el || !el.getContext) return;
    canvas = el;
    setDimensions();
    // bindEvents(); // 无需点击
    particles.length = 0;
    for (let i = 0; i < PARTICLE_NUM; i++) particles[i] = new Particle(canvas);
    window.addEventListener('resize', setDimensions);
    draw();
  }
  init();
})(window);