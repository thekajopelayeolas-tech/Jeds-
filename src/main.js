import * as THREE from 'three';
import { BLOCKS, HOTBAR_BLOCKS, canHarvest, breakSeconds, dropOf, isItem } from './blocks.js';
import { createAtlas } from './textures.js';
import { World } from './world.js';
import { Player } from './player.js';
import { raycastVoxel } from './raycast.js';
import { Inventory, HOTBAR_SIZE } from './inventory.js';
import { createUI, setAtlas } from './ui.js';
import { AnimalManager } from './mobs.js';

const RENDER_DISTANCE = 4;
const DAY_LENGTH = 300; // seconds for a full day/night cycle
const MOUSE_SENS = 0.002;
const REACH = 6;
const PLAYER_WIDTH = 0.6; // must match player.js
const PLAYER_HEIGHT = 1.8;

const app = document.getElementById('app');
const menu = document.getElementById('menu');
const infoEl = document.getElementById('info');
const deathEl = document.getElementById('death');

// ---- Renderer, scene, camera --------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.prepend(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';

const DAY_SKY = new THREE.Color(0x87ceeb);
const NIGHT_SKY = new THREE.Color(0x05071a);
const skyColor = new THREE.Color(DAY_SKY);
scene.background = skyColor;
scene.fog = new THREE.Fog(skyColor, 48, 80);

const sun = new THREE.DirectionalLight(0xffffff, 1);
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(sun, ambient);

// ---- World --------------------------------------------------------------
const atlas = createAtlas();
setAtlas(atlas);
const world = new World(scene, atlas, 1337);
const player = new Player(world);
const animals = new AnimalManager(scene, world);

// Pre-generate the spawn area so the player never starts in the void.
for (let i = 0; i < 120; i++) {
  world.streamChunks(8, 8, RENDER_DISTANCE);
  world.updateMeshes(8, 8, RENDER_DISTANCE);
}
player.spawn(8, 8);

// Wireframe outline on the targeted block.
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)),
  new THREE.LineBasicMaterial({ color: 0x000000 })
);
highlight.visible = false;
scene.add(highlight);

// ---- Day / night --------------------------------------------------------
let time = 0.25; // fraction of a day; 0.25 is sunrise

function updateSky() {
  const angle = time * Math.PI * 2;
  const sunHeight = Math.sin(angle); // 1 at noon, -1 at midnight
  const daylight = THREE.MathUtils.clamp(sunHeight * 1.5 + 0.35, 0.04, 1);
  skyColor.copy(NIGHT_SKY).lerp(DAY_SKY, daylight);
  scene.fog.color.copy(skyColor);
  sun.position.set(Math.cos(angle) * 100, Math.sin(angle) * 100, 40);
  sun.intensity = Math.max(0, sunHeight);
  ambient.intensity = 0.25 + 0.45 * daylight;
}

// ---- Inventory, hotbar, health -----------------------------------------
// Survival starts empty except for a few starter blocks. Creative mode gives
// unlimited blocks in the hotbar and disables damage.
const inventory = new Inventory();
for (const id of HOTBAR_BLOCKS) inventory.add(id, 16);
const ui = createUI(inventory);
let creative = false;
let selected = 0;

function selectSlot(i) {
  selected = (i + HOTBAR_SIZE) % HOTBAR_SIZE;
  ui.setSelected(selected);
}
selectSlot(0);

function heldStack() {
  return inventory.get(selected);
}

// ---- Input --------------------------------------------------------------
const keys = new Set();
let mouseLeft = false;

// The game runs whenever `playing` is true. Pointer lock is requested for
// smooth mouse look, but the game still works if the browser refuses it.
let playing = false;
let wasLocked = false;

function startPlaying() {
  playing = true;
  menu.classList.add('hidden');
  lastTime = performance.now();
  try {
    const request = canvas.requestPointerLock();
    if (request && request.catch) request.catch(() => {});
  } catch (_) {
    // Fallback: mouse movement still rotates the camera.
  }
}

function pausePlaying() {
  playing = false;
  keys.clear();
  mouseLeft = false;
  menu.classList.remove('hidden');
}

menu.addEventListener('click', startPlaying);

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) wasLocked = true;
  // Losing the lock (Esc) pauses the game and shows the menu again.
  if (!locked && wasLocked && playing) pausePlaying();
});

document.addEventListener('mousemove', (e) => {
  if (!playing) return;
  player.yaw -= e.movementX * MOUSE_SENS;
  player.pitch -= e.movementY * MOUSE_SENS;
  const limit = Math.PI / 2 - 0.01;
  player.pitch = Math.max(-limit, Math.min(limit, player.pitch));
});

