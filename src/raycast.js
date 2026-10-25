import { isSolid } from './blocks.js';

// Voxel ray traversal (Amanatides & Woo). Returns the first solid block hit
// within maxDist, plus the empty cell just before it (for placing blocks).
export function raycastVoxel(world, origin, dir, maxDist = 6) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;

  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  const frac = (o, s) => (s > 0 ? Math.floor(o) + 1 - o : o - Math.floor(o));
  let tMaxX = dir.x !== 0 ? frac(origin.x, stepX) * tDeltaX : Infinity;
  let tMaxY = dir.y !== 0 ? frac(origin.y, stepY) * tDeltaY : Infinity;
  let tMaxZ = dir.z !== 0 ? frac(origin.z, stepZ) * tDeltaZ : Infinity;

  let prev = { x, y, z };
  let t = 0;
  while (t <= maxDist) {
    if (isSolid(world.getBlock(x, y, z))) {
      return { hit: { x, y, z }, prev, distance: t };
    }
    prev = { x, y, z };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      t = tMaxX;
      x += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxZ) {
      t = tMaxY;
      y += stepY;
      tMaxY += tDeltaY;
    } else {
      t = tMaxZ;
      z += stepZ;
      tMaxZ += tDeltaZ;
    }
  }
  return null;
}
