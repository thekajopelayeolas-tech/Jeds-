import * as THREE from 'three';
import { isSolid } from './blocks.js';
import { CHUNK_SIZE } from './world.js';

// Passive animals. Each is a small blocky model built from three.js boxes.
// Animals spawn on grass near the player, wander, and despawn when far away.
const MAX_ANIMALS = 14;
const SPAWN_MIN = 12; // blocks from the player
const SPAWN_MAX = 26;
const DESPAWN_DIST = 48;
const SPAWN_INTERVAL = 2.5; // seconds between spawn attempts
const HURT_TIME = 0.25;
const WALKABLE = new Set([1, 2, 5, 12]); // grass, dirt, sand, snow

// Shared dimensions. Feet sit at y = 0; legs are the bottom LEG_H.
const LEG_H = 0.4;
const BODY_H = 0.6;
const BODY_W = 0.7;
const BODY_L = 1.0;

export const ANIMAL_TYPES = {
  pig: { name: 'Pig', body: 0xf0a3a3, head: 0xf0a3a3, hp: 10, drop: 25, speed: 1.1 },
  cow: { name: 'Cow', body: 0xf2f2f2, head: 0x6b4a2e, hp: 10, drop: 25, speed: 0.9 },
};

// Builds the blocky model and returns { group, mats } for hurt flashing.
function buildModel(type) {
  const def = ANIMAL_TYPES[type];
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: def.body });
  const headMat = new THREE.MeshLambertMaterial({ color: def.head });
  const legMat = new THREE.MeshLambertMaterial({ color: type === 'cow' ? 0x3a2a1a : def.body });
  const mats = [bodyMat, headMat, legMat];

  const box = (w, h, l, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  // Body sits on the legs. The head is at the front (-Z).
  box(BODY_W, BODY_H, BODY_L, bodyMat, 0, LEG_H + BODY_H / 2, 0);
  box(0.5, 0.5, 0.5, headMat, 0, LEG_H + BODY_H * 0.8, -BODY_L / 2 - 0.2);
  for (const [lx, lz] of [[-0.22, -0.35], [0.22, -0.35], [-0.22, 0.35], [0.22, 0.35]]) {
    box(0.18, LEG_H, 0.18, legMat, lx, LEG_H / 2, lz);
  }
  if (type === 'cow') {
    // A dark patch on the back gives the cow its spots.
    box(0.3, 0.02, 0.3, headMat, 0.2, LEG_H + BODY_H + 0.01, 0.2);
  }
  return { group, mats };
}

class Animal {
  constructor(type, scene, x, y, z) {
    this.type = type;
    this.def = ANIMAL_TYPES[type];
    this.hp = this.def.hp;
    this.pos = { x, y, z };
    this.yaw = Math.random() * Math.PI * 2;
    this.walkTimer = Math.random() * 2;
    this.heading = null; // unit direction while walking, null while idle
    this.hurt = 0;
    this.scene = scene;
    const { group, mats } = buildModel(type);
    this.group = group;
    this.mats = mats;
    // Every mesh points back at this animal so the raycast can find it.
    this.group.traverse((o) => (o.userData.animal = this));
    scene.add(group);
  }

  // Walkable surface height under (x, z), or null if it is not safe to stand there.
  groundAt(world, x, z) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    if (!world.chunkAt(Math.floor(bx / CHUNK_SIZE), Math.floor(bz / CHUNK_SIZE))) return null;
    const top = world.surfaceHeight(bx, bz);
    if (!WALKABLE.has(world.getBlock(bx, top, bz))) return null;
    return top + 1;
  }

  update(dt, world) {
    if (this.hurt > 0) {
      this.hurt -= dt;
      for (const m of this.mats) m.emissive.setHex(this.hurt > 0 ? 0x661010 : 0x000000);
    }

    // Wander: pick a new heading every few seconds, walk, then idle.
    this.walkTimer -= dt;
    if (this.walkTimer <= 0) {
      this.walkTimer = 2 + Math.random() * 4;
      if (Math.random() < 0.6) {
        this.yaw = Math.random() * Math.PI * 2;
        this.heading = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
      } else {
        this.heading = null;
      }
    }

    if (this.heading) {
      const step = this.def.speed * dt;
      const nx = this.pos.x + this.heading.x * step;
      const nz = this.pos.z + this.heading.z * step;
      const y = this.groundAt(world, nx, nz);
      // Turn around at water, walls, cliffs, or unloaded chunks.
      if (y === null || Math.abs(y - this.pos.y) > 1) {
        this.heading = null;
        this.walkTimer = 0.5;
      } else {
        this.pos.x = nx;
        this.pos.z = nz;
        this.pos.y = y;
      }
    }

    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.heading ? Math.atan2(-this.heading.x, -this.heading.z) : this.yaw;
  }

  remove() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
  }
}

export class AnimalManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.animals = [];
    this.spawnTimer = 0;
  }

  // Tries one random spot near the player. Animals only appear on grass.
  trySpawn(px, pz) {
    const angle = Math.random() * Math.PI * 2;
    const dist = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    const bx = Math.floor(px + Math.cos(angle) * dist);
    const bz = Math.floor(pz + Math.sin(angle) * dist);
    if (!this.world.chunkAt(Math.floor(bx / CHUNK_SIZE), Math.floor(bz / CHUNK_SIZE))) return;
    const top = this.world.surfaceHeight(bx, bz);
    if (this.world.getBlock(bx, top, bz) !== 1) return; // grass only
    const type = Math.random() < 0.5 ? 'pig' : 'cow';
    this.animals.push(new Animal(type, this.scene, bx + 0.5, top + 1, bz + 0.5));
  }

  // Places an animal at an exact spot (used by browser tests).
  spawnAt(type, x, y, z) {
    const animal = new Animal(type, this.scene, x, y, z);
    this.animals.push(animal);
    return animal;
  }

  update(dt, player) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_INTERVAL;
      if (this.animals.length < MAX_ANIMALS) this.trySpawn(player.x, player.z);
    }

    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      const far = Math.hypot(a.pos.x - player.x, a.pos.z - player.z) > DESPAWN_DIST;
      if (far || a.hp <= 0) {
        a.remove();
        this.animals.splice(i, 1);
        continue;
      }
      a.update(dt, this.world);
    }
  }

  // Returns { animal, distance } for the nearest animal along the ray, or null.
  targetAt(origin, dir, reach) {
    const ray = new THREE.Raycaster(origin, dir, 0, reach);
    const hit = ray.intersectObjects(this.animals.map((a) => a.group), true)[0];
    if (!hit || !hit.object.userData.animal) return null;
    return { animal: hit.object.userData.animal, distance: hit.distance };
  }

  // Deals damage. Returns the drop item id if the animal died, otherwise null.
  // Dropping the meat is handled by the caller so it can respect inventory space.
  hit(animal, amount) {
    animal.hp -= amount;
    animal.hurt = HURT_TIME;
    if (animal.hp > 0) return null;
    animal.hp = 0;
    return animal.def.drop;
  }
}
