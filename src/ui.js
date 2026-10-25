import { BLOCKS } from './blocks.js';
import { Inventory, HOTBAR_SIZE, INVENTORY_SIZE, matchRecipe, craft } from './inventory.js';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// Icon size in CSS pixels. Each atlas tile is 16 px, drawn at 2x.
const ICON = 32;

// Draws a block as a small isometric cube, like Minecraft's inventory icons.
// Top, left, and right faces come from the atlas textures.
function drawBlockIcon(ctx, atlas, id) {
  const faces = [
    { face: 0, shade: 1.0, pts: [[16, 2], [30, 9], [16, 16], [2, 9]] }, // top
    { face: 1, shade: 0.8, pts: [[2, 9], [16, 16], [16, 30], [2, 23]] }, // left
    { face: 1, shade: 0.6, pts: [[30, 9], [16, 16], [16, 30], [30, 23]] }, // right
  ];
  for (const f of faces) {
    const r = atlas.tileRect(id, f.face);
    ctx.save();
    ctx.beginPath();
    f.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip();
    // Map the texture square onto the parallelogram of this face.
    const [a, b, , d] = f.pts;
    ctx.transform(
      (b[0] - a[0]) / r.size, (b[1] - a[1]) / r.size,
      (d[0] - a[0]) / r.size, (d[1] - a[1]) / r.size,
      a[0], a[1]
    );
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas.canvas, r.sx, r.sy, r.size, r.size, 0, 0, r.size, r.size);
    ctx.restore();
    // Darken side faces for depth.
    ctx.save();
    ctx.beginPath();
    f.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = `rgba(0,0,0,${1 - f.shade})`;
    ctx.fill();
    ctx.restore();
  }
}

