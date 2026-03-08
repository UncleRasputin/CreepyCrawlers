// ═══════════════════════════════════════════════════════════════
//  renderer.js  —  Canvas rendering
// ═══════════════════════════════════════════════════════════════
import { T, TILE, VIEW_W, VIEW_H, MAP_W, MAP_H } from './config.js';

const EMOJI_FONT = (size) => `${size}px serif`;

export class Renderer {
  constructor(canvas, theme) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.theme  = theme;
    this.cw     = VIEW_W * TILE;
    this.ch     = VIEW_H * TILE;
    canvas.width  = this.cw;
    canvas.height = this.ch;
    // Camera (top-left tile of viewport)
    this.camX = 0;
    this.camY = 0;
    // Damage flash
    this.flashTimer = 0;
    this.flashColor = 'rgba(200,0,0,0.25)';
    // Particle effects
    this.particles = [];
  }

  setTheme(theme) { this.theme = theme; }

  centerOn(px, py) {
    this.camX = clamp(Math.floor(px - VIEW_W / 2), 0, MAP_W - VIEW_W);
    this.camY = clamp(Math.floor(py - VIEW_H / 2), 0, MAP_H - VIEW_H);
  }

  // ── Main render ─────────────────────────────────────────────────
  render(dungeon, player, enemies, groundItems) {
    const { ctx, cw, ch, camX, camY, theme } = this;
    ctx.clearRect(0, 0, cw, ch);

    // Background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);

    // Draw tiles
    for (let ty = 0; ty < VIEW_H; ty++) {
      for (let tx = 0; tx < VIEW_W; tx++) {
        const mx = tx + camX;
        const my = ty + camY;
        if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) continue;

        const tileType = dungeon.tiles[my][mx];
        const visible  = dungeon.visible[my][mx];
        const explored = dungeon.explored[my][mx];

        if (!explored) continue;   // never-seen = pure black

        this._drawTile(ctx, tx, ty, tileType, visible, theme);
      }
    }

    // Draw ground items (only if visible)
    for (const gi of groundItems) {
      const tx = gi.x - camX, ty = gi.y - camY;
      if (tx < 0 || ty < 0 || tx >= VIEW_W || ty >= VIEW_H) continue;
      if (!dungeon.visible[gi.y][gi.x]) continue;
      this._drawEmoji(ctx, tx, ty, gi.item.emoji, 0.9);
    }

    // Draw enemies (only if visible)
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      const tx = enemy.x - camX, ty = enemy.y - camY;
      if (tx < 0 || ty < 0 || tx >= VIEW_W || ty >= VIEW_H) continue;
      if (!dungeon.visible[enemy.y][enemy.x]) continue;
      this._drawEnemyTile(ctx, tx, ty, enemy);
    }

    // Draw player
    {
      const tx = player.x - camX;
      const ty = player.y - camY;
      this._drawPlayerTile(ctx, tx, ty, player);
    }

    // Particles
    this._tickParticles(ctx);

    // Damage flash overlay
    if (this.flashTimer > 0) {
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, cw, ch);
      this.flashTimer--;
    }
  }

  // ── Tile drawing ─────────────────────────────────────────────────
  _drawTile(ctx, tx, ty, tileType, visible, theme) {
    const px = tx * TILE, py = ty * TILE;

    let bg;
    if (tileType === T.WALL || tileType === T.VOID) {
      bg = visible ? theme.wallColor : shadeHex(theme.wallColor, 0.5);
    } else {
      bg = visible ? theme.visFloor : theme.litFloor;
    }

    ctx.fillStyle = bg;
    ctx.fillRect(px, py, TILE, TILE);

    if (!visible) {
      // Dim overlay for explored-but-not-visible
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px, py, TILE, TILE);
    }

    if (tileType === T.WALL) {
      // Subtle noise texture on walls
      ctx.fillStyle = visible ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.0)';
      const quarter = TILE / 4;
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px + (i % 2) * TILE / 2, py + Math.floor(i / 2) * TILE / 2, quarter, quarter);
      }
    } else if (tileType === T.STAIR_DOWN) {
      this._drawGlyph(ctx, tx, ty, '▾', visible ? theme.accent : '#555', Math.floor(TILE * 0.75));
    } else if (tileType === T.STAIR_UP) {
      this._drawGlyph(ctx, tx, ty, '▴', visible ? theme.accent : '#555', Math.floor(TILE * 0.75));
    }
  }

  _drawGlyph(ctx, tx, ty, glyph, color, fsize) {
    ctx.fillStyle = color;
    ctx.font = `bold ${fsize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
  }

  _drawEmoji(ctx, tx, ty, emoji, scale = 1.0) {
    const size  = Math.floor(TILE * 0.85 * scale);
    const px    = tx * TILE + TILE / 2;
    const py    = ty * TILE + TILE / 2;
    ctx.font    = EMOJI_FONT(size);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, px, py);
  }

  _drawPlayerTile(ctx, tx, ty, player) {
    const px = tx * TILE, py = ty * TILE;
    // highlight background
    ctx.fillStyle = 'rgba(100,180,100,0.25)';
    ctx.fillRect(px, py, TILE, TILE);
    this._drawEmoji(ctx, tx, ty, player.emoji);
  }

  _drawEnemyTile(ctx, tx, ty, enemy) {
    const px = tx * TILE, py = ty * TILE;
    // tinted bg
    ctx.fillStyle = enemy.boss ? 'rgba(180,50,50,0.35)' : 'rgba(40,40,40,0.6)';
    ctx.fillRect(px, py, TILE, TILE);
    this._drawEmoji(ctx, tx, ty, enemy.emoji, enemy.boss ? 1.1 : 0.85);
    // HP bar for enemies
    this._drawMiniHpBar(ctx, px, py, enemy.hp, enemy.maxHp);
    // Stun indicator
    if (enemy.stunned > 0) {
      ctx.font = `${Math.floor(TILE * 0.5)}px serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('💤', px + TILE, py);
    }
  }

  _drawMiniHpBar(ctx, px, py, hp, maxHp) {
    const bw = TILE - 2, bh = 3;
    const bx = px + 1, by = py + TILE - bh - 1;
    ctx.fillStyle = '#333';
    ctx.fillRect(bx, by, bw, bh);
    const frac = Math.max(0, hp / maxHp);
    ctx.fillStyle = frac > 0.5 ? '#50c050' : frac > 0.25 ? '#c0a020' : '#c04040';
    ctx.fillRect(bx, by, Math.floor(bw * frac), bh);
  }

  // ── Particles ─────────────────────────────────────────────────
  spawnDamageNumber(mapX, mapY, text, color = '#fff') {
    const sx = (mapX - this.camX) * TILE + TILE / 2;
    const sy = (mapY - this.camY) * TILE;
    this.particles.push({ x: sx, y: sy, text, color, life: 28, maxLife: 28, vy: -0.7 });
  }

  _tickParticles(ctx) {
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = p.color;
      ctx.font        = 'bold 12px sans-serif';
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, p.x, p.y);
      p.y   += p.vy;
      p.life--;
    }
    ctx.globalAlpha = 1;
  }

  triggerFlash(color = 'rgba(200,0,0,0.3)') {
    this.flashTimer = 6;
    this.flashColor = color;
  }
}

// ── Util ──────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function shadeHex(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 0xff) * factor);
  const g = Math.floor(((n >>  8) & 0xff) * factor);
  const b = Math.floor(( n        & 0xff) * factor);
  return `rgb(${r},${g},${b})`;
}
