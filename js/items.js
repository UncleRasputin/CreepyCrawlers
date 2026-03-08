// ═══════════════════════════════════════════════════════════════
//  items.js  —  Item definitions and pickup effects
// ═══════════════════════════════════════════════════════════════

export const ITEM_DEFS = {
  // Healing
  leaf_wrap: {
    id: 'leaf_wrap', name: 'Leaf Wrap', emoji: '🍃',
    desc: 'Restores 15 HP',
    type: 'consumable',
    use(player) { const h = Math.min(15, player.maxHp - player.hp); player.hp += h; return `You use a Leaf Wrap. +${h} HP.`; },
  },
  dew_drop: {
    id: 'dew_drop', name: 'Dew Drop', emoji: '💧',
    desc: 'Restores 10 HP',
    type: 'consumable',
    use(player) { const h = Math.min(10, player.maxHp - player.hp); player.hp += h; return `You drink a Dew Drop. +${h} HP.`; },
  },
  herb_bundle: {
    id: 'herb_bundle', name: 'Herb Bundle', emoji: '🌿',
    desc: 'Restores 30 HP',
    type: 'consumable',
    use(player) { const h = Math.min(30, player.maxHp - player.hp); player.hp += h; return `Herb Bundle restores +${h} HP!`; },
  },
  honey_glob: {
    id: 'honey_glob', name: 'Honey Glob', emoji: '🍯',
    desc: 'Restores 20 HP',
    type: 'consumable',
    use(player) { const h = Math.min(20, player.maxHp - player.hp); player.hp += h; return `Sweet honey! +${h} HP.`; },
  },
  // Attack boosts
  thorn_shard: {
    id: 'thorn_shard', name: 'Thorn Shard', emoji: '🌵',
    desc: 'Permanently +3 ATK',
    type: 'consumable',
    use(player) { player.atk += 3; return `Thorn Shard equipped! ATK +3.`; },
  },
  venom_gland: {
    id: 'venom_gland', name: 'Venom Gland', emoji: '☠️',
    desc: 'Permanently +4 ATK',
    type: 'consumable',
    use(player) { player.atk += 4; return `Venom Gland absorbed! ATK +4.`; },
  },
  // Defense boosts
  bark_shield: {
    id: 'bark_shield', name: 'Bark Shield', emoji: '🪵',
    desc: 'Permanently +3 DEF',
    type: 'consumable',
    use(player) { player.def += 3; return `Bark Shield equipped! DEF +3.`; },
  },
  chitin_plate: {
    id: 'chitin_plate', name: 'Chitin Plate', emoji: '🦺',
    desc: 'Permanently +4 DEF',
    type: 'consumable',
    use(player) { player.def += 4; return `Chitin Plate equipped! DEF +4.`; },
  },
  // Misc
  amber_crystal: {
    id: 'amber_crystal', name: 'Amber Crystal', emoji: '💎',
    desc: '+30 Gold',
    type: 'consumable',
    use(player) { player.gold += 30; return `Amber Crystal! +30 Gold.`; },
  },
  antennae_tuner: {
    id: 'antennae_tuner', name: 'Antennae Tuner', emoji: '📡',
    desc: 'Reveal the whole floor map',
    type: 'consumable',
    use(player, dungeon) {
      for (let y = 0; y < dungeon.height; y++)
        for (let x = 0; x < dungeon.width; x++)
          dungeon.explored[y][x] = 1;
      return `Antennae Tuner reveals the map!`;
    },
  },
  max_nectar: {
    id: 'max_nectar', name: 'Royal Nectar', emoji: '🍵',
    desc: 'Fully restore HP',
    type: 'consumable',
    use(player) { const h = player.maxHp - player.hp; player.hp = player.maxHp; return `Royal Nectar fully restores HP! +${h} HP.`; },
  },
};

// Item pools per floor
export const ITEM_POOLS = {
  1: ['leaf_wrap','dew_drop','thorn_shard','bark_shield','amber_crystal'],
  2: ['leaf_wrap','dew_drop','herb_bundle','thorn_shard','bark_shield','amber_crystal','antennae_tuner'],
  3: ['herb_bundle','honey_glob','thorn_shard','venom_gland','bark_shield','chitin_plate','amber_crystal'],
  4: ['herb_bundle','honey_glob','venom_gland','chitin_plate','amber_crystal','antennae_tuner'],
  5: ['honey_glob','venom_gland','chitin_plate','max_nectar','amber_crystal'],
};

export function randomItem(floorNum) {
  const pool = ITEM_POOLS[floorNum] || ITEM_POOLS[1];
  const id = pool[Math.floor(Math.random() * pool.length)];
  return { ...ITEM_DEFS[id] };
}
