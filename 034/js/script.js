console.clear();


const scene = new THREE.Scene();
// scene.background = new THREE.Color(0x090a0f); // 设置为深色宇宙背景
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true // 关键：让canvas背景透明
});
renderer.setClearColor(0x000000, 0); // 关键：设置为透明
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
// renderer.setClearColor(0xff5555);
// renderer.setSize(window.innerWidth, window.innerHeight);
// document.body.appendChild(renderer.domElement);

camera.position.z = 1;

const controls = new THREE.TrackballControls(camera, renderer.domElement);
controls.noPan = true;
controls.maxDistance = 3;
controls.minDistance = 0.7;

const group = new THREE.Group();
scene.add(group);

// 文本距离心脏中心的本地 Z 偏移（可调）
let TEXT_OFFSET_Z = 0.02;
const _tmpCenter = new THREE.Vector3();
// 控制台调节：setTextOffset(0.01) 等
window.setTextOffset = v => { TEXT_OFFSET_Z = v; };


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
    height: 0.03,
    curveSegments: 6,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.002,
    bevelSegments: 1
  });
  geo.center();

  // 更容易看见：关闭深度测试，适度提高不透明度
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff5555,
    transparent: true,
    opacity: 0.6,
    depthTest: false,     // 关键：不与心脏深度互相遮挡
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1000; // 确保在心脏之后渲染
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

// 每帧根据“当前心脏几何中心”更新文字位置
function updateHeartTextPosition() {
  if (!heart || !heartText3D || !heart.geometry) return;
  heart.geometry.computeBoundingBox();
  const center = heart.geometry.boundingBox.getCenter(_tmpCenter);
  heartText3D.position.copy(center);
  heartText3D.position.z += TEXT_OFFSET_Z; // 沿本地 +Z 略微前凸，避免被吞没
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

  // 文字心跳与位置校准
  if (heartText3D) {
    const s = 1 + 0.2 * beat.a; // 心跳幅度可调
    heartText3D.scale.set(s, s, s);
    updateHeartTextPosition();   // 关键：每帧重定位到中心
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

  // 在几何中心放置“杏”，并比之前更外凸，避免被吞没
  heart.geometry.computeBoundingBox();
  const center = heart.geometry.boundingBox.getCenter(new THREE.Vector3());
  loadCNFont(() => {
    heartText3D = makeCNText3D('杏');
    if (heartText3D) {
      heart.add(heartText3D);
      heartText3D.position.copy(center);
      heartText3D.position.z += 0.06; // 加大外凸距离
    }
  });

  originHeart = Array.from(heart.geometry.attributes.position.array);

  // 防止缺少 MeshSurfaceSampler 时抛错（index.html 若未引入该文件）
  if (THREE.MeshSurfaceSampler) {
    sampler = new THREE.MeshSurfaceSampler(heart).build();
    init();
  } else {
    console.warn('MeshSurfaceSampler 未加载，跳过 spikes 初始化');
  }

  renderer.setAnimationLoop(render);
});