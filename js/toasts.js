// Toasts as icon + 3-5 words (Systems Nominal). G.say(msg, cls, { icon, short }) keeps its old signature: callers that
// pass a full sentence are mapped by SAY_RULES below to an icon and a short label; the full sentence is kept in
// G.sayLog (and as the tooltip). Explicit opts win. Pure (no DOM) so the mapping is unit-tested in tools/test-ui.mjs.
//   toastOf('Duty: Reactor log (engineering). [J]', 'comp') -> { icon: 'duty', text: 'Due: Reactor log', full, cls }
import { iconSvg } from './icons.js';

const words = (s, n) => { const w = String(s).replace(/\s+/g, ' ').trim().split(' '); return w.length > n ? w.slice(0, n).join(' ') + '…' : w.join(' '); };
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
// [pattern, icon, (match) => short text]   first match wins
export const SAY_RULES = [
  [/^Duty: (.+?) \((.+?)\)/, 'duty', m => 'Due: ' + words(m[1], 3)],
  [/^Task now: (.+?) \(/, 'mission', m => 'Task: ' + words(m[1], 3)],
  [/^Task (\w+): (.+)/, 'check', m => words(m[2], 3) + ' ' + m[1]],
  [/^(.+?): done properly\.?$/, 'proper', m => words(m[1], 3) + ' done'],
  [/^You never got to: (.+?)\.?$/, 'skip', m => 'Missed: ' + words(m[1], 3)],
  [/^(.+?): (rushed|faked|skipped)\.?$/, null, m => words(m[1], 3) + ' ' + m[2], m => ({ rushed: 'rush', faked: 'fake', skipped: 'skip' })[m[2]]],
  [/^(.+?) is (degraded|offline) — neglected/, 'warn', m => words(m[1], 2) + ' ' + m[2]],
  [/^Missed: (.+?)\./, 'x', m => 'Missed: ' + words(m[1], 3)],
  [/^(\S+(?: \S+)?) finished (.+?) \((\w+)\)/, 'check', m => m[1] + ': ' + words(m[2], 2)],
  [/^(\S+(?: \S+)?) takes the job: (.+?)\.?$/, 'delegate', m => m[1] + ': ' + words(m[2], 2)],
  [/^You take: (.+?)\./, 'hand', m => 'Took ' + words(m[1], 3)],
  [/^You put (.+?) down/, 'putdown', m => 'Put down ' + words(m[1], 2)],
  [/^You give (.+?) to (.+?)\./, 'give', m => 'Gave ' + words(m[2], 2)],
  [/^In hand: (.+)/, 'tools', m => words(cap(m[1]), 3)],
  [/^Hands empty/, 'empty', () => 'Hands empty'],
  [/^Setting: (.+)/, 'gear', m => 'Setting: ' + words(m[1], 2)],
  [/^Warning: (.+?)\. Get out/, 'warn', m => words(cap(m[1]), 3) + ' — out!'],
  [/^Security: (.+?)'s badge/, 'security', m => 'Badge used: ' + m[1]],
  [/^Tubelift controller OFFLINE/, 'lift', () => 'Lift controller offline'],
  [/^You are already on Deck (\d+)/, 'lift', m => 'Already on deck ' + m[1]],
  [/terminal is dead/i, 'console', () => 'Terminal dead'],
  [/^You are now (.+?),/, 'person', m => 'You are ' + words(m[1], 3)],
  [/^Performance mode/, 'gear', () => 'Performance mode'],
  [/^(?:Do this in the|Go to the) (.+?)\.?$/, 'pin', m => 'Go to ' + words(m[1], 2)],
  [/^No one to delegate|^No one reports/, 'x', () => 'No one to delegate'],
  [/^Nothing due/, 'clock', () => 'Nothing due'],
  [/^Nothing (?:in hand|to)/, 'x', m => words(m[0], 4)],
  [/does not report to you/, 'x', () => 'Not your report'],
  [/^Computer: (.+)/, 'comms', m => words(m[1], 5)],
  [/^Reported|^Bridge, /, 'report', m => words(m[0], 4)],
  [/^(.{2,28}?): "?(.+?)"?$/, 'greet', m => m[1] + ': ' + words(m[2], 4)],   // crew speech "Name: line" (subtitles carry the full line)
];
const CLS_ICON = { warn: 'warn', good: 'check', npc: 'greet', comp: 'comms' };

/** map one message to { icon, text, full, cls } */
export function toastOf(msg, cls = '', o = {}) {
  const full = String(msg ?? '');
  if (o && (o.icon || o.short)) return { icon: o.icon || CLS_ICON[cls] || 'dots', text: o.short || words(full, 5), full, cls };
  for (const [re, icon, fn, iconFn] of SAY_RULES) { const m = re.exec(full); if (m) return { icon: icon || iconFn?.(m) || CLS_ICON[cls] || 'dots', text: fn(m), full, cls }; }
  return { icon: CLS_ICON[cls] || 'dots', text: words(full.replace(/\s*\[[A-Z ]+\]\s*/g, ' ').replace(/[.!]+$/, ''), 5), full, cls };
}
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** markup for the #toast element */
export function toastHTML(t) { return `<span class="tst" title="${esc(t.full)}">${iconSvg(t.icon, { cls: 'tico' })}<span>${esc(t.text)}</span></span>`; }
export const TOAST_CSS = `#toast .tst{display:inline-flex;align-items:center;gap:8px;background:rgba(5,8,14,.78);border-left:3px solid currentColor;padding:4px 12px 4px 8px}
#toast .tico{width:20px;height:20px;flex:none}#toast.npc .tst{text-transform:none}`;