let inventoryOpen = false;

function setInventoryOpen(open) {
  inventoryOpen = open;
  if (open) {
    ui.open();
    document.exitPointerLock?.();
    keys.clear();
    mouseLeft = false;
  } else {
    ui.close();
  }
}

window.addEventListener('keydown', (e) => {
  // Enter (or the numpad Enter) starts or resumes the game, same as clicking the menu.
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !playing && !e.repeat) {
    e.preventDefault();
    startPlaying();
    return;
  }
  if (e.code === 'KeyE' && !e.repeat && playing) {
    setInventoryOpen(!inventoryOpen);
    return;
  }
  keys.add(e.code);
  if (e.code === 'Escape' && inventoryOpen) return setInventoryOpen(false);
  if (e.code === 'Escape' && playing) pausePlaying();
  if (!e.repeat && e.code === 'KeyF' && creative) player.flying = !player.flying;
  if (!e.repeat && e.code === 'KeyG') {
    creative = !creative;
    player.flying = creative && player.flying;
  }
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit) selectSlot(Number(digit[1]) - 1);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// Clicking anywhere outside the inventory panel closes it.
window.addEventListener('mousedown', (e) => {
  if (!inventoryOpen) return;
  if (document.getElementById('inventory').contains(e.target)) return;
  setInventoryOpen(false);
});

