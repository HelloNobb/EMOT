import {
  PERSONALITIES, START_NEEDS, DECAY_PER_HOUR, ENERGY_MAX, ENERGY_REGEN_MS, LEVEL_XP, REWARDS, HURT_THRESHOLD,
  HISTORY_SIZE, SAVE_KEY, DEFAULT_NAME, MAX_NAME, MEMORY_LIMITS,
} from './config.js';

const HOUR_MS = 60 * 60 * 1000;
const MAX_TEXT = 200;

const clampPercent = (value) => Math.max(0, Math.min(100, value));

export function levelForXp(xp) {
  let level = 1;
  while (level < LEVEL_XP.length && xp >= LEVEL_XP[level]) level++;
  return level;
}

// Key-value memory: facts about the player, what Emot said about herself, and conversations worth keeping.
function emptyMemory() {
  const lists = (limits) => Object.fromEntries(Object.keys(limits).map((key) => [key, []]));
  return { player: { name: '', ...lists(MEMORY_LIMITS.player) }, self: lists(MEMORY_LIMITS.self), episodes: [] };
}

// Saves from before key-value memory held a plain list of sentences; keep them as conversations.
function migrateMemory(memory) {
  if (!Array.isArray(memory)) return memory;
  const migrated = emptyMemory();
  migrated.episodes = memory
    .filter((item) => typeof item === 'string' && item.trim())
    .slice(-MEMORY_LIMITS.episodes)
    .map((summary) => ({ day: '', summary: summary.slice(0, 80), feeling: 'neutral', weight: 2 }));
  return migrated;
}

const dayLabel = (now) => {
  const date = new Date(now);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

// Adds this turn's new facts: no duplicates, newest kept when a key is full.
function mergeFacts(target, found, limits) {
  for (const [key, limit] of Object.entries(limits)) {
    for (const fact of found?.[key] ?? []) {
      if (typeof fact !== 'string' || !fact.trim()) continue;
      const known = target[key].findIndex((item) => item.toLowerCase() === fact.trim().toLowerCase());
      if (known >= 0) target[key].splice(known, 1); // re-mentioned facts move to the newest end
      target[key].push(fact.trim());
    }
    target[key] = target[key].slice(-limit);
  }
}

// except: a personality to leave out, so meeting a new Emot never brings back the same one.
function freshState(now, except = null) {
  const keys = Object.keys(PERSONALITIES).filter((key) => key !== except);
  return {
    version: 2,
    name: DEFAULT_NAME,
    personality: keys[Math.floor(Math.random() * keys.length)],
    social: START_NEEDS.social,
    bond: START_NEEDS.bond,
    xp: 0,
    energy: ENERGY_MAX,
    energyAt: now,
    needsAt: now,
    history: [],
    memory: emptyMemory(),
  };
}

function isSave(saved) {
  return saved?.version === 2
    && saved.personality in PERSONALITIES
    && ['social', 'bond', 'xp', 'energy', 'energyAt', 'needsAt'].every((key) => Number.isFinite(saved[key]))
    && Array.isArray(saved.history) && (Array.isArray(saved.memory) || Array.isArray(saved.memory?.episodes));
}

// null when there is no usable save, so the caller knows a new Emot just arrived.
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (isSave(saved)) return { ...saved, name: saved.name ?? DEFAULT_NAME, memory: migrateMemory(saved.memory) };
  } catch {
    // private mode or corrupted data: a fresh Emot instead of a crash
  }
  return null;
}

// Owns everything that is saved: personality, needs, affinity, energy, recent talk and key memories.
// Time-based changes are computed from timestamps, so closing the tab still lets time pass.
export class Game {
  constructor(now) {
    const saved = loadState();
    this.isNew = !saved; // a new Emot gets named before anything else
    this.state = saved ?? freshState(now);
    this.tick(now);
  }

  get level() {
    return levelForXp(this.state.xp);
  }

  // Wipes this Emot and brings a new one with a different personality.
  reroll(now) {
    this.state = freshState(now, this.state.personality);
  }

  rename(name) {
    this.state.name = name.trim().slice(0, MAX_NAME) || DEFAULT_NAME;
  }

  levelProgress() {
    const level = this.level;
    const from = LEVEL_XP[level - 1];
    const to = LEVEL_XP[level] ?? null; // null at the cap
    return { level, xp: this.state.xp, from, to };
  }

