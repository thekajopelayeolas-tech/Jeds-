import * as THREE from 'three';
import { BLOCKS, isTransparent } from './blocks.js';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 64;
export const SEA_LEVEL = 20;

// ---- Deterministic noise -------------------------------------------------
function hash2(x, z, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function fbm(x, z, seed) {
  let total = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < 4; i++) {
    total += valueNoise(x * freq, z * freq, seed + i) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / norm;
}

// ---- Chunk ---------------------------------------------------------------
class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    this.mesh = null;
    this.dirty = true;
  }

  index(x, y, z) {
    return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
  }

  get(x, y, z) {
    return this.data[this.index(x, y, z)];
  }

  set(x, y, z, id) {
    this.data[this.index(x, y, z)] = id;
  }
}

// ---- World ---------------------------------------------------------------
export class World {
  constructor(scene, atlas, seed = 1337) {
    this.scene = scene;
    this.atlas = atlas;
    this.seed = seed;
    this.chunks = new Map();
    this.material = new THREE.MeshLambertMaterial({
      map: atlas.texture,
      alphaTest: 0.5,
      side: THREE.FrontSide,
    });
  }

  key(cx, cz) {
    return cx + ',' + cz;
  }

  chunkAt(cx, cz) {
    return this.chunks.get(this.key(cx, cz));
  }

