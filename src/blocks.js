// Block and item registry. Colors are per face: top, side, bottom (hex).
// Id 0 is air and is never rendered. Ids 1-15 are placeable blocks.
// Ids 16+ are items: they live in the inventory and cannot be placed.
//
// hardness: base break time in seconds (by hand, with the right tool it is faster).
// tier:     pickaxe tier needed to get a drop (1 wood, 2 stone, 3 iron). Omitted = no tool needed.
// drop:     item id given when broken. Omitted = the block itself. null = nothing.
export const BLOCKS = {
  0: { name: 'Air', solid: false, transparent: true },
  1: { name: 'Grass', top: 0x5fb83a, side: 0x7a5a3a, bottom: 0x6b4b2f, hardness: 0.6, drop: 2 },
  2: { name: 'Dirt', top: 0x7a5a3a, side: 0x7a5a3a, bottom: 0x7a5a3a, hardness: 0.5 },
  3: { name: 'Stone', top: 0x7d7d7d, side: 0x737373, bottom: 0x6a6a6a, hardness: 3, tier: 1, drop: 4 },
  4: { name: 'Cobblestone', top: 0x6e6e6e, side: 0x5f5f5f, bottom: 0x555555, hardness: 3, tier: 1 },
  5: { name: 'Sand', top: 0xdccb8a, side: 0xd2bf7c, bottom: 0xc7b572, hardness: 0.5 },
  6: { name: 'Oak Log', top: 0xb08a4f, side: 0x6b4f2a, bottom: 0xb08a4f, hardness: 2 },
  7: { name: 'Oak Planks', top: 0xb8925a, side: 0xb8925a, bottom: 0xb8925a, hardness: 2 },
  8: { name: 'Leaves', top: 0x3f8f2a, side: 0x3f8f2a, bottom: 0x3f8f2a, transparent: true, hardness: 0.2, drop: null },
  9: { name: 'Water', top: 0x2e6fd1, side: 0x2e6fd1, bottom: 0x2e6fd1, transparent: true, solid: false, liquid: true },
  10: { name: 'Glass', top: 0xbfe6ff, side: 0xbfe6ff, bottom: 0xbfe6ff, transparent: true, hardness: 0.3, drop: null },
  11: { name: 'Bricks', top: 0x9b4a3a, side: 0x9b4a3a, bottom: 0x9b4a3a, hardness: 3, tier: 1 },
  12: { name: 'Snow', top: 0xf5f9ff, side: 0xe4ecf5, bottom: 0xd6e0ea, hardness: 0.2 },
  13: { name: 'Gravel', top: 0x8c8685, side: 0x857e7d, bottom: 0x7b7372, hardness: 0.6 },
  14: { name: 'Iron Ore', top: 0x7d7d7d, side: 0x7d7d7d, bottom: 0x7d7d7d, hardness: 3, tier: 2, drop: 23 },
  15: { name: 'Diamond Ore', top: 0x7d7d7d, side: 0x7d7d7d, bottom: 0x7d7d7d, hardness: 3, tier: 3, drop: 24 },

  // ---- Items ----
  16: { name: 'Stick', item: true, color: 0x9a7444 },
  17: { name: 'Wooden Pickaxe', item: true, color: 0xb8925a, tool: 'pickaxe', tier: 1, speed: 2 },
  18: { name: 'Stone Pickaxe', item: true, color: 0x9a9a9a, tool: 'pickaxe', tier: 2, speed: 4 },
  19: { name: 'Iron Pickaxe', item: true, color: 0xd8d8d8, tool: 'pickaxe', tier: 3, speed: 6 },
  20: { name: 'Wooden Sword', item: true, color: 0xb8925a, tool: 'sword', damage: 4 },
  21: { name: 'Stone Sword', item: true, color: 0x9a9a9a, tool: 'sword', damage: 5 },
  22: { name: 'Iron Sword', item: true, color: 0xd8d8d8, tool: 'sword', damage: 7 },
  23: { name: 'Raw Iron', item: true, color: 0xd9a77e },
  24: { name: 'Diamond', item: true, color: 0x5ee6e0 },
  25: { name: 'Raw Meat', item: true, color: 0xd9776a },
};

export const HOTBAR_BLOCKS = [1, 2, 3, 4, 5, 6, 7, 8, 11];

export function isSolid(id) {
  const b = BLOCKS[id];
  return !!b && id !== 0 && b.solid !== false;
}

export function isTransparent(id) {
  const b = BLOCKS[id];
  return !b || id === 0 || !!b.transparent;
}

export function isItem(id) {
  return !!BLOCKS[id] && !!BLOCKS[id].item;
}

// Item id dropped when a block breaks, or null for no drop.
export function dropOf(id) {
  const b = BLOCKS[id];
  if (!b) return null;
  return b.drop === undefined ? id : b.drop;
}

// True if the tool (an item def, or null) is strong enough to get the drop.
export function canHarvest(id, tool) {
  const b = BLOCKS[id];
  if (!b || !b.tier) return true;
  return !!tool && tool.tool === 'pickaxe' && tool.tier >= b.tier;
}

// Seconds to break a block. Pickaxes speed up stone-type blocks; bare hands are slow.
export function breakSeconds(id, tool) {
  const b = BLOCKS[id];
  if (!b) return 0;
  const base = b.hardness ?? 1;
  if (canHarvest(id, tool)) {
    const speed = tool && tool.tool === 'pickaxe' && b.tier ? tool.speed : 1;
    return (base * 1.5) / speed;
  }
  return base * 5;
}
