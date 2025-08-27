;(function (window) {
  'use strict';

  window.requestAnimationFrame = window.requestAnimationFrame
    || window.mozRequestAnimationFrame
    || window.webkitRequestAnimationFrame
    || window.msRequestAnimationFrame;

  const RADIUS = Math.PI * 2;
  const PARTICLE_NUM = 2000;
  const CANVASWIDTH = 500;
  const CANVASHEIGHT = 150;
  const CANVASID = 'canvas';

  // 与 030 相同的顺序（注意 VALENTINE'S 需要转义）
  let texts = [
    'MY DEAR','LOOK UP AT THE','STARRY SKY','ARE YOU','LOOKING AT THE',
    'SAME STAR','WITH ME ?','HAPPY','CHINESE','VALENTINE\'S','DAY','I MISS YOU'
  ];

  // 使用独立画布 #text（不要用 #canvas）
  const canvas = document.getElementById('text');
  // 2D 上下文加 willReadFrequently，消除性能警告
  let ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;

  // 空值守卫：没有 #text 或上下文失败则直接退出，避免报错阻断 Three.js
  if (!canvas || !ctx) {
    console.warn('[particleText] #text 画布或 2D 上下文获取失败，跳过粒子文字渲染。');
    // 若文件末尾有自动 init() 调用，请直接 return 防止后续 draw()
    // return;
  }

  // 尺寸自适应
  function resizeParticleCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeParticleCanvas);
  resizeParticleCanvas();

  // 如果文件顶部有这些常量且在后面会重新赋值，请把它们从 const 改为 let
  // 例如（示例名，按你文件里的实际变量名修改）：
  // let W = canvas.width, H = canvas.height;
  // let particles = [];   // 若后续会重新赋新数组或引用
  // let textData = null;  // 若后续会被重新赋值
  let particles = [];
  let quiver = true;
  let text = texts[0];
  let textIndex = 0;
  let textSize = 70;

  function draw() {
    ctx.clearRect(0, 0, CANVASWIDTH, CANVASHEIGHT);
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.textBaseline = 'middle';
    ctx.font = textSize + 'px "SimHei","Avenir","Helvetica Neue","Arial",sans-serif';
    ctx.fillText(text, (CANVASWIDTH - ctx.measureText(text).width) * 0.5, CANVASHEIGHT * 0.5);

    const imgData = ctx.getImageData(0, 0, CANVASWIDTH, CANVASHEIGHT);
    ctx.clearRect(0, 0, CANVASWIDTH, CANVASHEIGHT);

    for (let i = 0; i < particles.length; i++) particles[i].inText = false;
    particleText(imgData);
    requestAnimationFrame(draw);
  }

  function particleText(imgData) {
    const pxls = [];
    for (let w = CANVASWIDTH; w > 0; w -= 3) {
      for (let h = 0; h < CANVASHEIGHT; h += 3) {
        const index = (w + h * CANVASWIDTH) * 4;
        if (imgData.data[index] > 1) pxls.push([w, h]);
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
    canvas.width = CANVASWIDTH
    canvas.height = CANVASHEIGHT
    canvas.style.position = 'fixed'
    canvas.style.inset = '0'
    canvas.style.zIndex = '1'           // 在 Three.js 下方
    canvas.style.pointerEvents = 'none' // 不拦截鼠标
    canvas.style.marginTop = window.innerHeight * 0.15 + 'px'
    canvas.style.cursor = 'default'
  }

  function bindEvents() {
    function next() {
      textIndex++;
      if (textIndex >= texts.length) { textIndex--; return; } // 到最后一条停住（与 030 相同）
      text = texts[textIndex];
    }
    document.addEventListener('click', next, false);
    document.addEventListener('touchstart', function (e) { e.preventDefault(); next(); }, { passive: false });
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
    if (!canvas || !canvas.getContext) return
    // 修复 getImageData 性能告警
    ctx = canvas.getContext('2d', { willReadFrequently: true })
    setDimensions()
    bindEvents()
    for (let i = 0; i < PARTICLE_NUM; i++) particles[i] = new Particle(canvas)
    draw()
  }
  init();
})(window);