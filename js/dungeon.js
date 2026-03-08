// ═══════════════════════════════════════════════════════════════
//  dungeon.js  —  Procedural dungeon generation + FOV
// ═══════════════════════════════════════════════════════════════
import { MAP_W, MAP_H, T, ROOM_MIN, ROOM_MAX, ROOM_COUNT_MIN, ROOM_COUNT_MAX } from './config.js';

// ── Helpers ──────────────────────────────────────────────────────
function rng(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

function makeGrid(w, h, val) {
  return Array.from({ length: h }, () => new Uint8Array(w).fill(val));
}

// ── Room ─────────────────────────────────────────────────────────
class Room {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
  }
  get cx() { return Math.floor(this.x + this.w / 2); }
  get cy() { return Math.floor(this.y + this.h / 2); }
  get x2() { return this.x + this.w - 1; }
  get y2() { return this.y + this.h - 1; }
  overlaps(r, padding = 1) {
    return !(r.x2 + padding < this.x || r.x > this.x2 + padding ||
             r.y2 + padding < this.y || r.y > this.y2 + padding);
  }
  /** Return up to 4 border tiles for door placement */
  borderTiles() {
    const tiles = [];
    for (let x = this.x + 1; x < this.x2; x++) {
      tiles.push({ x, y: this.y });
      tiles.push({ x, y: this.y2 });
    }
    for (let y = this.y + 1; y < this.y2; y++) {
      tiles.push({ x: this.x,  y });
      tiles.push({ x: this.x2, y });
    }
    return tiles;
  }
}

// ── Dungeon ───────────────────────────────────────────────────────
export class Dungeon {
  constructor() {
    this.width  = MAP_W;
    this.height = MAP_H;
    this.tiles  = makeGrid(MAP_W, MAP_H, T.WALL);   // tile types
    this.visible = makeGrid(MAP_W, MAP_H, 0);         // currently in FOV
    this.explored = makeGrid(MAP_W, MAP_H, 0);        // ever seen
    this.rooms  = [];
    this.stairDown = null;
    this.stairUp   = null;
  }

  generate(floorNum) {
    this.tiles    = makeGrid(MAP_W, MAP_H, T.WALL);
    this.visible  = makeGrid(MAP_W, MAP_H, 0);
    this.explored = makeGrid(MAP_W, MAP_H, 0);
    this.rooms    = [];
    this.floorNum = floorNum;

    const targetRooms = rng(ROOM_COUNT_MIN, ROOM_COUNT_MAX);

    // Place rooms
    let attempts = 0;
    while (this.rooms.length < targetRooms && attempts < 300) {
      attempts++;
      const w = rng(ROOM_MIN, ROOM_MAX);
      const h = rng(ROOM_MIN, ROOM_MAX);
      const x = rng(1, MAP_W - w - 2);
      const y = rng(1, MAP_H - h - 2);
      const room = new Room(x, y, w, h);
      if (!this.rooms.some(r => r.overlaps(room))) {
        this.carveRoom(room);
        this.rooms.push(room);
      }
    }

    // Connect rooms with corridors (nearest-first MST-like)
    const connected = [0];
    const unconnected = this.rooms.slice(1).map((_, i) => i + 1);
    while (unconnected.length > 0) {
      let bestDist = Infinity, bestA = -1, bestB = -1;
      for (const ci of connected) {
        for (const ui of unconnected) {
          const d = this.roomDist(this.rooms[ci], this.rooms[ui]);
          if (d < bestDist) { bestDist = d; bestA = ci; bestB = ui; }
        }
      }
      this.carveCorridor(this.rooms[bestA], this.rooms[bestB]);
      connected.push(bestB);
      unconnected.splice(unconnected.indexOf(bestB), 1);
    }

    // Add extra corridors for loops
    for (let i = 0; i < 2; i++) {
      const a = Math.floor(Math.random() * this.rooms.length);
      let b = Math.floor(Math.random() * this.rooms.length);
      if (b !== a) this.carveCorridor(this.rooms[a], this.rooms[b]);
    }

    // Place stairs
    const firstRoom = this.rooms[0];
    const lastRoom  = this.rooms[this.rooms.length - 1];

    this.stairDown = { x: lastRoom.cx, y: lastRoom.cy };
    this.tiles[lastRoom.cy][lastRoom.cx] = T.STAIR_DOWN;

    if (floorNum > 1) {
      this.stairUp = { x: firstRoom.cx, y: firstRoom.cy };
      this.tiles[firstRoom.cy][firstRoom.cx] = T.STAIR_UP;
    }

    return this;
  }