// Draws a flat pixel-art tool or material icon from its color.
function drawItemIcon(ctx, def) {
  const c = hex(def.color);
  ctx.fillStyle = c;
  if (def.tool === 'pickaxe') {
    // Handle diagonal from bottom-left, head across the top.
    ctx.fillStyle = '#6b4f2a';
    for (let i = 0; i < 12; i++) ctx.fillRect(6 + i, 26 - i, 3, 3);
    ctx.fillStyle = c;
    ctx.fillRect(4, 6, 24, 4);
    ctx.fillRect(4, 6, 4, 8);
    ctx.fillRect(24, 6, 4, 8);
  } else if (def.tool === 'sword') {
    ctx.fillStyle = '#6b4f2a';
    for (let i = 0; i < 8; i++) ctx.fillRect(4 + i, 28 - i, 3, 3);
    ctx.fillStyle = c;
    for (let i = 0; i < 16; i++) ctx.fillRect(12 + i, 20 - i, 3, 3);
  } else if (def.name === 'Stick') {
    ctx.fillStyle = c;
    for (let i = 0; i < 18; i++) ctx.fillRect(6 + i, 26 - i, 3, 3);
  } else {
    // Raw materials: a small rounded nugget.
    ctx.beginPath();
    ctx.arc(16, 16, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Canvas with the icon for an item or block id. Created once per stack paint.
let atlasRef = null;
export function setAtlas(atlas) {
  atlasRef = atlas;
}

function iconFor(id) {
  const canvas = document.createElement('canvas');
  canvas.width = ICON;
  canvas.height = ICON;
  const ctx = canvas.getContext('2d');
  const def = BLOCKS[id];
  if (!def) return canvas;
  if (def.item) drawItemIcon(ctx, def);
  else if (atlasRef) drawBlockIcon(ctx, atlasRef, id);
  return canvas;
}

function makeSlot(keyLabel = '') {
  const el = document.createElement('div');
  el.className = 'slot';
  el.innerHTML = `<span class="key">${keyLabel}</span><div class="swatch"></div><span class="count"></span>`;
  return el;
}

// Draws a stack (or an empty slot) inside a slot element.
function paint(el, stack, active = false) {
  el.classList.toggle('active', active);
  const swatch = el.querySelector('.swatch');
  const iconId = stack ? stack.id : null;
  if (iconId === null) {
    swatch.replaceChildren();
  } else if (swatch.dataset.id !== String(iconId)) {
    // Only redraw the icon when the item type changes.
    swatch.replaceChildren(iconFor(iconId));
    swatch.dataset.id = String(iconId);
  }
  if (iconId === null) swatch.dataset.id = '';
  el.querySelector('.count').textContent = stack && stack.count > 1 ? String(stack.count) : '';
  // Hovering a slot shows its item name and count.
  el.title = stack ? `${BLOCKS[stack.id].name} x${stack.count}` : '';
}

// Readable name for an item id, used in labels.
const itemName = (id) => (BLOCKS[id] ? BLOCKS[id].name : 'Unknown');

export function createUI(inventory) {
  const hotbarEl = document.getElementById('hotbar');
  const healthEl = document.getElementById('health');
  const invEl = document.getElementById('inventory');
  const mainEl = document.getElementById('inv-main');
  const rowEl = document.getElementById('inv-hotbar');
  const craftEl = document.getElementById('inv-craft');
  const outEl = document.getElementById('inv-output');
  const heldEl = document.getElementById('held');
  const contentsEl = document.getElementById('inv-contents');
  const craftLabelEl = document.getElementById('craft-label');
  const miningEl = document.getElementById('mining');
  const miningFillEl = miningEl.firstElementChild;

  const craftGrid = new Array(9).fill(null);
  let cursor = null; // stack held by the mouse while the inventory is open
  let selected = 0;
  let shownHealth = null;

  const cursorEl = makeSlot();
  cursorEl.classList.add('floating');
  cursorEl.style.display = 'none';
  document.getElementById('app').appendChild(cursorEl);

  function refresh() {
    hotbarSlots.forEach((el, i) => paint(el, inventory.get(i), i === selected));
    rowSlots.forEach((el, i) => paint(el, inventory.get(i), i === selected));
    mainSlots.forEach((el, k) => paint(el, inventory.get(HOTBAR_SIZE + k)));
    craftSlots.forEach((el, i) => paint(el, craftGrid[i]));
    const recipe = matchRecipe(craftGrid);
    paint(outSlot, recipe ? recipe.output : null);
    craftLabelEl.textContent = recipe
      ? `Result: ${itemName(recipe.output.id)} x${recipe.output.count}`
      : 'Put ingredients in the 3x3 grid';

    // Name of the item in the selected hotbar slot, shown above the hotbar.
    const held = inventory.get(selected);
    heldEl.textContent = held ? `${itemName(held.id)} x${held.count}` : 'Empty hand';

    // Plain-text list of everything in the inventory, with totals per item.
    const totals = new Map();
    for (const s of inventory.slots) if (s) totals.set(s.id, (totals.get(s.id) || 0) + s.count);
    contentsEl.textContent = totals.size
      ? [...totals].map(([id, n]) => `${itemName(id)} x${n}`).join(', ')
      : 'Inventory is empty';

    if (cursor) {
      paint(cursorEl, cursor);
      cursorEl.style.display = 'block';
    } else {
      cursorEl.style.display = 'none';
    }
  }

  function clickInventory(index) {
    cursor = Inventory.clickSlot(inventory.slots, index, cursor);
    refresh();
  }

  // Hotbar HUD (always visible): 9 slots showing the first 9 inventory stacks.
  const hotbarSlots = [];
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const el = makeSlot(String((i + 1) % 10));
    hotbarEl.appendChild(el);
    hotbarSlots.push(el);
  }

  // Inventory screen: main grid, hotbar row, 2x2 craft grid, and output.
  const mainSlots = [];
  for (let k = 0; k < INVENTORY_SIZE - HOTBAR_SIZE; k++) {
    const el = makeSlot();
    el.addEventListener('mousedown', () => clickInventory(HOTBAR_SIZE + k));
    mainEl.appendChild(el);
    mainSlots.push(el);
  }
  const rowSlots = [];
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const el = makeSlot(String((i + 1) % 10));
    el.addEventListener('mousedown', () => clickInventory(i));
    rowEl.appendChild(el);
    rowSlots.push(el);
  }
  const craftSlots = [];
  for (let i = 0; i < 9; i++) {
    const el = makeSlot();
    el.addEventListener('mousedown', () => {
      // Left click places one item per cell (like Minecraft's crafting grid).
      const cell = craftGrid[i];
      if (cursor && (!cell || cell.id === cursor.id)) {
        craftGrid[i] = { id: cursor.id, count: (cell ? cell.count : 0) + 1 };
        cursor.count -= 1;
        if (cursor.count <= 0) cursor = null;
      } else if (!cursor && cell) {
        // Taking an item from the grid returns it to the cursor.
        cursor = { id: cell.id, count: cell.count };
        craftGrid[i] = null;
      }
      refresh();
    });
    craftEl.appendChild(el);
    craftSlots.push(el);
  }
  const outSlot = makeSlot();
  outSlot.addEventListener('mousedown', () => {
    const recipe = matchRecipe(craftGrid);
    if (!recipe) return;
    // Put any stack held on the cursor back into the inventory first, so it
    // never blocks the craft. If it cannot fit, leave everything as it is.
    if (cursor) {
      if (!inventory.canAdd(cursor.id, cursor.count)) return;
      inventory.add(cursor.id, cursor.count);
      cursor = null;
    }
    if (craft(craftGrid, inventory)) refresh();
  });
  outEl.appendChild(outSlot);

  document.addEventListener('mousemove', (e) => {
    cursorEl.style.left = e.clientX + 'px';
    cursorEl.style.top = e.clientY + 'px';
  });

  // Shows the mining progress bar (0 hides it).
  function setMining(progress) {
    const p = Math.max(0, Math.min(1, progress));
    miningEl.style.display = p > 0 ? 'block' : 'none';
    miningFillEl.style.width = `${Math.round(p * 100)}%`;
  }

  function renderHealth(health, max) {
    if (health === shownHealth) return;
    shownHealth = health;
    healthEl.innerHTML = '';
    for (let i = 0; i < max / 2; i++) {
      const left = health - i * 2;
      const heart = document.createElement('span');
      heart.className = 'heart ' + (left >= 2 ? 'full' : left === 1 ? 'half' : 'empty');
      heart.textContent = '\u2665';
      healthEl.appendChild(heart);
    }
  }

  function open() {
    invEl.classList.remove('hidden');
    refresh();
  }

  // Returns anything held by the mouse or left in the crafting grid to the inventory.
  function close() {
    if (cursor) {
      inventory.add(cursor.id, cursor.count);
      cursor = null;
    }
    craftGrid.forEach((stack, i) => {
      if (stack) {
        inventory.add(stack.id, stack.count);
        craftGrid[i] = null;
      }
    });
    invEl.classList.add('hidden');
    refresh();
  }

  function setSelected(i) {
    selected = i;
    refresh();
  }

  refresh();
  return { refresh, setSelected, renderHealth, setMining, open, close };
}
