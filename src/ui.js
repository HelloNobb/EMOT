import { ACTIONS } from './config.js';
import { moneyForLevel } from './sim.js';

// Only writes into elements that index.html already declares.
const element = (id) => document.getElementById(id);

const stats = {
  money: element('money'),
  level: element('level'),
  levelBar: element('level-bar'),
  hunger: element('hunger'),
  hungerBar: element('hunger-bar'),
  fatigue: element('fatigue'),
  fatigueBar: element('fatigue-bar'),
  action: element('action'),
};

const PHASE_LABEL = { moving: '(이동 중)', using: '' };

export function showStats(sim) {
  const { hunger, fatigue, money } = sim.state;
  const level = sim.level;
  const from = moneyForLevel(level);
  const to = moneyForLevel(level + 1);
  stats.money.textContent = Math.floor(money).toLocaleString();
  stats.level.textContent = `${level}  (${Math.floor(money)}/${to})`;
  stats.levelBar.style.width = `${((money - from) / (to - from)) * 100}%`;
  stats.hunger.textContent = Math.round(hunger);
  stats.hungerBar.style.width = `${hunger}%`;
  stats.fatigue.textContent = Math.round(fatigue);
  stats.fatigueBar.style.width = `${fatigue}%`;
  stats.action.textContent = sim.action ? `${ACTIONS[sim.action].label} ${PHASE_LABEL[sim.phase]}` : '대기';
}
