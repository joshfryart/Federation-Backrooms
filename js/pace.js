// Shift length / pace presets (Systems Nominal). Pure data + logic; the small DOM part (title-screen segmented control) is guarded.
// One scalar T (= watch length in minutes / 20) stretches *ship time*: ShipClock rate (js/clock.js setPace), Duty periods / first-due /
// task times (js/duty.js constructor), Phases PHASE_AT / pulse / hazard (js/phases.js constructor), ShipState cascade timers
// (crew.js ShipState.paceT) and therefore the sim schedule (js/sim.js reads the clock). Action time stays real seconds: walking,
// perform durations, lift rides, hold-E and NPC repair work, hazard damage per second.  Design: docs/mockups/pacing-npc.md §3, docs/pacing.md.
//   PACES[id]            the preset tables      paceFor(id) -> preset (unknown -> standard)
//   readPace(search, storage, webdriver)        URL ?pace= override > localStorage fb_pace > default (first watch the first time; standard under webdriver)
//   savePace(id, storage)   mountPaceControl(document, onChange)   title-screen segmented control + one-line summary
export const PACES = {
  first: {
    id: 'first', label: 'First watch', T: 2.5, minutes: 50, blurb: 'calm, long windows, guided first task',
    phaseAt: [0, 540, 1140, 1800, 2400],               // real seconds (proposal 3.2): nominal 9 min, degraded 19, collapse 40
    firstDue: 180, dueGap: 75, dueJitter: 45,           // first duty round at 3:00, the rest spread 75 s apart (+0-45 s)
    firstTask: 240, performMul: 1,                      // no mission task before 4:00; perform time is action time
    pulseMin: 22, debtPerPhase: 7, hazardMul: 0.6, hazardWarn: 20, lethalDelay: 60, weakFor: 90,
    notice: [10, 22], setup: [4, 6], workPer: 8, npcHp: 0.9, escalate: [130, 220], walkMul: 0.9,
    bark: { range: 2.2, dwell: 2.0, person: 420, global: 120, grace: 180, nodPerson: 45, nodGlobal: 8 },
  },
  standard: {
    id: 'standard', label: 'Standard', T: 1, minutes: 20, blurb: "today's numbers",
    phaseAt: [0, 150, 330, 540, 780], firstDue: 30, dueGap: 20, dueJitter: 30, firstTask: 96, performMul: 1,
    pulseMin: 9, debtPerPhase: 5, hazardMul: 1, hazardWarn: 0, lethalDelay: 0, weakFor: 120,
    notice: [6, 14], setup: [3, 5], workPer: 6, npcHp: 0.85, escalate: [90, 150], walkMul: 1,
    bark: { range: 2.4, dwell: 1.6, person: 300, global: 90, grace: 60, nodPerson: 45, nodGlobal: 8 },
  },
  crunch: {
    id: 'crunch', label: 'Crunch', T: 0.7, minutes: 14, blurb: 'pressure, short windows, faster pulses',
    phaseAt: [0, 100, 220, 360, 520], firstDue: 20, dueGap: 15, dueJitter: 20, firstTask: 67, performMul: 0.9,
    pulseMin: 6, debtPerPhase: 4, hazardMul: 1, hazardWarn: 0, lethalDelay: 0, weakFor: 150,
    notice: [4, 10], setup: [3, 4], workPer: 5, npcHp: 0.8, escalate: [70, 110], walkMul: 1.1,
    bark: { range: 2.4, dwell: 1.6, person: 240, global: 60, grace: 60, nodPerson: 45, nodGlobal: 8 },
  },
};
export const PACE_IDS = Object.keys(PACES);
export const paceFor = (id) => PACES[id] || PACES.standard;
export const runSeconds = (p) => 1200 * paceFor(p?.id ?? p).T;   // the whole watch in real seconds
export const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
// one line for the title screen: "First watch · about 50 min · first duty at 3:00 · first task at 4:00"
export const paceSummary = (p) => { p = paceFor(p?.id ?? p); return `${p.label} · about ${p.minutes} min · first duty at ${fmtClock(p.firstDue)} · tasks due by end of shift · ${p.blurb}`; };

// URL ?pace=first|standard|crunch > stored choice > first watch for a new profile (standard under webdriver so tests keep today's timings)
export function readPace(search = '', storage = null, webdriver = false) {
  const q = new URLSearchParams(search).get('pace'); if (q && PACES[q]) return PACES[q];
  try { const s = storage?.getItem('fb_pace'); if (s) { const id = s.startsWith('{') ? JSON.parse(s).preset : s; if (PACES[id]) return PACES[id]; } } catch (e) { /* private window / blocked storage */ }
  return webdriver ? PACES.standard : PACES.first;
}
export function savePace(id, storage = null) { try { storage?.setItem('fb_pace', JSON.stringify({ preset: paceFor(id).id, minutes: paceFor(id).minutes })); } catch (e) { /* ignore */ } }

// Title-screen control: <div id="pacesel"> with one button per preset (data-pace) and <div id="pacesum">. onChange(preset) after a click.
export function mountPaceControl(doc, current, onChange = () => {}) {
  const box = doc?.getElementById?.('pacesel'), sum = doc?.getElementById?.('pacesum'); if (!box) return null;
  const paint = (p) => { for (const b of box.querySelectorAll('[data-pace]')) { const on = b.dataset.pace === p.id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); } if (sum) sum.textContent = paceSummary(p); };
  box.addEventListener('click', (e) => { const b = e.target.closest?.('[data-pace]'); if (!b) return; const p = paceFor(b.dataset.pace); paint(p); onChange(p); });
  paint(current); return { paint };
}
