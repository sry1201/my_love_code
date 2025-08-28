;(function (window) {
  'use strict';

  window.requestAnimationFrame = window.requestAnimationFrame
    || window.mozRequestAnimationFrame
    || window.webkitRequestAnimationFrame
    || window.msRequestAnimationFrame;

  const RADIUS = Math.PI * 2;
  const PARTICLE_NUM = 5200; // ↑ 提高粒子数，提升笔画填充密度
  let CANVASWIDTH = 500;
  let CANVASHEIGHT = 150;
  const CANVASID = 'canvas'; // 若你有独立文字画布，可改为 'text'

// 新增：更圆润的中文字体栈与字重
  const FONT_FAMILY = '"Noto Sans SC","Microsoft YaHei","Source Han Sans SC","PingFang SC","Helvetica Neue",Arial,sans-serif';
  const FONT_WEIGHT = 100; // ↑ 加粗，笔画更结实

  // 左侧加大内边距，避免最左笔画被裁
  const PADDING_LEFT = 72;       // ↓ 从 112 降到 72，让文字更贴近画布左侧
  const PADDING_RIGHT = 36;
  const PADDING_TOP = 0;
  const PADDING_BOTTOM = 0;

  // 画布离页面左边再远一点，彻底避免贴边裁切
  const LEFT_EDGE_PERCENT = 0.001; // ↓ 从 0.08 调到 0.04，更靠近页面左边
  const TOP_OFFSET_PERCENT = 0.05;

  const SAMPLE_STEP = 1; // ↓ 更密集采样，提高字形细节

// 文案（保持原顺序）——改：保留原文案为 textsRaw，折行后写回 texts

  let textsRaw = [
    '抱歉','还是忍不住打扰','被拒绝的我','本不该再来','但无法抗拒自己的内心','所以，再次问候：七夕快乐。',
    '如果你愿意','我的故事里永远为你保留位置','我所期待的','是能与你并肩共望一片星空'
  ];

  let texts = []; // 折行后的行数组

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
    // 改：使用中文字体栈 + 字重
    offCtx.font = FONT_WEIGHT + ' ' + textSize + 'px ' + FONT_FAMILY;

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
        const REVEAL_LEFT_PAD = 6;
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

  // 新增：中文标点（避免换行后行首是标点）
  const CN_PUNC = '，。、“”、；：？！…—）】〉》＞』」’"]';
  function isPunc(ch) {
    return CN_PUNC.indexOf(ch) >= 0;
  }

  // 新增：按可用宽度把 textsRaw 自动折行
  function wrapTextsByWidth(maxWidth) {
    const lines = [];
    offCtx.font = FONT_WEIGHT + ' ' + textSize + 'px ' + FONT_FAMILY;

    for (const src of textsRaw) {
      if (!src || /^\s+$/.test(src)) { // 空行
        lines.push(''); continue;
      }
      const chars = Array.from(src);
      let line = '';
      for (let i = 0; i < chars.length; i++) {
        const tryLine = line + chars[i];
        const w = offCtx.measureText(tryLine).width;
        if (w <= maxWidth) {
          line = tryLine;
        } else {
          if (line.length) {
            // 若当前字符是标点，则把它也放到上一行，避免行首标点
            if (isPunc(chars[i])) {
              lines.push(line + chars[i]);
              line = '';
            } else {
              lines.push(line);
              line = chars[i];
            }
          } else {
            // 单字符就超宽，强制断（极端情况）
            lines.push(chars[i]);
            line = '';
          }
        }
      }
      if (line.length || src === '') lines.push(line);
    }
    return lines;
  }

  function setDimensions () {
    // 固定一个稳定的画布宽度区间，不随文本测量变化，避免“整体右移”的观感
    const maxViewportW = Math.floor(window.innerWidth * 0.8); // 占屏宽 80%
    const targetH = Math.max(260, Math.floor(window.innerHeight * 0.55));

    // 先用一个预估字号/行高
    lineHeight = Math.max(36, Math.floor(targetH / 10)); // 先按最多10行估计
    textSize   = Math.max(30, Math.floor(lineHeight * 0.9));

    // 固定宽度：最小 560px，最大 1200px
    CANVASWIDTH = Math.max(560, Math.min(maxViewportW, 1200));
    const usableW = CANVASWIDTH - PADDING_LEFT - PADDING_RIGHT; // 可用于文字的宽度

    // 第一次折行
    texts = wrapTextsByWidth(usableW);

    // 依据折行后的行数重新计算字号/行高，使其适配高度
    const wantedH = PADDING_TOP + (lineHeight * texts.length + LINE_GAP * (texts.length - 1)) + PADDING_BOTTOM;
    const topPx = Math.floor(window.innerHeight * TOP_OFFSET_PERCENT);
    const availH = Math.max(200, window.innerHeight - topPx - 24);

    if (wantedH > availH) {
      const scale = availH / wantedH;
      lineHeight = Math.max(28, Math.floor(lineHeight * scale));
      textSize   = Math.max(22, Math.floor(textSize * scale));
      // 字号改变后需重新折行一次
      texts = wrapTextsByWidth(usableW);
    }

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
      const size = 3.6 ; // ↑ 粒子更大一点，笔画更“实”

      this.delta = 0.06;
      this.x = 0; this.y = 0;
      this.px = Math.random() * logicalW;
      this.py = (logicalH * 0.5) + ((Math.random() - 0.5) * spread);
      this.mx = this.px; this.my = this.py;
      this.size = size;
      this.inText = false;
      this.opacity = 0;
      this.fadeInRate = 0.007; // ↑ 略快一点进入文字状态
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
      ctx.fillStyle = 'rgba(248,244,190,' + this.opacity + ')'; // ↑ 亮一点的暖黄
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, RADIUS, true);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 改：等待字体加载后再初始化，保证测量与渲染一致
  async function init () {
    const el = document.getElementById(CANVASID);
    if (!el || !el.getContext) return;
    canvas = el;

    try {
      if (document.fonts && document.fonts.load) {
        // 先用一个临时字号加载字体，避免回退
        await document.fonts.load(`${FONT_WEIGHT} 32px ${FONT_FAMILY}`);
        await document.fonts.ready;
        console.log('CN font loaded');
      }
    } catch(e) {
      console.warn('Font load skipped', e);
    }

    setDimensions();
    particles.length = 0;
    for (let i = 0; i < PARTICLE_NUM; i++) particles[i] = new Particle(canvas);
    window.addEventListener('resize', setDimensions);
    draw();
  }
  init();
})(window);