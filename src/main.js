import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import URDFLoader from 'urdf-loader';
import { LampBody, armPose, aimAt } from './robot.js';
import { Character } from './character.js';
import { Perception } from './perception.js';
import { Sound } from './sound.js';
import { Voice } from './voice.js';

let body;
let character;
let last = performance.now();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x16181d);

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 20);
camera.position.set(-2.01, 0.40, 0.73);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.3, 0);

const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;top:12px;left:12px;color:#fff;font:600 20px sans-serif;z-index:2;background:#0008;padding:8px 12px;border-radius:8px';
document.body.appendChild(hud);

const video = document.createElement('video');
video.muted = true;
video.playsInline = true;
video.style.cssText = 'position:fixed;bottom:12px;left:12px;width:240px;border-radius:8px;transform:scaleX(-1);z-index:2';
document.body.appendChild(video);

const perception = new Perception();
perception.start(video).catch((err) => console.error('camera/model failed:', err));

scene.add(new THREE.AmbientLight(0xffffff, 0.25));
const sun = new THREE.DirectionalLight(0xffffff, 0.5);
sun.position.set(1, 2, 1);
scene.add(sun);
scene.add(new THREE.GridHelper(2, 20));

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 4),
  new THREE.MeshStandardMaterial({ color: 0x2a2d35 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.001;
scene.add(floor);

const sound = new Sound();
const voice = new Voice();
const startBtn = document.createElement('button');
startBtn.textContent = 'Start';
startBtn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:3;font:600 16px sans-serif;padding:10px 18px;border-radius:8px;border:0;cursor:pointer';
startBtn.onclick = () => {
  sound.start();
  speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  startBtn.remove();
};
document.body.appendChild(startBtn);

let robot;
new URDFLoader().load('/robot/dummy_lamp_5dof.urdf', (r) => {
  robot = r;
  robot.rotation.x = -Math.PI / 2;
  scene.add(robot);
  body = new LampBody(robot);
  body.setLight('#ffd9a0', 6);
  character = new Character(body, play, sound, voice, captureFrame);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

addEventListener('keydown', (e) => {
  if (e.key !== 'p') return;
  const p = camera.position, t = controls.target;
  console.log(
    `camera.position.set(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)});\n` +
    `controls.target.set(${t.x.toFixed(2)}, ${t.y.toFixed(2)}, ${t.z.toFixed(2)});`
  );
});

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (body) body.update(dt);
  if (character) character.update(now);
  const p = perception.detect();
  if (character) {
    character.setAttention(p.facing);
    hud.textContent = `${character.state} | facing: ${p.facing} | yaw: ${p.yaw.toFixed(2)} | size: ${p.size.toFixed(2)}`;
  }
  controls.update();
  renderer.render(scene, camera);
});

function captureFrame() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = Math.round(640 * video.videoHeight / video.videoWidth);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7).split(',')[1];   // base64 without the prefix
}

let sequenceId = 0;
async function play(steps, { loop = false } = {}) {
  const id = ++sequenceId;
  do {
    for (const step of steps) {
      if (id !== sequenceId) return;
      body.setPose(step.pose);
      await new Promise((r) => setTimeout(r, step.ms));
    }
  } while (loop && id === sequenceId);
}

addEventListener('keydown', (e) => {
  if (!body) return;
  const spots = { l: [0.15, 0.5], c: [0.5, 0.5], r: [0.85, 0.5], u: [0.5, 0.15], d: [0.5, 0.85] };
  if (spots[e.key]) {
    sequenceId++;                       // stop the state machine's pose for this test
    body.setPose(aimAt(...spots[e.key]));
  }
});

window.lampMetrics = () => {
  const by = {};
  for (const m of character.metrics) (by[m.kind] ??= []).push(m.ms);
  for (const [kind, v] of Object.entries(by)) {
    v.sort((a, b) => a - b);
    console.log(`${kind}: n=${v.length}, median=${v[Math.floor(v.length / 2)]} ms, worst=${v[v.length - 1]} ms`);
  }
};