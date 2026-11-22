import {
  PERSONALITIES, START_NEEDS, DECAY_PER_HOUR, ENERGY_MAX, ENERGY_REGEN_MS, LEVEL_XP, REWARDS, HURT_THRESHOLD,
  WORRIES_PER_DAY, HISTORY_SIZE, SAVE_KEY,
} from './config.js';

const HOUR_MS = 60 * 60 * 1000;
const MAX_TEXT = 200;
const MAX_MEMORY = 8;
const MAX_MEMORY_TEXT = 60;

const clampPercent = (value) => Math.max(0, Math.min(100, value));
const dayKey = (now) => new Date(now).toDateString(); // local date: worries reset at the player's midnight

export function levelForXp(xp) {
  let level = 1;
  while (level < LEVEL_XP.length && xp >= LEVEL_XP[level]) level++;
  return level;
}

function freshState(now) {
  const keys = Object.keys(PERSONALITIES);
  return {
    version: 2,
    personality: keys[Math.floor(Math.random() * keys.length)],
    social: START_NEEDS.social,
    bond: START_NEEDS.bond,
    xp: 0,
    energy: ENERGY_MAX,
    energyAt: now,
    needsAt: now,
    worryDay: dayKey(now),
    worriesUsed: 0,
    worry: null,
    history: [],
    memory: [],
  };
}

function isSave(saved) {
  return saved?.version === 2
    && saved.personality in PERSONALITIES
    && ['social', 'bond', 'xp', 'energy', 'energyAt', 'needsAt', 'worriesUsed'].every((key) => Number.isFinite(saved[key]))
    && Array.isArray(saved.history) && Array.isArray(saved.memory);
}

function loadState(now) {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (isSave(saved)) return saved;
  } catch {
    // private mode or corrupted data: a fresh Emot instead of a crash
  }
  return freshState(now);
}

// Owns everything that is saved: personality, needs, affinity, energy, today's worries, short memory.
// Time-based changes are computed from timestamps, so closing the tab still lets time pass.
export class Game {
  constructor(now) {
    this.state = loadState(now);
    this.tick(now);
  }

  get level() {
    return levelForXp(this.state.xp);
  }

  get worriesLeft() {
    return WORRIES_PER_DAY - this.state.worriesUsed;
  }

  get canAskWorry() {
    return this.worriesLeft > 0 && !this.state.worry;
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

    if (state.worryDay !== dayKey(now)) {
      state.worryDay = dayKey(now);
      state.worriesUsed = 0;
      state.worry = null;
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
    return { ...this.context(), hour: new Date(now).getHours(), memory: this.state.memory, history: this.state.history };
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

  applyLine(line) {
    this.remember('emot', line.text);
    if (Array.isArray(line.memory)) {
      this.state.memory = line.memory
        .filter((item) => typeof item === 'string' && item.trim())
        .slice(0, MAX_MEMORY)
        .map((item) => item.slice(0, MAX_MEMORY_TEXT));
    }
    return this.change(REWARDS.line);
  }

  // warmth: Jev score 0..4. hurtful: Jev probability 0..1.
  applySend(text, warmth, hurtful) {
    this.remember('player', text);
    const { send, hurt } = REWARDS;
    if (hurtful >= HURT_THRESHOLD) return this.change({ social: send.social, bond: hurt.bond, xp: hurt.xp });
    return this.change({
      social: send.social,
      bond: warmth * send.bondPerWarmth,
      xp: send.xp + warmth * send.xpPerWarmth,
    });
  }

  startWorry(text) {
    this.state.worry = text;
    this.state.worriesUsed++;
    this.remember('emot', text);
  }

  // score: Jev's 0..4 rating of how well the answer met the worry.
  applyAnswer(text, score) {
    this.state.worry = null;
    this.remember('player', text);
    const { answer } = REWARDS;
    return this.change({ social: answer.social, bond: score * answer.bondPerScore, xp: score * answer.xpPerScore });
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch {
      // storage blocked: the game still runs, progress just isn't kept
    }
  }
}
