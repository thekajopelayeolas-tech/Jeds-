// Headless sanity check for world generation, collision, and raycasting.
import { World } from '../src/world.js';
import { Player } from '../src/player.js';
import { raycastVoxel } from '../src/raycast.js';
import { isSolid } from '../src/blocks.js';

const atlas = { texture: null, uvFor: () => [0, 0, 1, 1] };
const scene = { add() {}, remove() {} };
const world = new World(scene, atlas, 1337);
for (let i = 0; i < 30; i++) {
  world.streamChunks(8, 8, 4);
  world.updateMeshes(8, 8, 4);
}
console.log('chunks loaded:', world.chunks.size);

const player = new Player(world);
player.spawn(8, 8);
console.log('spawn pos:', player.pos);
for (let i = 0; i < 300; i++) player.update(1 / 60, { forward: 0, strafe: 0 }, false, false, false);
console.log('settled y:', player.pos.y.toFixed(3), 'onGround:', player.onGround);

const hit = raycastVoxel(world, player.eyePosition(), { x: 0, y: -1, z: 0 }, 10);
const ok = !!hit && isSolid(world.getBlock(hit.hit.x, hit.hit.y, hit.hit.z));
console.log('ray down hits solid ground:', ok);
if (!player.onGround || !ok) process.exitCode = 1;
