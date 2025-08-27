console.clear();

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(0, 0, 5);

const canvasEl = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({
  canvas: canvasEl,
  antialias: true,
  alpha: true
});
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

// 灯光（受光材质必需）
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dir = new THREE.DirectionalLight(0xffffff, 1.1);
dir.position.set(5, 10, 8);
scene.add(dir);

// 交互
const controls = new THREE.TrackballControls(camera, renderer.domElement);
controls.rotateSpeed = 3.0;
controls.zoomSpeed = 1.2;
controls.panSpeed = 0.8;

// 工具：为几何体添加随机属性 aRnd（用于顶点位移的相位差）
function addRandomAttribute(geom) {
  const g = geom.isBufferGeometry ? geom : new THREE.BufferGeometry().fromGeometry(geom);
  const count = g.getAttribute('position').count;
  if (!g.getAttribute('aRnd')) {
    const rnd = new Float32Array(count);
    for (let i = 0; i < count; i++) rnd[i] = Math.random();
    g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  }
  return g;
}

// 给 MeshPhongMaterial 注入“心跳位移”顶点着色逻辑（保持原有光照/高光）
function makeBeatingMaterial(baseColor, amp) {
  const mat = new THREE.MeshPhongMaterial({
    color: baseColor,
    shininess: 80,
    specular: 0x222222
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uBeat = { value: 0 };     // 0~1，由 GSAP 驱动
    shader.uniforms.uAmp  = { value: amp };   // 位移幅度（与模型尺寸相关）

    // 注入自定义 uniform/attribute
    shader.vertexShader =
      'uniform float uTime; uniform float uBeat; uniform float uAmp; attribute float aRnd;\n' +
      shader.vertexShader;

    // 在 begin_vertex 之后对顶点沿法线位移：位移 = uBeat * 噪声因子 * uAmp
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      // 轻量正弦噪声（避免引入额外噪声库到 shader）
      float n = sin(uTime * 6.28318 + aRnd * 6.28318) * 0.5 + 0.5; // 0~1
      float disp = uBeat * mix(0.6, 1.0, n) * uAmp;                // 心跳位移
      transformed += normal * disp;
      `
    );

    // 存一份指针，便于在动画循环里更新
    mat.userData.shader = shader;
  };
  return mat;
}

let heart = null;
let heartMeshes = []; // 记录所有 mesh，便于统一更新
let sizeCache = { maxDim: 1 }; // 模型尺寸缓存

// 加载心脏
const loader = new THREE.OBJLoader();
loader.load(
  './models/heart_2.obj',
  (obj) => {
    // 居中模型
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    obj.position.sub(center);

    // 根据尺寸设置相机距离
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    sizeCache.maxDim = maxDim;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    let cameraZ = Math.abs(maxDim / (2 * Math.tan(fov / 2)));
    cameraZ *= 1.8; // 略后退
    camera.position.set(0, 0, cameraZ);
    camera.near = Math.max(0.01, cameraZ / 100);
    camera.far = cameraZ * 100;
    camera.updateProjectionMatrix();

    // 为每个 mesh 应用“心跳材质”并添加随机属性
    obj.traverse((c) => {
      if (c.isMesh) {
        c.geometry = addRandomAttribute(c.geometry);
        // 压缩位移幅度与模型尺寸成比例，取 1.5% 的最大维度
        const amp = maxDim * 0.015;
        c.material = makeBeatingMaterial(0xff3b3b, amp);
        heartMeshes.push(c);
      }
    });

    controls.target.set(0, 0, 0);
    controls.update();

    heart = obj;
    scene.add(heart);
    console.log('Heart loaded:', size);
  },
  undefined,
  (err) => {
    console.error('Failed to load ./models/heart_2.obj', err);
  }
);

// GSAP 心跳节律（双跳：lub-dub）
const beatState = { v: 0 }; // 0~1
const tl = gsap.timeline({ repeat: -1, defaults: { ease: 'power2.out' } });
// 典型心跳节律：快速强跳 -> 回落 -> 次级小跳 -> 回落 -> 休止
tl.to(beatState, { v: 1.0, duration: 0.12 })
  .to(beatState, { v: 0.0, duration: 0.18 })
  .to(beatState, { v: 0.65, duration: 0.10 })
  .to(beatState, { v: 0.0, duration: 0.26 })
  .to({},          {        duration: 0.60 }); // 休止间隔（心率约 70~80 BPM，可微调）

const clock = new THREE.Clock();

// 渲染循环
function animate() {
  requestAnimationFrame(animate);

  const t = clock.getElapsedTime();

  // 更新 shader uniform
  if (heartMeshes.length) {
    for (const m of heartMeshes) {
      const shader = m.material && m.material.userData && m.material.userData.shader;
      if (shader) {
        shader.uniforms.uTime.value = t;
        shader.uniforms.uBeat.value = beatState.v;
      }
    }
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

// 自适应
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  controls.handleResize();
});