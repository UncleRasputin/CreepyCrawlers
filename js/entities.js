// ═══════════════════════════════════════════════════════════════
//  entities.js  —  Player and Enemy classes
// ═══════════════════════════════════════════════════════════════
import { CHAR_DEFS, ENEMY_DEFS, XP_PER_LEVEL } from './config.js?v=20260308';

// ── Utility ──────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rng(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// ── Base Entity ───────────────────────────────────────────────────
export class Entity {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.hp    = 10;
    this.maxHp = 10;
    this.atk   = 3;
    this.def   = 0;
  }

  /** Returns damage dealt (after def) */
  attackTarget(target) {
    const roll   = rng(Math.max(1, this.atk - 2), this.atk + 2);
    const dmg    = Math.max(1, roll - target.def);
    target.hp   -= dmg;
    return dmg;
  }

  get isAlive() { return this.hp > 0; }
}

// ── Player ────────────────────────────────────────────────────────
export class Player extends Entity {
  constructor(charClass, x, y) {
    super(x, y);
    this.charClass = charClass;
    const def = CHAR_DEFS[charClass];
    this.name    = def.name;
    this.emoji   = def.emoji;
    this.color   = def.color;
    this.maxHp   = def.hp;
    this.hp      = def.hp;
    this.atk     = def.atk;
    this.def     = def.def;
    this.spd     = def.spd;
    this.level   = 1;
    this.xp      = 0;
    this.gold    = 0;
    this.kills   = 0;
    this.score   = 0;
    this.inventory = [];           // max 6 items
    this.maxInv  = 6;
    this.abilityCooldown = 0;
    this.abilityDuration = 0;      // turns remaining for active effect
    this.abilityDef  = def.ability;
    this.shelled     = false;      // beetle shell-up active
    this.defBonus    = 0;          // temporary bonus
    this.turns = 0;
  }

  get xpToNext() { return XP_PER_LEVEL[this.level] || 9999; }

  gainXP(amount) {
    this.xp += amount;
    const needed = XP_PER_LEVEL[this.level];
    if (needed && this.xp >= needed) {
      this.xp -= needed;
      this.level++;
      return true; // leveled up
    }
    return false;
  }

  pickupItem(item) {
    if (this.inventory.length >= this.maxInv) return false;
    this.inventory.push(item);
    return true;
  }

  // Returns log message or null
  useItem(index, dungeon) {
    const item = this.inventory[index];
    if (!item) return null;
    const msg = item.use(this, dungeon);
    this.inventory.splice(index, 1);
    return msg;
  }

  // ── Abilities ────────────────────────────────────────────────
  useAbility(enemies, dungeon) {
    if (this.abilityCooldown > 0) return null;
    const cd = this.abilityDef.cooldown;

    if (this.charClass === 'beetle') {
      this.shelled = true;
      this.abilityDuration = 3;
      this.defBonus = this.def;   // remember original def
      this.abilityCooldown = cd;
      return { msg: '🛡️ Shell Up! DEF doubled for 3 turns.', type: 'special' };
    }

    if (this.charClass === 'spider') {
      // Stun closest enemy in range 1 (Chebyshev)
      const adj = enemies.filter(e => e.isAlive &&
        Math.max(Math.abs(e.x - this.x), Math.abs(e.y - this.y)) <= 1);
      if (adj.length === 0) return { msg: 'No adjacent enemy to web!', type: 'warning' };
      const target = adj[0];
      target.stunned = 2;
      this.abilityCooldown = cd;
      return { msg: `🕸️ Web Shot! ${target.name} is stunned!`, type: 'special' };
    }

    if (this.charClass === 'mosquito') {
      // Life drain — hit closest enemy in range 3
      const inRange = enemies
        .filter(e => e.isAlive)
        .map(e => ({ e, d: Math.abs(e.x - this.x) + Math.abs(e.y - this.y) }))
        .filter(({ d }) => d <= 3)
        .sort((a, b) => a.d - b.d);
      if (inRange.length === 0) return { msg: 'No enemy in range to drain!', type: 'warning' };
      const { e: target } = inRange[0];
      const dmg = Math.max(1, 8 - target.def);
      target.hp -= dmg;
      const heal = Math.min(4, this.maxHp - this.hp);
      this.hp += heal;
      this.abilityCooldown = cd;
      return { msg: `🩸 Life Drain! ${target.name} takes ${dmg} dmg. You heal ${heal} HP.`, type: 'special' };
    }
    return null;
  }

