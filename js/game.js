// ═══════════════════════════════════════════════════════════════
//  game.js  —  Core game loop, state machine, turn processing
// ═══════════════════════════════════════════════════════════════

// Derive cache-bust version from the single meta tag in index.html so that
// updating <meta name="cache-v"> in index.html refreshes every module at once.
const _cv = document.querySelector('meta[name="cache-v"]')?.content ?? 'dev';

const [
  { CHAR_DEFS, ENEMY_DEFS, ENEMIES_BY_FLOOR, ENEMY_COUNT, ITEM_COUNT, FLOOR_THEMES, TOTAL_FLOORS, T },
  { Dungeon },
  { Player, Enemy, GroundItem },
  { randomItem },
  { Renderer },
  { default: Arcade },
] = await Promise.all([
  import(`./config.js?v=${_cv}`),
  import(`./dungeon.js?v=${_cv}`),
  import(`./entities.js?v=${_cv}`),
  import(`./items.js?v=${_cv}`),
  import(`./renderer.js?v=${_cv}`),
  import(`../arcade.js?v=${_cv}`),
]);

const FOV_RADIUS  = 7;

function rng(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// ── Level-up bonus options ─────────────────────────────────────
const LEVEL_BONUSES = [
  { label: '❤️  +8 Max HP',  apply: p => { p.maxHp += 8; p.hp = Math.min(p.hp + 8, p.maxHp); } },
  { label: '⚔️  +2 ATK',     apply: p => { p.atk += 2; } },
  { label: '🛡️  +2 DEF',     apply: p => { p.def += 2; } },
  { label: '💨 Reduce ability cooldown by 1', apply: p => { p.abilityDef = { ...p.abilityDef, cooldown: Math.max(1, p.abilityDef.cooldown - 1) }; } },
];

// ═══════════════════════════════════════════════════════════════
export class Game {
  constructor() {
    this.state      = 'title';
    this.dungeon    = null;
    this.player     = null;
    this.enemies    = [];
    this.groundItems = [];
    this.renderer   = null;
    this.floor      = 1;
    this.pendingLevelUp = false;
    this._loopId    = null;
    this._boundKey  = this._onKey.bind(this);
    this._lastRender = 0;
    this._arcade      = null;
    this._arcadeReady = false;
  }

  // ═══ Initialise ═══════════════════════════════════════════════
  init() {
    this._bindScreenButtons();
    this._showScreen('title');
    window.addEventListener('keydown', this._boundKey);
    this._initTouchControls();
    this._initArcade();   // non-blocking — safe to call without await
  }

  // ═══ Arcade integration ═══════════════════════════════════════
  async _initArcade() {
    try {
      this._arcade = new Arcade({ gameId: 'creepycrawlers' });
      await this._arcade.ready();
      this._arcadeReady = true;
      // Prompt for name on first visit
      if (this._arcade.player.name.startsWith('PLAYER_')) {
        const name = prompt('Enter your player name for the leaderboard:');
        if (name && name.trim()) this._arcade.setPlayerName(name.trim());
      }
    } catch (err) {
      console.warn('[Creepy Crawlers] Arcade offline:', err.message);
      this._arcadeReady = false;
    }
  }

  async _submitArcadeScore(score) {
    if (!this._arcadeReady) return;
    const p = this.player;
    await this._arcade.submitScore({
      score,
      floor: this.floor,
      kills: p.kills,
      gold:  p.gold,
      level: p.level,
      class: p.charClass,
    });
  }

  // ═══ Screen management ════════════════════════════════════════
  _showScreen(name) {
    this.state = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(`screen-${name}`);
    if (el) el.classList.add('active');
    // Reposition game screen (flex)
    if (name === 'game') {
      this._startRenderLoop();
    } else {
      this._stopRenderLoop();
    }
  }

  // ═══ Button bindings ══════════════════════════════════════════
  _bindScreenButtons() {
    // Title
    document.getElementById('btn-newgame').addEventListener('click', () => this._showScreen('charselect'));
    document.getElementById('btn-scores').addEventListener('click', () => {
      this._loadScoresDisplay();
      this._showScreen('scores');
    });
    // Char select
    document.querySelectorAll('.char-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const charClass = card.dataset.class;
        setTimeout(() => this.startGame(charClass), 200);
      });
    });
    document.getElementById('btn-back').addEventListener('click', () => this._showScreen('title'));
    // Pause
    document.getElementById('btn-resume').addEventListener('click', () => {
      document.getElementById('pause-overlay').classList.add('hidden');
      this.state = 'playing';
    });
    document.getElementById('btn-quit').addEventListener('click', () => {
      document.getElementById('pause-overlay').classList.add('hidden');
      this._showScreen('title');
    });
    // Game over
    document.getElementById('btn-retry').addEventListener('click', () => this._showScreen('charselect'));
    document.getElementById('btn-gotitle').addEventListener('click', () => this._showScreen('title'));
    // Victory
    document.getElementById('btn-playagain').addEventListener('click', () => this._showScreen('charselect'));
    document.getElementById('btn-gotitle2').addEventListener('click', () => this._showScreen('title'));
    // Scores
    document.getElementById('btn-scores-back').addEventListener('click', () => this._showScreen('title'));

    // Level-up choices handled dynamically
  }

  // ═══ Start a new game ════════════════════════════════════════
  startGame(charClass) {
    this.floor = 1;
    this._loadFloor(charClass, true);
    this._showScreen('game');
    this.state = 'playing';   // override 'game' set by _showScreen
  }

  // ═══ Load / generate a floor ══════════════════════════════════
  _loadFloor(charClassOrNull, isNewGame = false) {
    const dungeon = new Dungeon();
    dungeon.generate(this.floor);
    this.dungeon = dungeon;

    const startRoom = dungeon.rooms[0];

    // Create or reuse player
    if (isNewGame) {
      this.player = new Player(charClassOrNull, startRoom.cx, startRoom.cy);
    } else {
      this.player.x = startRoom.cx;
      this.player.y = startRoom.cy;
    }

    // Spawn enemies
    this.enemies = [];
    const pool = ENEMIES_BY_FLOOR[this.floor];
    const [minE, maxE] = ENEMY_COUNT[this.floor];
    const count = rng(minE, maxE);
    for (let i = 0; i < count; i++) {
      const defKey = pool[Math.floor(Math.random() * pool.length)];
      const pos = dungeon.randomFloor(startRoom);
      const e = new Enemy(defKey, pos.x, pos.y);
      this.enemies.push(e);
    }

    // Boss on floor 5 in last room
    if (this.floor === TOTAL_FLOORS) {
      const bossRoom = dungeon.rooms[dungeon.rooms.length - 1];
      // Only place boss if stair is different from boss pos
      const bossPos = dungeon.randomFloorInRoom(bossRoom);
      const boss = new Enemy('ant_queen', bossPos.x, bossPos.y);
      this.enemies.push(boss);
    }

    // Spawn ground items
    this.groundItems = [];
    const [minI, maxI] = ITEM_COUNT[this.floor];
    const iCount = rng(minI, maxI);
    for (let i = 0; i < iCount; i++) {
      const pos = dungeon.randomFloor(startRoom);
      this.groundItems.push(new GroundItem(randomItem(this.floor), pos.x, pos.y));
    }

    // Set up renderer
    const theme = FLOOR_THEMES[this.floor];
    const canvas = document.getElementById('game-canvas');
    if (!this.renderer) {
      this.renderer = new Renderer(canvas, theme);
      this._initResizeObserver();
    } else {
      this.renderer.setTheme(theme);
    }

    // Initial FOV
    this.dungeon.computeFOV(this.player.x, this.player.y, FOV_RADIUS);

    // Update UI
    this._updateUI();
    this._updateFloorUI();
    this.addLog(`Floor ${this.floor}: ${theme.name}`, 'floor');
    if (this.floor === TOTAL_FLOORS) {
      this.addLog('⚠️ The Ant Queen awaits in the depths…', 'warning');
    }
  }

  // ═══ Virtual joystick (replaces swipe + old D-pad) ═══════════
  _initTouchControls() {
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    if (!base || !knob) return;

    let _trackId  = null;
    let _originX  = 0, _originY = 0;
    const DEAD_ZONE  = 14;   // px — smaller than this = wait
    const MAX_TRAVEL = 32;   // max knob visual travel

    const moveKnob = (cx, cy) => {
      const dx = cx - _originX;
      const dy = cy - _originY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist < 1 ? 0 : Math.min(dist, MAX_TRAVEL) / dist;
      knob.style.transform =
        `translate(calc(-50% + ${dx * ratio}px), calc(-50% + ${dy * ratio}px))`;
      return { dx, dy };
    };

    const resetKnob = () => { knob.style.transform = 'translate(-50%, -50%)'; };

    base.addEventListener('touchstart', e => {
      e.preventDefault();
      if (this.state !== 'playing' || _trackId !== null) return;
      const t = e.changedTouches[0];
      _trackId = t.identifier;
      const r = base.getBoundingClientRect();
      _originX = r.left + r.width  / 2;
      _originY = r.top  + r.height / 2;
      moveKnob(t.clientX, t.clientY);
    }, { passive: false });

    base.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === _trackId) moveKnob(t.clientX, t.clientY);
      }
    }, { passive: false });

    const endJoystick = e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== _trackId) continue;
        _trackId = null;
        const { dx, dy } = moveKnob(t.clientX, t.clientY);
        resetKnob();
        if (this.state !== 'playing') return;
        const ax = Math.abs(dx), ay = Math.abs(dy);
        if (ax < DEAD_ZONE && ay < DEAD_ZONE) { this._processTurn(0, 0); return; }
        // 8-directional via angle sector
        const angle  = Math.atan2(dy, dx);
        const sector = Math.round(angle / (Math.PI / 4));
        const sdx = Math.sign(Math.round(Math.cos(sector * Math.PI / 4)));
        const sdy = Math.sign(Math.round(Math.sin(sector * Math.PI / 4)));
        this._processTurn(sdx, sdy);
      }
    };

    base.addEventListener('touchend',    endJoystick, { passive: false });
    base.addEventListener('touchcancel', endJoystick, { passive: false });

    // Action buttons
    document.getElementById('joy-ability')?.addEventListener('click', e => {
      e.stopPropagation();
      if (this.state !== 'playing') return;
      this._useAbility();
    });
    document.getElementById('joy-wait')?.addEventListener('click', e => {
      e.stopPropagation();
      if (this.state !== 'playing') return;
      this._processTurn(0, 0);
    });
  }

  // ═══ Resize  ══════════════════════════════════════════════════
  _initResizeObserver() {
    const wrapper = document.querySelector('.canvas-wrapper');
    const doResize = () => {
      if (this.renderer && wrapper.clientWidth > 0 && wrapper.clientHeight > 0) {
        this.renderer.resize(wrapper.clientWidth, wrapper.clientHeight);
      }
    };
    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(doResize);
      this._resizeObserver.observe(wrapper);
    } else {
      window.addEventListener('resize', doResize);
    }
    doResize();   // run immediately
  }

  // ═══ Render loop ══════════════════════════════════════════════
  _startRenderLoop() {
    const loop = () => {
      this._loopId = requestAnimationFrame(loop);
      if (!this.renderer || !this.player || !this.dungeon) return;
      if (this.state !== 'playing' && this.state !== 'paused' && this.state !== 'levelup') return;
      this.renderer.centerOn(this.player.x, this.player.y);
      this.renderer.render(this.dungeon, this.player, this.enemies, this.groundItems);
    };
    this._loopId = requestAnimationFrame(loop);
  }

  _stopRenderLoop() {
    if (this._loopId) { cancelAnimationFrame(this._loopId); this._loopId = null; }
  }

  // ═══ Input handling ════════════════════════════════════════════
  _onKey(e) {
    if (this.state === 'levelup') {
      e.preventDefault(); return; // handled by level-up buttons
    }

    if (this.state === 'playing') {
      // Movement / action keys
      const DIRS = {
        ArrowUp:    { dx: 0, dy: -1 }, w: { dx: 0, dy: -1 }, W: { dx: 0, dy: -1 },
        ArrowDown:  { dx: 0, dy:  1 }, s: { dx: 0, dy:  1 }, S: { dx: 0, dy:  1 },
        ArrowLeft:  { dx: -1, dy: 0 }, a: { dx: -1, dy: 0 }, A: { dx: -1, dy: 0 },
        ArrowRight: { dx:  1, dy: 0 }, d: { dx:  1, dy: 0 }, D: { dx:  1, dy: 0 },
      };
      const NUMPAD = {  // keyed by e.code
        Numpad8: { dx: 0, dy: -1 }, Numpad2: { dx: 0, dy:  1 },
        Numpad4: { dx: -1, dy: 0 }, Numpad6: { dx:  1, dy: 0 },
        Numpad7: { dx: -1, dy: -1 }, Numpad9: { dx:  1, dy: -1 },
        Numpad1: { dx: -1, dy:  1 }, Numpad3: { dx:  1, dy:  1 },
      };
      const dir = DIRS[e.key] || NUMPAD[e.code];
      if (dir) {
        e.preventDefault();
        this._processTurn(dir.dx, dir.dy);
        return;
      }
      // Wait
      if (e.key === '.' || e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        this._processTurn(0, 0);
        return;
      }
      // Ability
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        this._useAbility();
        return;
      }
      // Inventory
      if (e.key >= '1' && e.key <= '6') {
        e.preventDefault();
        this._useItem(parseInt(e.key) - 1);
        return;
      }
      // Pause
      if (e.key === 'Escape') {
        e.preventDefault();
        this.state = 'paused';
        document.getElementById('pause-overlay').classList.remove('hidden');
        return;
      }
    }

    if (this.state === 'paused' && e.key === 'Escape') {
      document.getElementById('pause-overlay').classList.add('hidden');
      this.state = 'playing';
    }
  }

  // ═══ Player turn ══════════════════════════════════════════════
  _processTurn(dx, dy) {
    if (this.pendingLevelUp) return;
    const { player, dungeon } = this;
    const nx = player.x + dx, ny = player.y + dy;

    if (dx !== 0 || dy !== 0) {
      // Check for enemy at target position (bump-attack)
      const target = this.enemies.find(e => e.isAlive && e.x === nx && e.y === ny);
      if (target) {
        const dmg = player.attackTarget(target);
        this.renderer.spawnDamageNumber(target.x, target.y, `-${dmg}`, '#ff6060');
        this.addLog(`You strike ${target.name} for ${dmg} damage!`, 'combat');

        if (!target.isAlive) {
          this.addLog(`${target.name} is defeated! +${target.xpValue} XP, +${target.goldValue} gold.`, 'item');
          player.kills++;
          player.gold += target.goldValue;
          const leveled = player.gainXP(target.xpValue);
          if (leveled) this._triggerLevelUp();
        }
      } else if (dungeon.isWalkable(nx, ny)) {
        player.x = nx;
        player.y = ny;
        // Check stair
        const tile = dungeon.tiles[ny][nx];
        if (tile === T.STAIR_DOWN) {
          if (this.floor >= TOTAL_FLOORS) {
            this._victory();
            return;
          }
          this.addLog('You descend deeper into the dark…', 'floor');
          this.floor++;
          this._loadFloor(null, false);
          return;
        }
        if (tile === T.STAIR_UP && this.floor > 1) {
          this.addLog('You climb back up…', 'floor');
          this.floor--;
          this._loadFloor(null, false);
          return;
        }
      }
    }

    // Pickup item on tile
    const giIdx = this.groundItems.findIndex(gi => gi.x === player.x && gi.y === player.y);
    if (giIdx !== -1) {
      const gi = this.groundItems[giIdx];
      if (player.pickupItem(gi.item)) {
        this.groundItems.splice(giIdx, 1);
        this.addLog(`You pick up ${gi.item.emoji} ${gi.item.name}.`, 'item');
      } else {
        this.addLog('Inventory full! Drop or use an item first (1-6).', 'warning');
      }
    }

    // FOV
    dungeon.computeFOV(player.x, player.y, FOV_RADIUS);

    // Alert enemies in view
    for (const e of this.enemies) {
      if (e.isAlive && dungeon.visible[e.y]?.[e.x]) e.alerted = true;
    }

    // Enemy turns
    this._processEnemyTurns();

    // Player tick
    player.tickTurn();

    this._updateUI();

    if (!player.isAlive) this._gameOver();
  }

  // ═══ Enemy turns ══════════════════════════════════════════════
  _processEnemyTurns() {
    const { player, dungeon, enemies } = this;
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;

      // Use Chebyshev distance so diagonal adjacency counts
      const cheby = Math.max(Math.abs(enemy.x - player.x), Math.abs(enemy.y - player.y));

      // Stunned enemies skip their turn
      if (enemy.stunned > 0) {
        enemy.stunned--;
        continue;
      }

      // Adjacent? → Attack
      if (cheby === 1) {
        const dmg = enemy.attackPlayer(player);
        this.renderer.triggerFlash();
        this.renderer.spawnDamageNumber(player.x, player.y, `-${dmg}`, '#ff9090');
        if (dmg > 5) {
          this.addLog(`${enemy.name} hits you hard for ${dmg} damage!`, 'combat');
        } else {
          this.addLog(`${enemy.name} hits you for ${dmg} damage.`, 'combat');
        }
        if (!player.isAlive) return;
      } else {
        // Move toward player
        const { dx, dy } = enemy.think(player.x, player.y, dungeon, enemies);
        const nx = enemy.x + dx, ny = enemy.y + dy;
        if (dungeon.isWalkable(nx, ny)) {
          // Don't walk onto player
          if (nx !== player.x || ny !== player.y) {
            enemy.x = nx; enemy.y = ny;
          }
        }
      }
    }
  }

  // ═══ Ability ══════════════════════════════════════════════════
  _useAbility() {
    const result = this.player.useAbility(this.enemies, this.dungeon);
    if (!result) return;
    this.addLog(result.msg, result.type);
    if (result.type !== 'warning') {
      this._processEnemyTurns();
      this.player.tickTurn();
      this._updateUI();
    }
  }

  // ═══ Use inventory item ═══════════════════════════════════════
  _useItem(index) {
    const msg = this.player.useItem(index, this.dungeon);
    if (msg) {
      this.addLog(msg, 'item');
      this._processEnemyTurns();
      this.player.tickTurn();
      this._updateUI();
    }
  }

  // ═══ Level up ═════════════════════════════════════════════════
  _triggerLevelUp() {
    this.pendingLevelUp = true;
    this.state = 'levelup';
    this.addLog(`✨ Level Up! Now level ${this.player.level}!`, 'special');

    const overlay = document.getElementById('levelup-overlay');
    document.getElementById('levelup-text').textContent =
      `You reached level ${this.player.level}!`;

    const choicesEl = document.getElementById('levelup-choices');
    choicesEl.innerHTML = '';

    // Pick 3 random bonuses (no duplicates)
    const shuffled = [...LEVEL_BONUSES].sort(() => Math.random() - 0.5).slice(0, 3);
    for (const bonus of shuffled) {
      const btn = document.createElement('button');
      btn.className = 'levelup-btn';
      btn.textContent = bonus.label;
      btn.addEventListener('click', () => {
        bonus.apply(this.player);
        overlay.classList.add('hidden');
        this.state = 'playing';
        this.pendingLevelUp = false;
        this._updateUI();
        this.addLog(`Bonus chosen: ${bonus.label}`, 'special');
      });
      choicesEl.appendChild(btn);
    }

    overlay.classList.remove('hidden');
  }

  // ═══ Game Over ════════════════════════════════════════════════
  _gameOver() {
    const p = this.player;
    const score = this._calcScore();
    this._submitArcadeScore(score);   // fire-and-forget

    document.getElementById('go-floor').textContent = this.floor;
    document.getElementById('go-kills').textContent = p.kills;
    document.getElementById('go-gold').textContent  = p.gold;
    document.getElementById('go-score').textContent = score;

    const flavours = [
      'The bugs claim another soul.',
      'The darkness swallows you whole.',
      'You are added to the hive\'s compost.',
      'Your shell is cracked. Your journey ends.',
    ];
    document.getElementById('gameover-flavor').textContent =
      flavours[Math.floor(Math.random() * flavours.length)];

    this._showScreen('gameover');
  }

  _victory() {
    const p = this.player;
    const score = this._calcScore() + 1000;  // victory bonus
    this._submitArcadeScore(score);   // fire-and-forget

    document.getElementById('win-kills').textContent = p.kills;
    document.getElementById('win-gold').textContent  = p.gold;
    document.getElementById('win-score').textContent = score;

    this._showScreen('victory');
  }

  _calcScore() {
    const p = this.player;
    return p.kills * 15 + p.gold + (this.floor - 1) * 100 + p.level * 50;
  }

  // ═══ High scores (via Arcade leaderboard) ════════════════════
  async _loadScoresDisplay() {
    const el = document.getElementById('scores-list');
    if (!el) return;

    if (!this._arcadeReady) {
      el.innerHTML = '<div class="score-empty">Leaderboard offline — play a game to connect!</div>';
      return;
    }

    el.innerHTML = '<div class="score-empty">Loading…</div>';

    const board = await this._arcade.getLeaderboard();
    if (!board || !board.leaderboard || board.leaderboard.length === 0) {
      el.innerHTML = '<div class="score-empty">No scores yet. Go crawl!</div>';
      return;
    }

    const emojiMap = { beetle: '🪲', spider: '🕷️', mosquito: '🦟' };
    el.innerHTML = board.leaderboard.map(entry => {
      const emoji = emojiMap[entry.meta?.class] ?? '🐛';
      const floor = entry.meta?.floor ?? '?';
      return `
        <div class="score-row">
          <span class="score-rank">${entry.rank}</span>
          <span class="score-class">${emoji}</span>
          <span class="score-name">${entry.playerName} — Floor ${floor}</span>
          <span class="score-pts">${entry.primaryScore}</span>
        </div>
      `;
    }).join('');
  }

  // ═══ UI updates ═══════════════════════════════════════════════
  _updateUI() {
    const p = this.player;
    // HP bar
    const hpPct = Math.max(0, (p.hp / p.maxHp) * 100);
    document.getElementById('hp-bar').style.width = `${hpPct}%`;
    document.getElementById('ui-hp').textContent  = `${Math.max(0,p.hp)}/${p.maxHp}`;
    // XP bar
    const xpNeeded = p.xpToNext;
    const xpPct = Math.min(100, (p.xp / xpNeeded) * 100);
    document.getElementById('xp-bar').style.width = `${xpPct}%`;
    document.getElementById('ui-xp').textContent  = `${p.xp}/${xpNeeded}`;

    document.getElementById('ui-level').textContent    = `Level ${p.level}`;
    document.getElementById('ui-atk').textContent      = p.atk;
    document.getElementById('ui-def').textContent      = p.shelled ? `${p.def}✕2` : p.def;
    document.getElementById('ui-spd').textContent      = p.spd;
    document.getElementById('ui-gold').textContent     = p.gold;
    document.getElementById('ui-emoji').textContent    = p.emoji;
    document.getElementById('ui-classname').textContent = p.name;

    // Ability cooldown
    const cdEl = document.getElementById('ui-ability-cd');
    if (p.abilityCooldown > 0) {
      cdEl.textContent = `Cooldown: ${p.abilityCooldown} turns`;
    } else {
      cdEl.textContent = 'Ready!';
    }
    if (p.abilityDuration > 0) {
      cdEl.textContent += ` (active ${p.abilityDuration}t)`;
    }
    document.getElementById('ui-ability-name').textContent = p.abilityDef.name;

    // Inventory
    this._updateInventoryUI();
  }

  _updateFloorUI() {
    const theme = FLOOR_THEMES[this.floor];
    document.getElementById('ui-floor-name').textContent = `Floor ${this.floor}: ${theme.name}`;
    document.getElementById('ui-floor-num').textContent  = `Depth ${this.floor} / ${TOTAL_FLOORS}`;
  }

  _updateInventoryUI() {
    const inv = this.player.inventory;
    document.getElementById('ui-inv-count').textContent = `(${inv.length}/6)`;
    const grid = document.getElementById('ui-inventory');
    grid.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      if (inv[i]) {
        slot.innerHTML = `
          <span class="item-key">${i+1}</span>
          <span class="item-emoji">${inv[i].emoji}</span>
          <span class="item-label">${inv[i].name}</span>`;
        slot.title = inv[i].desc;
        const idx = i;
        slot.addEventListener('click', () => this._useItem(idx));
      } else {
        slot.innerHTML = `<span class="item-key">${i+1}</span>`;
        slot.style.opacity = '0.3';
      }
      grid.appendChild(slot);
    }
  }

  // ═══ Message log ══════════════════════════════════════════════
  addLog(msg, type = '') {
    const log = document.getElementById('message-log');
    const div = document.createElement('div');
    div.className = `log-msg ${type}`;
    div.textContent = msg;
    log.prepend(div);
    // Keep only last 40 messages
    while (log.children.length > 40) log.removeChild(log.lastChild);
  }
}