  tick(now) {
    const state = this.state;
    const hours = Math.max(0, now - state.needsAt) / HOUR_MS;
    state.social = clampPercent(state.social - DECAY_PER_HOUR.social * hours);
    state.bond = clampPercent(state.bond - DECAY_PER_HOUR.bond * hours);
    state.needsAt = now;

    if (state.energy >= ENERGY_MAX) {
      state.energyAt = now; // a full bar doesn't bank time toward the next charge
    } else {
      const gained = Math.floor((now - state.energyAt) / ENERGY_REGEN_MS);
      if (gained > 0) {
        state.energy = Math.min(ENERGY_MAX, state.energy + gained);
        state.energyAt = state.energy >= ENERGY_MAX ? now : state.energyAt + gained * ENERGY_REGEN_MS;
      }
    }
  }

  // Milliseconds until the next energy, or null when full.
  energyTimer(now) {
    if (this.state.energy >= ENERGY_MAX) return null;
    return Math.max(0, ENERGY_REGEN_MS - (now - this.state.energyAt));
  }

  spendEnergy(now) {
    this.tick(now);
    if (this.state.energy <= 0) return false;
    if (this.state.energy >= ENERGY_MAX) this.state.energyAt = now; // the regen clock starts on the first spend
    this.state.energy--;
    return true;
  }

  // A failed line shouldn't cost the player anything.
  refundEnergy() {
    this.state.energy = Math.min(ENERGY_MAX, this.state.energy + 1);
  }

  context() {
    const { personality, social, bond } = this.state;
    return { personality, level: this.level, social: Math.round(social), bond: Math.round(bond) };
  }

  llmContext(now) {
    const { name, memory, history } = this.state;
    return { ...this.context(), name, hour: new Date(now).getHours(), memory, history };
  }

  remember(who, text) {
    this.state.history.push({ who, text: text.slice(0, MAX_TEXT) });
    this.state.history = this.state.history.slice(-HISTORY_SIZE);
  }

  // Applies need/XP changes and reports what happened, for the toast.
  change({ social = 0, bond = 0, xp = 0 }) {
    const before = this.level;
    const state = this.state;
    const old = { social: state.social, bond: state.bond, xp: state.xp };
    state.social = clampPercent(state.social + social);
    state.bond = clampPercent(state.bond + bond);
    // Full needs make every interaction count more: 0.5x empty .. 1.5x full.
    const gain = xp > 0 ? xp * (0.5 + (state.social + state.bond) / 200) : xp;
    state.xp = Math.max(0, state.xp + gain);
    // Report what actually changed after clamping, not what was asked for.
    return {
      social: state.social - old.social,
      bond: state.bond - old.bond,
      xp: state.xp - old.xp,
      levelChange: this.level - before,
    };
  }

  // Anything Emot said goes into the recent talk; what the Worker found new this turn is merged into memory.
  rememberLine(line, now = Date.now()) {
    this.remember('emot', line.text);
    const found = line.memory;
    if (!found) return;
    const memory = this.state.memory;
    if (found.player?.name?.trim()) memory.player.name = found.player.name.trim().slice(0, MAX_NAME);
    // Plans say "tomorrow" or "next week", so keep the day they were heard on.
    const plans = (found.player?.plans ?? []).map((plan) => `(${dayLabel(now)}) ${plan}`);
    mergeFacts(memory.player, { ...found.player, plans }, MEMORY_LIMITS.player);
    mergeFacts(memory.self, found.self, MEMORY_LIMITS.self);
    if (found.episode?.summary) {
      memory.episodes.push({ day: dayLabel(now), ...found.episode });
      // Over the cap, forget the least important conversation, oldest first among equals.
      while (memory.episodes.length > MEMORY_LIMITS.episodes) {
        const lightest = Math.min(...memory.episodes.map((episode) => episode.weight));
        memory.episodes.splice(memory.episodes.findIndex((episode) => episode.weight === lightest), 1);
      }
    }
  }

  // Emot spoke first after a touch (the touch is what earns the reward; replies earn through applySend).
  applyLine(line) {
    this.rememberLine(line);
    return this.change(REWARDS.line);
  }

  // warmth: Jev score 0..4. hurtful: Jev probability 0..1. The message itself is remembered on send.
  applySend(warmth, hurtful) {
    const { send, hurt } = REWARDS;
    if (hurtful >= HURT_THRESHOLD) return this.change({ social: send.social, bond: hurt.bond, xp: hurt.xp });
    return this.change({
      social: send.social,
      bond: warmth * send.bondPerWarmth,
      xp: send.xp + warmth * send.xpPerWarmth,
    });
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch {
      // storage blocked: the game still runs, progress just isn't kept
    }
  }
}