canvas.addEventListener('mousedown', (e) => {
  if (inventoryOpen || !playing) return;
  if (e.button === 0) mouseLeft = true;
  if (e.button === 1) pickBlock();
  if (e.button === 2) placeBlock();
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseLeft = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('wheel', (e) => {
  if (!playing || inventoryOpen) return;
  selectSlot(selected + (e.deltaY > 0 ? 1 : -1));
});

// ---- Targeting, breaking, placing --------------------------------------
let target = null; // { hit, prev }

function updateTarget() {
  const eye = player.eyePosition();
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  const result = raycastVoxel(world, eye, dir, REACH);
  if (!result) {
    target = null;
    highlight.visible = false;
    return;
  }
  target = result;
  highlight.visible = true;
  highlight.position.set(result.hit.x + 0.5, result.hit.y + 0.5, result.hit.z + 0.5);
}

// Camera eye position and look direction, used for animal raycasts.
function eyeVec() {
  const e = player.eyePosition();
  return new THREE.Vector3(e.x, e.y, e.z);
}

function lookVec() {
  return new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
}

// Hitting an animal. Swords hit harder; hands do 1 damage. Killed animals drop meat.
const ATTACK_COOLDOWN = 0.4;
let attackTimer = 0;

function attackAnimal(animal) {
  if (attackTimer > 0) return;
  attackTimer = ATTACK_COOLDOWN;
  const held = heldStack() ? BLOCKS[heldStack().id] : null;
  const damage = held && held.tool === 'sword' ? held.damage / 2 : 1;
  const drop = animals.hit(animal, damage);
  if (drop !== null && inventory.canAdd(drop, 1)) inventory.add(drop, 1);
  ui.refresh();
}

// Survival mining: holding left click works on the targeted block until the
// progress bar fills. Progress resets when the target changes.
let mineProgress = 0;
let mineTarget = null; // "x,y,z" of the block being mined

function breakBlock(dt) {
  if (!target) return;
  const { x, y, z } = target.hit;
  const id = world.getBlock(x, y, z);
  if (!BLOCKS[id] || BLOCKS[id].liquid) return;

  // Creative breaks instantly and gives nothing back.
  if (creative) {
    world.setBlock(x, y, z, 0);
    ui.refresh();
    return;
  }

  const key = `${x},${y},${z}`;
  if (mineTarget !== key) {
    mineTarget = key;
    mineProgress = 0;
  }
  const tool = heldStack() ? BLOCKS[heldStack().id] : null;
  mineProgress += dt / breakSeconds(id, tool && tool.item ? tool : null);
  ui.setMining(mineProgress);
  if (mineProgress < 1) return;

  mineProgress = 0;
  mineTarget = null;
  ui.setMining(0);
  // Wrong tool: the block still breaks but drops nothing.
  const drop = canHarvest(id, tool && tool.item ? tool : null) ? dropOf(id) : null;
  if (drop !== null && !inventory.canAdd(drop, 1)) return; // no room: block stays
  if (drop !== null) inventory.add(drop, 1);
  world.setBlock(x, y, z, 0);
  ui.refresh();
}

function placeBlock() {
  if (!target) return;
  const { x, y, z } = target.prev;
  const stack = heldStack();
  if (!stack || stack.count <= 0) return;
  const id = stack.id;
  // Tools and materials are items, not blocks, so they cannot be placed.
  if (isItem(id)) return;
  if (world.getBlock(x, y, z) !== 0) return;

  // Do not place a block inside the player's own body.
  const p = player.pos;
  const half = PLAYER_WIDTH / 2;
  const overlaps =
    x + 1 > p.x - half && x < p.x + half &&
    z + 1 > p.z - half && z < p.z + half &&
    y + 1 > p.y && y < p.y + PLAYER_HEIGHT;
  if (overlaps) return;

  world.setBlock(x, y, z, id);
  // Creative stacks are infinite; survival stacks shrink by one.
  if (!creative) inventory.consume(selected);
  ui.refresh();
}

// Shown after death. Click to respawn with full health at the spawn point.
function showDeath() {
  if (deathEl.classList.contains('hidden')) {
    deathEl.classList.remove('hidden');
    document.exitPointerLock?.();
  }
}

deathEl.addEventListener('click', () => {
  player.respawn();
  deathEl.classList.add('hidden');
  startPlaying();
});

function pickBlock() {
  if (!target) return;
  const id = world.getBlock(target.hit.x, target.hit.y, target.hit.z);
  if (creative) {
    // Creative: middle click fills the hotbar slot with the targeted block.
    if (BLOCKS[id] && id !== 0) inventory.slots[selected] = { id, count: 64 };
    ui.refresh();
    return;
  }
  // Survival: switch to the first matching stack in the hotbar.
  const idx = inventory.slots.findIndex((s, i) => i < HOTBAR_SIZE && s && s.id === id);
  if (idx >= 0) selectSlot(idx);
}

// ---- Main loop ----------------------------------------------------------
// Dev-only handle for browser tests (stripped from production builds).
if (import.meta.env.DEV) {
  window.__mc = {
    world,
    player,
    inventory,
    animals,
    get target() { return target; },
    spawnAt: (type, x, y, z) => animals.spawnAt(type, x, y, z),
    probe: () => animals.targetAt(eyeVec(), lookVec(), REACH),
    attack: () => { const h = animals.targetAt(eyeVec(), lookVec(), REACH); if (h) attackAnimal(h.animal); return !!h; },
  };
}

let lastTime = performance.now();
let fpsTimer = 0;
let frames = 0;
let fps = 0;

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const active = playing;

  if (active && player.dead) {
    showDeath();
  } else if (active) {
    const move = {
      forward: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
      strafe: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
    };
    if (!creative) player.flying = false;
    player.update(dt, move, keys.has('Space'), keys.has('ControlLeft'), keys.has('ShiftLeft'));
    ui.renderHealth(player.health, player.maxHealth);

    attackTimer -= dt;
    animals.update(dt, player.pos);

    // Hold left click to mine the targeted block, or hit an animal in front of you.
    if (mouseLeft) {
      updateTarget();
      const hitMob = animals.targetAt(eyeVec(), lookVec(), REACH);
      // target.distance is the ray distance to the block; the block ray stops at
      // the first solid block, so an animal behind a wall is not hit.
      const blockDist = target ? target.distance : Infinity;
      if (hitMob && hitMob.distance <= blockDist) {
        attackAnimal(hitMob.animal);
        mouseLeft = false; // one swing per click
      } else {
        breakBlock(dt);
      }
    } else {
      mineProgress = 0;
      mineTarget = null;
      ui.setMining(0);
    }
  }

  // Camera follows player eyes.
  const eye = player.eyePosition();
  camera.position.set(eye.x, eye.y, eye.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  if (active) updateTarget();

  time = (time + dt / DAY_LENGTH) % 1;
  updateSky();

  // Stream chunks as the player moves.
  world.streamChunks(player.pos.x, player.pos.z, RENDER_DISTANCE);
  world.updateMeshes(player.pos.x, player.pos.z, RENDER_DISTANCE);

  renderer.render(scene, camera);

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fps = Math.round(frames / fpsTimer);
    frames = 0;
    fpsTimer = 0;
    updateHud();
  }
  requestAnimationFrame(frame);
}

function updateHud() {
  const p = player.pos;
  const hour = Math.floor(time * 24);
  const minute = Math.floor((time * 24 * 60) % 60);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  infoEl.textContent =
    `FPS ${fps}\n` +
    `XYZ ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}\n` +
    `Time ${hh}:${mm}${player.flying ? '\nFlying' : ''}`;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

frame();
