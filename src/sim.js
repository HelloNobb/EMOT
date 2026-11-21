import {
  NEED_DRIFT, START_NEEDS, ACTIONS, CHOOSE_EAT_AT, CHOOSE_SLEEP_AT, CHOOSE_REST_AT, STOP_WORK_AT,
  IDLE_PAUSE_SECONDS, COINS_PER_SECOND, LEVEL_MONEY_UNIT, MINING_BONUS_PER_LEVEL, SAVE_KEY,
} from './config.js';

const clamp = (value) => Math.max(0, Math.min(100, value));

export function levelForMoney(money) {
  return Math.floor(Math.sqrt(money / LEVEL_MONEY_UNIT)) + 1;
}

export function moneyForLevel(level) {
  return (level - 1) ** 2 * LEVEL_MONEY_UNIT;
}

function loadSave() {
  const fallback = { ...START_NEEDS, money: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!saved) return fallback;
    const valid = (value) => Number.isFinite(value) && value >= 0;
    return {
      hunger: valid(saved.hunger) ? clamp(saved.hunger) : fallback.hunger,
      fatigue: valid(saved.fatigue) ? clamp(saved.fatigue) : fallback.fatigue,
      money: valid(saved.money) ? saved.money : 0,
    };
  } catch {
    return fallback; // private mode or corrupted data: start fresh rather than crash
  }
}

// The brain: owns needs and money, decides what to do, tells the character's body where to go.
// Phases: idle (short pause) -> moving (walking to the spot) -> using (needs change) -> idle.
export class Sim {
  constructor(character, spots) {
    this.character = character;
    this.spots = spots;
    this.state = loadSave();
    this.action = null;
    this.phase = 'idle';
    this.idleTimer = IDLE_PAUSE_SECONDS;
    this.elapsed = 0;
  }

  get level() {
    return levelForMoney(this.state.money);
  }

  get isWorking() {
    return this.action === 'work' && this.phase === 'using';
  }

  // Player click: interrupts whatever is running.
  command(action) {
    this.start(action);
  }

  context() {
    return {
      hunger: Math.round(this.state.hunger),
      fatigue: Math.round(this.state.fatigue),
      action: this.phase === 'using' ? this.action : null,
      level: this.level,
    };
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch {
      // storage blocked: the game still runs, progress just isn't kept
    }
  }

  update(dt) {
    const state = this.state;
    state.hunger += NEED_DRIFT.hunger * dt;
    state.fatigue += NEED_DRIFT.fatigue * dt;

    if (this.phase === 'idle') {
      this.idleTimer -= dt;
      if (this.idleTimer <= 0) this.start(this.choose());
    } else if (this.phase === 'moving') {
      if (this.character.arrived) {
        this.phase = 'using';
        this.character.use(this.spots[this.action], ACTIONS[this.action].pose);
      }
    } else {
      this.use(dt);
    }

    state.hunger = clamp(state.hunger);
    state.fatigue = clamp(state.fatigue);
  }

  choose() {
    const { hunger, fatigue } = this.state;
    if (hunger >= CHOOSE_EAT_AT) return 'eat';
    if (fatigue >= CHOOSE_SLEEP_AT) return 'sleep';
    if (fatigue >= CHOOSE_REST_AT) return 'rest';
    return 'work';
  }

  start(action) {
    this.action = action;
    this.phase = 'moving';
    this.elapsed = 0;
    this.character.moveTo(this.spots[action]);
  }

  use(dt) {
    const definition = ACTIONS[this.action];
    for (const [need, rate] of Object.entries(definition.rates)) this.state[need] += rate * dt;
    if (definition.mines) {
      this.state.money += COINS_PER_SECOND * (1 + MINING_BONUS_PER_LEVEL * (this.level - 1)) * dt;
    }
    this.elapsed += dt;
    if (this.isDone(definition)) this.finish();
  }

  isDone(definition) {
    if (this.elapsed >= definition.maxSeconds) return true;
    const lowered = Object.entries(definition.rates).filter(([, rate]) => rate < 0);
    if (lowered.length > 0 && lowered.every(([need]) => this.state[need] <= 0)) return true;
    if (definition.mines) return this.state.hunger >= STOP_WORK_AT || this.state.fatigue >= STOP_WORK_AT;
    return false;
  }

  finish() {
    this.action = null;
    this.phase = 'idle';
    this.idleTimer = IDLE_PAUSE_SECONDS;
    this.character.idle();
  }
}
