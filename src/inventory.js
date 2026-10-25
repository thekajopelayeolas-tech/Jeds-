// Item storage and crafting. Slots 0-8 are the hotbar; 9-35 are the main grid.
export const STACK_SIZE = 64;
export const INVENTORY_SIZE = 36;
export const HOTBAR_SIZE = 9;

// Recipes use exact ingredient counts. A 2x2 crafting grid must contain exactly
// these items (in any cell order) to match. Simplified: no furnace or table.
// The crafting grid has 9 cells (3x3). A recipe matches when the grid holds
// exactly these item counts, in any cell order. Raw Iron stands in for iron
// ingots (no furnace yet).
export const RECIPES = [
  { name: 'Oak Planks', inputs: { 6: 1 }, output: { id: 7, count: 4 } },
  { name: 'Sticks', inputs: { 7: 2 }, output: { id: 16, count: 4 } },
  { name: 'Glass', inputs: { 5: 4 }, output: { id: 10, count: 1 } },
  { name: 'Wooden Pickaxe', inputs: { 7: 3, 16: 2 }, output: { id: 17, count: 1 } },
  { name: 'Wooden Sword', inputs: { 7: 2, 16: 1 }, output: { id: 20, count: 1 } },
  { name: 'Stone Pickaxe', inputs: { 4: 3, 16: 2 }, output: { id: 18, count: 1 } },
  { name: 'Stone Sword', inputs: { 4: 2, 16: 1 }, output: { id: 21, count: 1 } },
  { name: 'Iron Pickaxe', inputs: { 23: 3, 16: 2 }, output: { id: 19, count: 1 } },
  { name: 'Iron Sword', inputs: { 23: 2, 16: 1 }, output: { id: 22, count: 1 } },
];

export class Inventory {
  constructor() {
    this.slots = new Array(INVENTORY_SIZE).fill(null);
  }

  get(index) {
    return this.slots[index];
  }

  countOf(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  // True if `count` items of `id` fit without anything left over.
  canAdd(id, count = 1) {
    let room = 0;
    for (const s of this.slots) {
      if (!s) room += STACK_SIZE;
      else if (s.id === id) room += STACK_SIZE - s.count;
    }
    return room >= count;
  }

  // Adds items, topping up existing stacks first. Returns how many did not fit.
  add(id, count = 1) {
    let left = count;
    for (const s of this.slots) {
      if (left === 0) break;
      if (s && s.id === id && s.count < STACK_SIZE) {
        const m = Math.min(left, STACK_SIZE - s.count);
        s.count += m;
        left -= m;
      }
    }
    for (let i = 0; i < INVENTORY_SIZE && left > 0; i++) {
      if (!this.slots[i]) {
        const m = Math.min(left, STACK_SIZE);
        this.slots[i] = { id, count: m };
        left -= m;
      }
    }
    return left;
  }

  // Removes one item from a specific slot. Returns false if the slot is empty.
  consume(index) {
    const s = this.slots[index];
    if (!s) return false;
    s.count -= 1;
    if (s.count === 0) this.slots[index] = null;
    return true;
  }

  // Mouse click on a slot array (inventory or crafting grid). `cursor` is the
  // stack held by the mouse, or null. Returns the new cursor value.
  static clickSlot(slots, index, cursor) {
    const s = slots[index];
    if (!cursor) {
      slots[index] = null;
      return s;
    }
    if (!s) {
      slots[index] = cursor;
      return null;
    }
    if (s.id === cursor.id) {
      const m = Math.min(cursor.count, STACK_SIZE - s.count);
      s.count += m;
      cursor.count -= m;
      slots[index] = s;
      return cursor.count > 0 ? cursor : null;
    }
    slots[index] = cursor;
    return s;
  }
}

// Returns the recipe that exactly matches a crafting grid, or null.
export function matchRecipe(grid) {
  const have = {};
  for (const cell of grid) if (cell) have[cell.id] = (have[cell.id] || 0) + cell.count;
  const haveKeys = Object.keys(have);
  return (
    RECIPES.find((r) => {
      const needKeys = Object.keys(r.inputs);
      return needKeys.length === haveKeys.length && needKeys.every((k) => have[k] === r.inputs[k]);
    }) || null
  );
}

// Crafts once: empties the grid and adds the output to the inventory.
export function craft(grid, inventory) {
  const recipe = matchRecipe(grid);
  if (!recipe || !inventory.canAdd(recipe.output.id, recipe.output.count)) return null;
  for (let i = 0; i < grid.length; i++) grid[i] = null;
  inventory.add(recipe.output.id, recipe.output.count);
  return recipe;
}
