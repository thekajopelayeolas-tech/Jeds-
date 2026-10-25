import { isSolid } from './blocks.js';

const WIDTH = 0.6;
const HEIGHT = 1.8;
const EYE = 1.62;
const WALK_SPEED = 4.3;
const SPRINT_SPEED = 5.6;
const FLY_SPEED = 10;
const GRAVITY = 28;
const JUMP_VELOCITY = 8.6;
const TERMINAL = 55;
const MAX_HEALTH = 20; // 10 hearts, as in Minecraft
const SAFE_FALL = 3; // blocks; falls up to this distance do no damage

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = { x: 0, y: 0, z: 0 }; // feet position
    this.vel = { x: 0, y: 0, z: 0 };
    this.onGround = false;
    this.flying = false;
    this.yaw = 0;
    this.pitch = 0;
    this.health = MAX_HEALTH;
    this.maxHealth = MAX_HEALTH;
    this.fallStartY = null; // highest Y since last landing, for fall damage
    this.spawnPoint = { x: 8, z: 8 };
    this.dead = false;
  }

  spawn(x, z) {
    this.spawnPoint = { x, z };
    const y = this.world.surfaceHeight(Math.floor(x), Math.floor(z)) + 1;
    this.pos = { x: x + 0.5, y: y + 0.01, z: z + 0.5 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.fallStartY = null;
  }

  // Restores health and returns to the spawn point after death.
  respawn() {
    this.health = this.maxHealth;
    this.dead = false;
    this.spawn(this.spawnPoint.x, this.spawnPoint.z);
  }

  damage(amount) {
    if (this.dead || this.flying) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) this.dead = true;
  }

  // Applies fall damage when the player lands after a drop larger than SAFE_FALL.
  landed() {
    if (this.fallStartY !== null) {
      const dist = this.fallStartY - this.pos.y;
      if (dist > SAFE_FALL) this.damage(Math.ceil(dist - SAFE_FALL));
    }
    this.fallStartY = null;
  }

  eyePosition() {
    return { x: this.pos.x, y: this.pos.y + EYE, z: this.pos.z };
  }

  // True if the player's box overlaps any solid block.
  collides(x, y, z) {
    const minX = Math.floor(x - WIDTH / 2);
    const maxX = Math.floor(x + WIDTH / 2 - 1e-6);
    const minY = Math.floor(y);
    const maxY = Math.floor(y + HEIGHT - 1e-6);
    const minZ = Math.floor(z - WIDTH / 2);
    const maxZ = Math.floor(z + WIDTH / 2 - 1e-6);
    for (let by = minY; by <= maxY; by++) {
      for (let bx = minX; bx <= maxX; bx++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (isSolid(this.world.getBlock(bx, by, bz))) return true;
        }
      }
    }
    return false;
  }

  // Moves along one axis and stops at the first collision.
  moveAxis(axis, amount) {
    if (amount === 0) return false;
    const steps = Math.ceil(Math.abs(amount) / 0.05);
    const step = amount / steps;
    for (let i = 0; i < steps; i++) {
      const next = { ...this.pos };
      next[axis] += step;
      if (this.collides(next.x, next.y, next.z)) {
        this.vel[axis] = 0;
        return true;
      }
      this.pos = next;
    }
    return false;
  }

  // Applies input (move: {forward, strafe} in -1..1) and physics for dt seconds.
  update(dt, move, jump, sprint, sneak) {
    const speed = this.flying ? FLY_SPEED : sprint ? SPRINT_SPEED : WALK_SPEED;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Forward is -Z at yaw 0 (matches three.js camera default).
    let dx = (-sin * move.forward + cos * move.strafe);
    let dz = (-cos * move.forward - sin * move.strafe);
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      dx /= len;
      dz /= len;
    }
    this.vel.x = dx * speed;
    this.vel.z = dz * speed;

    if (this.flying) {
      this.vel.y = jump ? speed : sneak ? -speed : 0;
    } else {
      this.vel.y = Math.max(-TERMINAL, this.vel.y - GRAVITY * dt);
      if (jump && this.onGround) {
        this.vel.y = JUMP_VELOCITY;
        this.onGround = false;
      }
      // Sneak stops at ledges so the player doesn't fall off edges.
      if (sneak && this.onGround) {
        const probeX = this.pos.x + this.vel.x * dt;
        const probeZ = this.pos.z + this.vel.z * dt;
        if (!this.collides(probeX, this.pos.y - 0.1, probeZ)) {
          this.vel.x = 0;
          this.vel.z = 0;
        }
      }
    }

    this.onGround = false;
    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('z', this.vel.z * dt);
    const fallingBefore = this.vel.y <= 0;
    // Track the highest point of a fall to measure damage on landing.
    if (!this.onGround && !this.flying && this.fallStartY === null) this.fallStartY = this.pos.y;
    const hitY = this.moveAxis('y', this.vel.y * dt);
    // Only a downward collision counts as standing on ground.
    if (hitY && fallingBefore && !this.flying) {
      this.onGround = true;
      this.landed();
    }
    if (this.flying) this.fallStartY = null;

    // Fell out of the world: respawn above the surface (and take void damage).
    if (this.pos.y < -20) {
      this.damage(MAX_HEALTH);
      if (!this.dead) this.spawn(this.pos.x, this.pos.z);
    }
  }
}
