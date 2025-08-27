console.clear();


const scene = new THREE.Scene();
// scene.background = new THREE.Color(0x090a0f); // 设置为深色宇宙背景
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 层级：universe(0) < canvas(1) < three(2) < footer(20)
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.inset = '0';
renderer.domElement.style.zIndex = '2';

// 自适应
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
camera.position.z = 1;

const controls = new THREE.TrackballControls(camera, renderer.domElement);
controls.noPan = true;
controls.maxDistance = 3;
controls.minDistance = 0.7;

const group = new THREE.Group();
scene.add(group);

// 文本距离心脏中心的本地 Z 偏移（贴在心脏内）
let TEXT_OFFSET_Z = 0.006;
const _tmpCenter = new THREE.Vector3();
window.setTextOffset = v => { TEXT_OFFSET_Z = v; };

// === 微弱星光（仅围绕文字的小范围） ===
let txtStars = null;
let txtStarMat = null;

function makeStarTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16,16,0, 16,16,16);
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.5, 'rgba(255,220,240,0.55)');
  g.addColorStop(1.0, 'rgba(255,220,240,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,32,32);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// 扩大范围（接近心脏边缘）+ 暖金色（非红）
function createTextStars(count = 300, inner = 0.08, outer = 0.20, zSpread = 0.025, color = 0xfff5d6, size = 3.5, opacity = 0.28) {
  if (outer <= inner) outer = inner + 0.005;

  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random() * (outer*outer - inner*inner) + inner*inner);
    pos[i*3]     = r * Math.cos(theta);
    pos[i*3 + 1] = r * Math.sin(theta);
    pos[i*3 + 2] = (Math.random() * 2 - 1) * zSpread; // 薄厚
  }
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  txtStarMat = new THREE.PointsMaterial({
    map: makeStarTexture(),
    color,
    size,
    sizeAttenuation: false,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false
  });

  const pts = new THREE.Points(geom, txtStarMat);
  pts.renderOrder = 6;
  return pts;
}
// === 以上为星光 ===

let heart = null;
let sampler = null;
let originHeart = null;

// 新增：3D“杏”文字与导出
let heartText3D = null;
let heartFont = null;

function loadCNFont(cb) {
  const loader = new THREE.FontLoader();
  loader.load(
    './fonts/Noto_Sans_SC_Regular.json',
    f => { heartFont = f; console.log('CN font loaded'); cb && cb(f); },
    undefined,
    err => console.error('Font load failed:', err)
  );
}

