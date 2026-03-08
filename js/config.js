// ═══════════════════════════════════════════════════════════════
//  config.js  —  Game-wide constants
// ═══════════════════════════════════════════════════════════════

export const MAP_W  = 52;
export const MAP_H  = 34;
export const TILE   = 16;   // px per tile on canvas

// Viewport: how many tiles we show (will be centred on player)
export const VIEW_W = 48;
export const VIEW_H = 30;

export const TOTAL_FLOORS = 5;

// Tile type IDs
export const T = {
  VOID:  0,
  WALL:  1,
  FLOOR: 2,
  DOOR:  3,
  STAIR_DOWN: 4,
  STAIR_UP:   5,
};

// ── Floor themes ─────────────────────────────────────────────────
export const FLOOR_THEMES = [
  null,   // index 0 unused
  { name: 'The Garden',       wallColor: '#1a3a10', floorColor: '#1e2e18', litFloor: '#2a3d22', visFloor: '#324830', accent: '#4a8a3a' },
  { name: 'Underground',      wallColor: '#2a1e10', floorColor: '#1e1810', litFloor: '#2e2218', visFloor: '#3a2c20', accent: '#8a6a3a' },
  { name: 'The Crystal Cave', wallColor: '#101a2a', floorColor: '#10161e', litFloor: '#18222e', visFloor: '#20303e', accent: '#3a6a8a' },
  { name: 'The Hive',         wallColor: '#2a2010', floorColor: '#1e1a08', litFloor: '#2e2810', visFloor: '#3e3418', accent: '#c09020' },
  { name: "Queen's Lair",     wallColor: '#2a0808', floorColor: '#1a0808', litFloor: '#280c0c', visFloor: '#381010', accent: '#a02020' },
];

// ── Character definitions ─────────────────────────────────────
export const CHAR_DEFS = {
  beetle: {
    name: 'Beetle Knight', emoji: '🪲',
    hp: 35, atk: 5, def: 6, spd: 1,
    ability: { name: 'Shell Up', key: 'Q', cooldown: 8 },
    abilityDesc: 'Double DEF for 3 turns',
    color: '#70b040',
  },
  spider: {
    name: 'Spider Rogue', emoji: '🕷️',
    hp: 22, atk: 8, def: 2, spd: 2,
    ability: { name: 'Web Shot', key: 'Q', cooldown: 5 },
    abilityDesc: 'Stun adjacent enemy 2 turns',
    color: '#a070c0',
  },
  mosquito: {
    name: 'Mosquito Mage', emoji: '🦟',
    hp: 18, atk: 9, def: 1, spd: 1,
    ability: { name: 'Life Drain', key: 'Q', cooldown: 6 },
    abilityDesc: 'Deal 8 dmg, heal 4 HP (range 3)',
    color: '#60a0d0',
  },
};

// ── Enemy definitions  ────────────────────────────────────────
// enemies[floor] = array of possible enemy types
export const ENEMY_DEFS = {
  // Floor 1 — Garden
  ant:        { name: 'Ant Drone',    emoji: '🐜', hp: 6,  atk: 3,  def: 0, xp: 3,  gold: 1, color: '#c09070', floor: 1 },
  caterpillar:{ name: 'Caterpillar',  emoji: '🐛', hp: 10, atk: 2,  def: 2, xp: 4,  gold: 2, color: '#70c070', floor: 1 },
  cricket:    { name: 'Cricket',      emoji: '🦗', hp: 5,  atk: 4,  def: 0, xp: 3,  gold: 1, color: '#a0a060', floor: 1 },
  // Floor 2 — Underground
  worm:       { name: 'Earthworm',    emoji: '🪱', hp: 14, atk: 4,  def: 1, xp: 6,  gold: 3, color: '#c07070', floor: 2 },
  ladybug:    { name: 'Ladybug Guard',emoji: '🐞', hp: 18, atk: 5,  def: 4, xp: 8,  gold: 4, color: '#d04040', floor: 2 },
  gnat:       { name: 'Gnat Swarm',   emoji: '🦟', hp: 8,  atk: 6,  def: 0, xp: 5,  gold: 2, color: '#808060', floor: 2 },
  // Floor 3 — Cave
  cave_spider:{ name: 'Cave Spider',  emoji: '🕷️', hp: 20, atk: 8,  def: 2, xp: 10, gold: 5, color: '#9060b0', floor: 3 },
  scorpling:  { name: 'Scorpling',    emoji: '🦂', hp: 24, atk: 9,  def: 3, xp: 12, gold: 6, color: '#c0a030', floor: 3 },
  dung_beetle:{ name: 'Dung Beetle',  emoji: '🪲', hp: 28, atk: 7,  def: 6, xp: 13, gold: 7, color: '#606040', floor: 3 },
  // Floor 4 — Hive
  worker_bee: { name: 'Worker Bee',   emoji: '🐝', hp: 30, atk: 11, def: 4, xp: 15, gold: 8, color: '#e0c020', floor: 4 },
  drone_bee:  { name: 'Drone Bee',    emoji: '🐝', hp: 36, atk: 12, def: 5, xp: 18, gold: 9, color: '#d0a010', floor: 4 },
  hornet:     { name: 'Hornet',       emoji: '🐛', hp: 28, atk: 14, def: 3, xp: 17, gold: 9, color: '#e06010', floor: 4 },
  // Floor 5 — Lair (non-boss)
  chaos_gnat: { name: 'Chaos Gnat',   emoji: '🦟', hp: 32, atk: 14, def: 4, xp: 20, gold: 10, color: '#c030c0', floor: 5 },
  widow:      { name: 'Black Widow',  emoji: '🕷️', hp: 44, atk: 16, def: 6, xp: 25, gold: 12, color: '#400040', floor: 5 },
  queens_guard:{ name: "Queen's Guard",emoji: '🐜', hp: 50, atk: 17, def: 8, xp: 28, gold: 14, color: '#c01010', floor: 5 },
  // Boss
  ant_queen:  { name: 'THE ANT QUEEN',emoji: '👑', hp: 120, atk: 20, def: 10, xp: 200, gold: 60, color: '#ffd700', floor: 5, boss: true },
};

export const ENEMIES_BY_FLOOR = {
  1: ['ant','caterpillar','cricket'],
  2: ['worm','ladybug','gnat'],
  3: ['cave_spider','scorpling','dung_beetle'],
  4: ['worker_bee','drone_bee','hornet'],
  5: ['chaos_gnat','widow','queens_guard'],
};

// enemies per floor (min/max)
export const ENEMY_COUNT = { 1:[6,9], 2:[7,10], 3:[8,11], 4:[9,12], 5:[10,14] };
export const ITEM_COUNT  = { 1:[4,6], 2:[4,6],  3:[3,5],  4:[3,5],  5:[2,4]  };

// XP needed to level up (index = current level 1-9)
export const XP_PER_LEVEL = [0, 10, 22, 36, 52, 70, 90, 115, 145, 999999];

// Dungeon gen constants
export const ROOM_MIN  = 4;
export const ROOM_MAX  = 9;
export const ROOM_COUNT_MIN = 7;
export const ROOM_COUNT_MAX = 11;