  // World coordinates -> block id (0 for out of range or unloaded).
  getBlock(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunkAt(cx, cz);
    if (!chunk) return 0;
    return chunk.get(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE);
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunkAt(cx, cz);
    if (!chunk) return false;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    chunk.set(lx, y, lz, id);
    chunk.dirty = true;
    // Border edits affect the neighbouring chunk's faces too.
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  markDirty(cx, cz) {
    const c = this.chunkAt(cx, cz);
    if (c) c.dirty = true;
  }

  // Generates a chunk's terrain (blocks only, no meshing).
  generateChunk(cx, cz) {
    const chunk = new Chunk(cx, cz);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const heights = new Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const wz = baseZ + z;
        const n = fbm(wx / 48, wz / 48, this.seed);
        const detail = valueNoise(wx / 12, wz / 12, this.seed + 9) - 0.5;
        const h = Math.max(4, Math.min(CHUNK_HEIGHT - 12, Math.floor(18 + n * 26 + detail * 4)));
        heights[z * CHUNK_SIZE + x] = h;

        const beach = h <= SEA_LEVEL + 1;
        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) {
            id = 3; // bedrock stand-in
          } else if (y === h) {
            if (beach) id = 5; // sand near water
            else if (h > 40) id = 12; // snow caps
            else id = 1; // grass
          } else if (y > h - 4) {
            id = beach ? 5 : 2; // dirt layer
          } else {
            const r = hash2(wx * 3 + y, wz * 5 + y, this.seed + 77);
            const r2 = hash2(wx * 13 + y * 7, wz * 17 + y * 3, this.seed + 91);
            // Ore: diamonds are rare and deep, iron is more common higher up.
            if (y <= 14 && r2 < 0.0006) id = 15;
            else if (y <= 36 && r2 < 0.002) id = 14;
            else id = r < 0.04 ? 13 : r < 0.08 ? 4 : 3; // gravel/cobble pockets
          }
          chunk.set(x, y, z, id);
        }
        // Fill water up to sea level.
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          chunk.set(x, y, z, 9);
        }
      }
    }

    this.placeTrees(chunk, heights);
    this.chunks.set(this.key(cx, cz), chunk);
    return chunk;
  }

  // Places oak trees. Only columns well inside the chunk are used so
  // leaves never cross chunk borders.
  placeTrees(chunk, heights) {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    for (let z = 3; z < CHUNK_SIZE - 3; z++) {
      for (let x = 3; x < CHUNK_SIZE - 3; x++) {
        const wx = baseX + x;
        const wz = baseZ + z;
        if (hash2(wx, wz, this.seed + 5) > 0.02) continue;
        const h = heights[z * CHUNK_SIZE + x];
        if (h <= SEA_LEVEL + 1 || h > 40) continue;

        const trunk = 4 + Math.floor(hash2(wx, wz, this.seed + 6) * 2);
        for (let y = 1; y <= trunk; y++) chunk.set(x, h + y, z, 6);

        const top = h + trunk;
        for (let dy = -2; dy <= 1; dy++) {
          const rad = dy >= 0 ? 1 : 2;
          for (let dz = -rad; dz <= rad; dz++) {
            for (let dx = -rad; dx <= rad; dx++) {
              if (Math.abs(dx) === rad && Math.abs(dz) === rad && dy >= 0) continue;
              const lx = x + dx;
              const lz = z + dz;
              const ly = top + dy;
              const existing = chunk.get(lx, ly, lz);
              if (existing === 0 || existing === 9) chunk.set(lx, ly, lz, 8);
            }
          }
        }
        chunk.set(x, top + 2, z, 8);
      }
    }
  }

  // Builds the geometry for a chunk. Faces hidden by an opaque neighbour
  // (or by the same see-through block) are skipped.
  buildMesh(chunk) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    let vertCount = 0;

    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    // Each face: normal, four corners (counter-clockwise), atlas face index.
    const FACES = [
      { n: [1, 0, 0], face: 1, c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
      { n: [-1, 0, 0], face: 1, c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
      { n: [0, 1, 0], face: 0, c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
      { n: [0, -1, 0], face: 2, c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
      { n: [0, 0, 1], face: 1, c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
      { n: [0, 0, -1], face: 1, c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
    ];

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = chunk.get(x, y, z);
          if (id === 0) continue;
          const wx = baseX + x;
          const wz = baseZ + z;

          for (const f of FACES) {
            const nid = this.getBlock(wx + f.n[0], y + f.n[1], wz + f.n[2]);
            if (!isTransparent(nid)) continue;
            if (nid === id && BLOCKS[id].transparent) continue;

            const [u0, v0, u1, v1] = this.atlas.uvFor(id, f.face);
            const uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
            for (let i = 0; i < 4; i++) {
              const c = f.c[i];
              positions.push(x + c[0], y + c[1], z + c[2]);
              normals.push(f.n[0], f.n[1], f.n[2]);
              uvs.push(uv[i][0], uv[i][1]);
            }
            indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
            vertCount += 4;
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }

  // Re-meshes dirty chunks near the player, limited per frame to keep FPS smooth.
  updateMeshes(px, pz, renderDistance) {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    let budget = 3;

    for (const chunk of this.chunks.values()) {
      if (!chunk.dirty || budget <= 0) continue;
      const dist = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz));
      if (dist > renderDistance) continue;

      if (chunk.mesh) {
        this.scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        chunk.mesh = null;
      }
      const geo = this.buildMesh(chunk);
      if (geo.getAttribute('position').count > 0) {
        chunk.mesh = new THREE.Mesh(geo, this.material);
        chunk.mesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
        this.scene.add(chunk.mesh);
      }
      chunk.dirty = false;
      budget--;
    }
  }

  // Generates missing chunks around the player and unloads distant ones.
  streamChunks(px, pz, renderDistance) {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    const load = renderDistance + 1;

    // Collect missing chunks, nearest first, so the spawn area loads first.
    const missing = [];
    for (let dz = -load; dz <= load; dz++) {
      for (let dx = -load; dx <= load; dx++) {
        if (!this.chunkAt(pcx + dx, pcz + dz)) {
          missing.push({ cx: pcx + dx, cz: pcz + dz, d: dx * dx + dz * dz });
        }
      }
    }
    missing.sort((a, b) => a.d - b.d);

    for (const { cx, cz } of missing.slice(0, 2)) {
      this.generateChunk(cx, cz);
      this.markDirty(cx, cz);
      this.markDirty(cx - 1, cz);
      this.markDirty(cx + 1, cz);
      this.markDirty(cx, cz - 1);
      this.markDirty(cx, cz + 1);
    }

    for (const [k, chunk] of this.chunks) {
      if (Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz)) > load + 1) {
        if (chunk.mesh) {
          this.scene.remove(chunk.mesh);
          chunk.mesh.geometry.dispose();
        }
        this.chunks.delete(k);
      }
    }
  }

  // Highest non-water block in a column, used for spawning.
  surfaceHeight(x, z) {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const id = this.getBlock(x, y, z);
      if (id !== 0 && id !== 9) return y;
    }
    return 0;
  }
}