// todo 修改心脏中显示的文字除了这里，还要改另一个 makeCNText3D
function makeCNText3D(text = '杏') {
  if (!heartFont) {
    console.warn('字体尚未加载');
    return null;
  }
  const geo = new THREE.TextGeometry(text, {
    font: heartFont,
    size: 0.12,
    height: 0.02,
    curveSegments: 6,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.0015,
    bevelSegments: 1
  });
  geo.center();

  // 仅比心脏颜色“稍微淡一点”：向白色 lerp 少量，保持同色系
  const base = (heart && heart.material) ? heart.material.color.clone() : new THREE.Color(0xff5555);
  const slight = base.clone().lerp(new THREE.Color(0xffffff), 0.18); // 0.15~0.22 之间更自然

  const mat = new THREE.MeshBasicMaterial({
    color: slight.getHex(),
    transparent: true,
    opacity: 0.28,   // 比之前 0.22 稍高，保证清晰
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 7;
  return mesh;
}

// 一次性导出：心脏 + 文字
window.bakeAndDownloadHeartObj = function(filename = 'heart_2_with_text.obj') {
  if (!heart) return;
  const exporter = new THREE.OBJExporter();
  const g = new THREE.Group();
  g.add(heart.clone());
  if (heartText3D) g.add(heartText3D.clone());
  const objStr = exporter.parse(g);
  const blob = new Blob([objStr], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

let positions = [];
const geometry = new THREE.BufferGeometry();
const material = new THREE.LineBasicMaterial({
  color: 0xffffff
});
const lines = new THREE.LineSegments(geometry, material);
group.add(lines);

const simplex = new SimplexNoise();
const pos = new THREE.Vector3();
class Grass {
  constructor() {
    sampler.sample(pos);
    this.pos = pos.clone();
    this.scale = Math.random() * 0.01 + 0.001;
    this.one = null;
    this.two = null;
  }
  update(a) {
    const noise = simplex.noise4D(this.pos.x * 1.5, this.pos.y * 1.5, this.pos.z * 1.5, a * 0.0005) + 1;
    this.one = this.pos.clone().multiplyScalar(1.01 + (noise * 0.15 * beat.a));
    this.two = this.one.clone().add(this.one.clone().setLength(this.scale));
  }
}

let spikes = [];
function init(a) {
  positions = [];
  // 心脏表面光点
  for (let i = 0; i < 6000; i++) {
    const g = new Grass();
    spikes.push(g);
  }
}

const beat = { a: 0 };
gsap.timeline({
  repeat: -1,
  repeatDelay: 0.3
}).to(beat, {
  a: 1.2,
  duration: 0.6,
  ease: 'power2.in'
}).to(beat, {
  a: 0.0,
  duration: 0.6,
  ease: 'power3.out'
});
gsap.to(group.rotation, {
  y: Math.PI * 2,
  duration: 12,
  ease: 'none',
  repeat: -1
});

// 每帧根据“当前心脏几何中心”更新位置（文字与星光）
function updateHeartTextPosition() {
  if (!heart || !heart.geometry) return;
  heart.geometry.computeBoundingBox();
  const center = heart.geometry.boundingBox.getCenter(_tmpCenter);

  if (heartText3D) {
    heartText3D.position.copy(center);
    heartText3D.position.z += TEXT_OFFSET_Z;
  }
  // 若文字未生成，也让星光跟随心脏中心
  if (txtStars && !heartText3D) {
    txtStars.position.copy(center);
    txtStars.position.z += TEXT_OFFSET_Z;
  }
}

function render(a) {
  positions = [];
  spikes.forEach(g => {
    g.update(a);
    positions.push(g.one.x, g.one.y, g.one.z);
    positions.push(g.two.x, g.two.y, g.two.z);
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));

  const vs = heart.geometry.attributes.position.array;
  for (let i = 0; i < vs.length; i += 3) {
    const v = new THREE.Vector3(originHeart[i], originHeart[i + 1], originHeart[i + 2]);
    const noise = simplex.noise4D(originHeart[i] * 1.5, originHeart[i + 1] * 1.5, originHeart[i + 2] * 1.5, a * 0.0005) + 1;
    v.multiplyScalar(1 + (noise * 0.15 * beat.a));
    vs[i] = v.x;
    vs[i + 1] = v.y;
    vs[i + 2] = v.z;
  }
  heart.geometry.attributes.position.needsUpdate = true;

  // 文字心跳与位置校准 + 星点动态
  if (heartText3D) {
    const s = 1 + 0.12 * beat.a;
    heartText3D.scale.set(s, s, s);
  }
  updateHeartTextPosition();

  if (txtStars && txtStarMat) {
    // 环绕圈轻微扩张（更显眼，但不刺眼）
    const ring = 1 + 0.10 * beat.a;
    txtStars.scale.set(ring, ring, 1);

    txtStars.rotation.z += 0.0012;
    const t = performance.now() * 0.001;
    const o = 0.20 + 0.06 * Math.sin(t) + 0.06 * beat.a; // 0.14~0.32
    txtStarMat.opacity = Math.max(0.14, Math.min(0.32, o));
  }

  controls.update();
  renderer.render(scene, camera);
}




window.addEventListener("resize", onWindowResize, false);
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// 本地加载 OBJ
new THREE.OBJLoader().load('./models/heart_2.obj', obj => {
  heart = obj.children[0];
  heart.geometry.rotateX(-Math.PI * 0.5);

  heart.geometry.scale(0.035, 0.035, 0.035);
  heart.geometry.translate(0.0, -0.23, 0.05);
  group.add(heart);

  heart.material = new THREE.MeshBasicMaterial({
    color: 0xff5555,
    transparent: true,
    opacity: 0.3
  });

  heart.geometry.computeBoundingBox();
  const center = heart.geometry.boundingBox.getCenter(new THREE.Vector3());

  // 更大范围的环形星光（接近心脏边缘）
  if (!txtStars) {
    txtStars = createTextStars(300, 0.08, 0.20, 0.025, 0xfff5d6, 3.5, 0.28);
    heart.add(txtStars);
    txtStars.position.copy(center);
    txtStars.position.z += TEXT_OFFSET_Z;
  }

  // 再尝试加载字体与文字
  loadCNFont(() => {
    heartText3D = makeCNText3D('杏');
    if (heartText3D) {
      heart.add(heartText3D);
      heartText3D.position.copy(center);
      heartText3D.position.z += TEXT_OFFSET_Z;

      // 将星光挂到文字下，只围绕文字
      if (txtStars && txtStars.parent !== heartText3D) {
        heart.remove(txtStars);
        heartText3D.add(txtStars);
        txtStars.position.set(0, 0, 0); // 相对文字中心
        txtStars.renderOrder = 6;
      }
    }
  });

  originHeart = Array.from(heart.geometry.attributes.position.array);

  if (THREE.MeshSurfaceSampler) {
    sampler = new THREE.MeshSurfaceSampler(heart).build();
    init();
  } else {
    console.warn('MeshSurfaceSampler 未加载，跳过 spikes 初始化');
  }

  renderer.setAnimationLoop(render);
});

// 运行时快速调参（范围/数量/颜色/大小/透明度）
window.setStarsRange = function(inner = 0.08, outer = 0.20, count = 300, color = 0xfff5d6, size = 3.5, opacity = 0.28) {
  const parent = (txtStars && txtStars.parent) || heartText3D || heart;
  if (!parent) return;
  if (txtStars) parent.remove(txtStars);
  txtStars = createTextStars(count, inner, outer, 0.025, color, size, opacity);
  parent.add(txtStars);
  if (parent === heart) {
    heart.geometry.computeBoundingBox();
    const c = heart.geometry.boundingBox.getCenter(new THREE.Vector3());
    txtStars.position.copy(c);
    txtStars.position.z += TEXT_OFFSET_Z;
  } else {
    txtStars.position.set(0, 0, 0);
  }
};