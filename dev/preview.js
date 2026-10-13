// Developer tool: preview procedural models in isolation.
// Usage: npm run dev, then open /dev/preview.html?model=lucien&cos=default&action=idle&yaw=0
import * as THREE from 'three';
import { createHeroModel, createVillagerModel } from '../src/entities/models/CharacterModels.js';
import { createEnemyModel } from '../src/entities/models/EnemyModels.js';
const ENEMIES = ['crawler', 'crawler_big', 'knight', 'stalker', 'mage', 'countess'];
const make = (m) => ENEMIES.includes(m) ? createEnemyModel(m) : ['elda', 'tomas', 'aldric'].includes(m) ? createVillagerModel(m) : createHeroModel(m, q.get('cos') || 'default');

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1420);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 100);
const zoom = q.get('zoom') === 'face';
camera.position.set(0, zoom ? 1.68 : 1.1, zoom ? 0.9 : 4.6);
camera.lookAt(0, zoom ? 1.68 : 0.95, 0);
scene.add(new THREE.HemisphereLight(0x8a90b0, 0x301018, 1.2));
const key = new THREE.DirectionalLight(0xffeef0, 2.2);
key.position.set(2, 4, 3);
scene.add(key);
const rim = new THREE.DirectionalLight(0xff3050, 1.5);
rim.position.set(-3, 2, -3);
scene.add(rim);
const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 32), new THREE.MeshStandardMaterial({ color: 0x241c26 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const id = q.get('model') || 'lucien';
let model;
const list = (q.get('models') || '').split(',').filter(Boolean);
const models = [];
if (list.length) {
  list.forEach((m, i) => {
    const mm = make(m);
    mm.root.position.x = (i - (list.length - 1) / 2) * parseFloat(q.get('gap') || '1.1');
    scene.add(mm.root);
    models.push(mm);
  });
  const cd = parseFloat(q.get('cam') || '7.5');
  camera.position.set(0, 1.2 * cd / 7.5 + 0.3, cd);
  camera.lookAt(0, 1.0, 0);
} else {
  model = make(id);
  scene.add(model.root);
  models.push(model);
}
const yaw = parseFloat(q.get('yaw') || '0');
models.forEach((m) => (m.root.rotation.y = yaw));
const action = q.get('action');
const t = parseFloat(q.get('t') || '0.45');
const speed = parseFloat(q.get('speed') || '0');
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  models.forEach((m, i) => {
    const name = list[i] || id;
    if (ENEMIES.includes(name)) m.update(dt, { speed, action: action || 'idle', t });
    else m.update(dt, { speed, grounded: true, action: action ? { type: action, index: parseInt(q.get('index') || '0'), t } : null });
  });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__ready = true;