  tickTurn() {
    this.turns++;
    if (this.abilityCooldown > 0) this.abilityCooldown--;
    if (this.abilityDuration > 0) {
      this.abilityDuration--;
      if (this.abilityDuration === 0 && this.shelled) {
        this.shelled = false;
        this.defBonus = 0;
      }
    }
  }

  get effectiveDef() {
    return this.shelled ? this.def * 2 : this.def;
  }
}

// ── Enemy ─────────────────────────────────────────────────────────
export class Enemy extends Entity {
  constructor(defKey, x, y) {
    super(x, y);
    const def = ENEMY_DEFS[defKey];
    this.defKey  = defKey;
    this.name    = def.name;
    this.emoji   = def.emoji;
    this.color   = def.color;
    this.maxHp   = def.hp;
    this.hp      = def.hp;
    this.atk     = def.atk;
    this.def     = def.def;
    this.xpValue = def.xp;
    this.goldValue = def.gold;
    this.boss    = !!def.boss;
    this.stunned = 0;
    this.alerted = false;
    this.alertRange = this.boss ? 20 : 6;
  }

  /** Returns damage dealt or 0 */
  attackPlayer(player) {
    const roll = rng(Math.max(1, this.atk - 2), this.atk + 2);
    const dmg  = Math.max(1, roll - player.effectiveDef);
    player.hp -= dmg;
    return dmg;
  }

  /** Decide movement direction toward player; returns { dx, dy } */
  think(px, py, dungeon, enemies) {
    if (this.stunned > 0) { this.stunned--; return { dx: 0, dy: 0 }; }

    const dist = Math.abs(this.x - px) + Math.abs(this.y - py);
    const cheby = Math.max(Math.abs(this.x - px), Math.abs(this.y - py));

    // Alert when player comes near or we've been in combat
    if (dist <= this.alertRange) this.alerted = true;
    if (!this.alerted) return { dx: 0, dy: 0 };

    // Chebyshev adjacent — attack handled in game loop, no move needed
    if (cheby <= 1) return { dx: 0, dy: 0 };

    // Pathfind: prefer axis that reduces distance most; avoid walls & other enemies
    const candidates = [
      { dx:  1, dy:  0 }, { dx: -1, dy:  0 },
      { dx:  0, dy:  1 }, { dx:  0, dy: -1 },
    ].filter(({ dx, dy }) => {
      const nx = this.x + dx, ny = this.y + dy;
      if (!dungeon.isWalkable(nx, ny)) return false;
      // Don't stack on other enemies
      if (enemies.some(e => e !== this && e.isAlive && e.x === nx && e.y === ny)) return false;
      return true;
    }).map(({ dx, dy }) => ({
      dx, dy,
      d: Math.abs((this.x + dx) - px) + Math.abs((this.y + dy) - py)
    })).sort((a, b) => a.d - b.d);

    if (candidates.length === 0) return { dx: 0, dy: 0 };

    // 80% chance best path, 20% second best (for variety)
    if (candidates.length > 1 && Math.random() < 0.2) return candidates[1];
    return candidates[0];
  }
}

// ── Ground item ───────────────────────────────────────────────────
export class GroundItem {
  constructor(item, x, y) {
    this.item = item;
    this.x = x;
    this.y = y;
  }
}