  carveRoom(room) {
    for (let y = room.y; y <= room.y2; y++) {
      for (let x = room.x; x <= room.x2; x++) {
        this.tiles[y][x] = T.FLOOR;
      }
    }
  }

  carveCorridor(roomA, roomB) {
    let { cx: x, cy: y } = roomA;
    const { cx: ex, cy: ey } = roomB;
    // Randomly pick H-then-V or V-then-H
    if (Math.random() < 0.5) {
      this._carveHLine(y, x, ex);
      this._carveVLine(ex, y, ey);
    } else {
      this._carveVLine(x, y, ey);
      this._carveHLine(ey, x, ex);
    }
  }

  _carveHLine(y, x1, x2) {
    const [lo, hi] = [Math.min(x1,x2), Math.max(x1,x2)];
    for (let x = lo; x <= hi; x++) {
      if (this.inBounds(x, y)) this.tiles[y][x] = T.FLOOR;
    }
  }

  _carveVLine(x, y1, y2) {
    const [lo, hi] = [Math.min(y1,y2), Math.max(y1,y2)];
    for (let y = lo; y <= hi; y++) {
      if (this.inBounds(x, y)) this.tiles[y][x] = T.FLOOR;
    }
  }

  roomDist(a, b) {
    return Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
  }

  inBounds(x, y) {
    return x >= 0 && x < MAP_W && y >= 0 && y < MAP_H;
  }

  isWalkable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const t = this.tiles[y][x];
    return t === T.FLOOR || t === T.STAIR_DOWN || t === T.STAIR_UP || t === T.DOOR;
  }

  /** Get a random floor tile inside a specific room */
  randomFloorInRoom(room) {
    const x = rng(room.x + 1, room.x2 - 1);
    const y = rng(room.y + 1, room.y2 - 1);
    return { x, y };
  }

  /** Get a random floor tile anywhere (excluding start room) */
  randomFloor(excludeRoom = null) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const x = rng(1, MAP_W - 2);
      const y = rng(1, MAP_H - 2);
      if (this.tiles[y][x] !== T.FLOOR) continue;
      if (excludeRoom) {
        if (x >= excludeRoom.x && x <= excludeRoom.x2 &&
            y >= excludeRoom.y && y <= excludeRoom.y2) continue;
      }
      return { x, y };
    }
    return { x: this.rooms[1]?.cx ?? 5, y: this.rooms[1]?.cy ?? 5 };
  }

  // ── FOV (raycasting) ────────────────────────────────────────────
  computeFOV(ox, oy, radius) {
    // Clear current visible map
    for (let y = 0; y < MAP_H; y++) this.visible[y].fill(0);
    this.visible[oy][ox] = 1;
    this.explored[oy][ox] = 1;

    // Cast rays toward every cell on the perimeter of a square of given radius
    const steps = 360;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const cx = Math.cos(angle);
      const cy = Math.sin(angle);
      this._castRay(ox, oy, cx, cy, radius);
    }
  }

  _castRay(ox, oy, cx, cy, radius) {
    let x = ox + 0.5, y = oy + 0.5;
    for (let step = 0; step < radius; step++) {
      x += cx; y += cy;
      const mx = Math.floor(x), my = Math.floor(y);
      if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) break;
      this.visible[my][mx]   = 1;
      this.explored[my][mx]  = 1;
      if (this.tiles[my][mx] === T.WALL || this.tiles[my][mx] === T.VOID) break;
    }
  }
}
