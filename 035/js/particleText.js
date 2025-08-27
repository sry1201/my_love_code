;(function (window) {
  'use strict';

  window.requestAnimationFrame = window.requestAnimationFrame
    || window.mozRequestAnimationFrame
    || window.webkitRequestAnimationFrame
    || window.msRequestAnimationFrame;

  const RADIUS = Math.PI * 2;
  const PARTICLE_NUM = 2000;
  // 允许根据窗口自适应，改为 let（原来是 const）
  let CANVASWIDTH = 500;
  let CANVASHEIGHT = 150;
  const CANVASID = 'canvas'; // 若你用独立文字画布，请改成 'text'
  const PADDING_LEFT = 36;   // 新增：左侧内边距（像素）

  // 文案（保持原顺序）
  let texts = [
    'MY DEAR','LOOK UP AT THE','STARRY SKY','ARE YOU','LOOKING AT THE',
    'SAME STAR','WITH ME ?','HAPPY','CHINESE','VALENTINE\'S','DAY','I MISS YOU'
  ];

  // 新增：多行累积与渐显参数
  let activeCount = 1;          // 已显示的行数
  let reveal = 0;               // 当前新增行 0~1 的显露进度（从左到右）
  const REVEAL_SPEED = 0.02;    // 渐显速度（每帧增加的比例）
  let lineHeight = 48;          // 行高（随窗口与行数自适应）
  let textSize = 40;            // 字号（随窗口与行数自适应）
  const LINE_GAP = 8;           // 行间距（像素）

  // 离屏画布：把所有已显示行绘制到这里，再读像素驱动粒子
  const offCanvas = document.createElement('canvas');
  const offCtx = offCanvas.getContext('2d');

  let canvas, ctx;
  let particles = [];
  let quiver = true;
  // 单行模式的变量不再使用
  // let text = texts[0];
  // let textIndex = 0;

  function draw() {
    // 1) 在离屏画布上绘制“已显示的所有行”
    offCtx.clearRect(0, 0, CANVASWIDTH, CANVASHEIGHT);
    offCtx.fillStyle = 'rgb(255, 255, 255)';
    offCtx.textBaseline = 'middle';
    offCtx.textAlign = 'left'; // 新增：左对齐
    offCtx.font = textSize + 'px "SimHei","Avenir","Helvetica Neue","Arial",sans-serif';

    // 垂直居中起始 y
    const totalHeight = activeCount * lineHeight + (activeCount - 1) * LINE_GAP;
    let y = (CANVASHEIGHT - totalHeight) * 0.5 + lineHeight * 0.5;

    for (let i = 0; i < activeCount; i++) {
      const t = texts[i];
      const w = offCtx.measureText(t).width;
      const x = PADDING_LEFT; // 改：从左边距开始绘制

      if (i < activeCount - 1) {
        offCtx.fillText(t, x, y);
      } else {
        offCtx.save();
        offCtx.beginPath();
        // 改：裁剪也从左边距开始，按 reveal 逐步展开
        offCtx.rect(x, y - textSize * 0.6, w * Math.min(reveal, 1), textSize * 1.2);
        offCtx.clip();
        offCtx.fillText(t, x, y);
        offCtx.restore();
      }
      y += lineHeight + LINE_GAP;
    }

    // 2) 读取离屏像素，驱动粒子收敛
    const imgData = offCtx.getImageData(0, 0, CANVASWIDTH, CANVASHEIGHT);
    ctx.clearRect(0, 0, CANVASWIDTH, CANVASHEIGHT);

    for (let i = 0; i < particles.length; i++) particles[i].inText = false;
    particleText(imgData);

    // 3) 推进当前行的渐显；完成后增加下一行，直到全部显示
    if (activeCount < texts.length) {
      reveal += REVEAL_SPEED;
      if (reveal >= 1) { activeCount++; reveal = 0; }
    } else {
      reveal = 1; // 全部显示完毕后保持静止
    }

    requestAnimationFrame(draw);
  }

  function particleText(imgData) {
    const pxls = [];
    for (let w = CANVASWIDTH; w > 0; w -= 3) {
      for (let h = 0; h < CANVASHEIGHT; h += 3) {
        const index = (w + h * CANVASWIDTH) * 4;
        if (imgData.data[index] > 1) pxls.push([w, h]); // 白色文本像素
      }
    }

    let j = Math.max(0, parseInt((particles.length - pxls.length) / 2, 10));
    for (let i = 0; i < pxls.length && j < particles.length; i++, j++) {
      const p = particles[j];
      const prev = pxls[i - 1] || pxls[i];
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

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!p.inText) {
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
  }

  function setDimensions () {
    // 改：画布宽度改为屏幕 50%（可按需调 0.45~0.6），高度按行数自适应
    CANVASWIDTH = Math.min(900, Math.floor(window.innerWidth * 0.5));
    const targetH = Math.max(180, Math.floor(window.innerHeight * 0.4));
    lineHeight = Math.max(24, Math.floor(targetH / texts.length));
    textSize = Math.max(18, Math.floor(lineHeight * 0.8));
    CANVASHEIGHT = lineHeight * texts.length + LINE_GAP * (texts.length - 1);

    canvas.width = CANVASWIDTH;
    canvas.height = CANVASHEIGHT;
    offCanvas.width = CANVASWIDTH;
    offCanvas.height = CANVASHEIGHT;

    // 改：把画布放到左侧，垂直居中
    canvas.style.position = 'fixed';
    canvas.style.left = '4%';                // 左侧留一点外边距
    canvas.style.top = '50%';
    canvas.style.transform = 'translateY(-50%)'; // 只做垂直居中
    canvas.style.zIndex = '1';
    canvas.style.pointerEvents = 'none';
    canvas.style.cursor = 'default';
  }

  function bindEvents() {
    // 点击不再切换文本，保留空壳避免报错（或直接删掉此函数与调用）
  }

  class Particle {
    constructor(canvas) {
      const spread = canvas.height;
      const size = Math.random() * 1.2;
      this.delta = 0.06;
      this.x = 0;
      this.y = 0;
      this.px = Math.random() * canvas.width;
      this.py = (canvas.height * 0.5) + ((Math.random() - 0.5) * spread);
      this.mx = this.px;
      this.my = this.py;
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
    canvas = document.getElementById(CANVASID);
    if (!canvas || !canvas.getContext) return;
    // 修复 getImageData 性能告警
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    setDimensions();
    bindEvents(); // 现在不做任何事
    particles.length = 0;
    for (let i = 0; i < PARTICLE_NUM; i++) particles[i] = new Particle(canvas);

    // 窗口尺寸变化时自适应
    window.addEventListener('resize', setDimensions);
    draw();
  }
  init();
})(window);