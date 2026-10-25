import * as THREE from 'three';
import { BLOCKS } from './blocks.js';

// Procedural 16x16 pixel-art atlas. Each block has up to 3 tiles:
// 0 = top, 1 = side, 2 = bottom. Tile index = id * 3 + face.
const TILE = 16;
const COLS = 8;
const MAX_ID = 15; // placeable blocks only; items are drawn as icons below
const ROWS = Math.ceil(((MAX_ID + 1) * 3) / COLS);

// Small deterministic RNG (xorshift32) so the atlas is identical every load.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function hexToRgb(c) {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

function drawTile(data, ox, oy, id, face) {
  const b = BLOCKS[id];
  const base = face === 0 ? b.top : face === 2 ? b.bottom : b.side;
  const [r, g, bl] = hexToRgb(base);
  const R = rng(id * 31 + face * 7 + 1);
  const noiseAmp = id === 3 || id === 4 || id === 13 || id === 14 || id === 15 ? 0.3 : id === 8 ? 0.25 : 0.18;

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let tint = 1 + (R() - 0.5) * noiseAmp;
      let rr = r;
      let gg = g;
      let bb = bl;
      let alpha = 255;

      if (id === 1 && face === 1) {
        // Grass block side: green fringe over the top rows.
        if (y < 3 || (y === 3 && R() < 0.5)) {
          [rr, gg, bb] = hexToRgb(0x5fb83a);
        }
      } else if (id === 6 && face === 1) {
        // Oak log bark: vertical grooves.
        tint *= x % 4 === 0 ? 0.8 : 1.05;
      } else if (id === 6 && face === 0) {
        // Oak log end grain: rings.
        const d = Math.hypot(x - 7.5, y - 7.5);
        tint *= 1 + 0.12 * Math.sin(d * 2.2);
      } else if (id === 7) {
        // Planks: horizontal seams.
        if (y % 4 === 0) tint *= 0.8;
      } else if (id === 8) {
        // Leaves: cutout holes.
        if (R() < 0.22) alpha = 0;
      } else if (id === 9) {
        // Water: gentle ripples.
        tint = 1 + 0.06 * Math.sin(x * 0.9 + y * 0.5);
      } else if (id === 10) {
        // Glass: thin frame, open center.
        const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
        if (edge) {
          [rr, gg, bb] = hexToRgb(0xdfefff);
        } else {
          alpha = 0;
        }
      } else if (id === 11) {
        // Bricks: staggered mortar lines.
        const row = Math.floor(y / 4);
        const offset = (row % 2) * 4;
        if (y % 4 === 3 || (x + offset) % 8 === 7) {
          [rr, gg, bb] = hexToRgb(0xb8b0a0);
          tint = 1 + (R() - 0.5) * 0.1;
        }
      } else if (id === 14 || id === 15) {
        // Iron and diamond ore: stone with scattered ore flecks.
        if (R() < 0.14) [rr, gg, bb] = hexToRgb(id === 14 ? 0xd9a07a : 0x5ee6e0);
      }

      const i = (y * TILE + x) * 4;
      data[i] = Math.min(255, rr * tint);
      data[i + 1] = Math.min(255, gg * tint);
      data[i + 2] = Math.min(255, bb * tint);
      data[i + 3] = alpha;
    }
  }
}

export function createAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
  const ctx = canvas.getContext('2d');

  for (let id = 1; id <= MAX_ID; id++) {
    for (let face = 0; face < 3; face++) {
      const index = id * 3 + face;
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      const img = ctx.createImageData(TILE, TILE);
      drawTile(img.data, 0, 0, id, face);
      ctx.putImageData(img, col * TILE, row * TILE);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  // Returns [u0, v0, u1, v1] for a block face. Half-texel inset avoids bleeding.
  const inset = 0.5 / canvas.width;
  function uvFor(id, face) {
    const index = id * 3 + face;
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const u0 = (col * TILE) / canvas.width + inset;
    const u1 = ((col + 1) * TILE) / canvas.width - inset;
    const v0 = 1 - ((row + 1) * TILE) / canvas.height + inset;
    const v1 = 1 - (row * TILE) / canvas.height - inset;
    return [u0, v0, u1, v1];
  }

  // Pixel rectangle of a block face inside the atlas canvas (for 2D icons).
  function tileRect(id, face) {
    const index = id * 3 + face;
    return { sx: (index % COLS) * TILE, sy: Math.floor(index / COLS) * TILE, size: TILE };
  }

  return { texture, uvFor, canvas, tileRect };
}
