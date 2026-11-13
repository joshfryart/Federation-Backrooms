// Settings, progress and run stats in localStorage (every access wrapped in try/catch: private windows / blocked storage just mean "nothing is saved").
//   const S = createSave(localStorage)           storage is injectable so tools/test-save.mjs runs in node
//   S.recordRun({ deck, kills, time, furbles, won, ship, cause })   -> updated stats
//   S.stats()   S.reset()   S.best()   S.setBest(n)
//   mountStatsScreen(doc, S, { show, back })     adds a "Statistics" button to the title screen and a #statsscreen
// Keys: fb_cfg (settings, owned by main.js), fb_best (best deck), fb_stats (this module).
const KEY = 'fb_stats', BEST = 'fb_best', MAX_HISTORY = 12;
const blank = () => ({ v: 1, runs: 0, wins: 0, deaths: 0, bestDeck: 0, decks: 0, kills: 0, furbles: 0, time: 0, longest: 0, history: [] });

export function createSave(storage) {
  const get = (k) => { try { return storage ? storage.getItem(k) : null; } catch { return null; } };
  const set = (k, v) => { try { if (storage) storage.setItem(k, v); return true; } catch { return false; } };
  const num = (x) => (Number.isFinite(+x) && +x > 0 ? +x : 0);
  function stats() {
    let s = blank();
    try { const raw = JSON.parse(get(KEY) || 'null'); if (raw && typeof raw === 'object') { for (const k of Object.keys(s)) if (k !== 'history' && k !== 'v') s[k] = num(raw[k]); if (Array.isArray(raw.history)) s.history = raw.history.slice(0, MAX_HISTORY).filter(h => h && typeof h === 'object'); } } catch { s = blank(); }
    s.bestDeck = Math.max(s.bestDeck, num(get(BEST)));
    return s;
  }
  function recordRun(r = {}) {
    const s = stats(), deck = Math.max(0, Math.floor(num(r.deck))), time = num(r.time), kills = Math.floor(num(r.kills)), furbles = Math.floor(num(r.furbles));
    s.runs++; if (r.won) s.wins++; else s.deaths++;
    s.bestDeck = Math.max(s.bestDeck, deck); s.decks += deck; s.kills += kills; s.furbles += furbles; s.time += time; s.longest = Math.max(s.longest, time);
    s.history.unshift({ deck, kills, furbles, time: Math.round(time), won: !!r.won, ship: String(r.ship || '').slice(0, 40), cause: String(r.cause || '').slice(0, 40), at: Date.now() });
    s.history.length = Math.min(s.history.length, MAX_HISTORY);
    set(KEY, JSON.stringify(s)); if (s.bestDeck > num(get(BEST))) set(BEST, String(s.bestDeck));
    return s;
  }
  return { stats, recordRun, best: () => stats().bestDeck, setBest: (n) => { if (num(n) > num(get(BEST))) set(BEST, String(Math.floor(num(n)))); }, reset: () => { set(KEY, JSON.stringify(blank())); }, get, set };
}

export const fmtDuration = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s % 60).padStart(2, '0')}`; };
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function statsHTML(s) {
  const row = (a, b) => `<div class="st-row"><span>${a}</span><b>${b}</b></div>`;
  const hist = s.history.length ? `<table class="st-hist"><tr><th>Result</th><th>Deck</th><th>Stunned</th><th>Time</th><th>Ship</th></tr>${s.history.map(h => `<tr><td>${h.won ? 'Escaped' : 'Lost'}</td><td>${h.deck}</td><td>${h.kills}</td><td>${fmtDuration(h.time)}</td><td>${esc(h.ship)}</td></tr>`).join('')}</table>` : '<p>No runs on file yet.</p>';
  return `<div class="st-grid">${row('Runs', s.runs)}${row('Escapes', s.wins)}${row('Casualties', s.deaths)}${row('Best deck', s.bestDeck || '-')}${row('Decks reached (total)', s.decks)}${row('Hostiles stunned', s.kills)}${row('Furbles rescued', s.furbles)}${row('Time on shift', fmtDuration(s.time))}${row('Longest run', fmtDuration(s.longest))}</div><h4>Recent runs</h4>${hist}`;
}

export function mountStatsScreen(doc, save, { show, back }) {
  const host = doc.getElementById('statsscreen');
  if (!host) return;
  const body = host.querySelector('#statsbody'), refresh = () => { body.innerHTML = statsHTML(save.stats()); };
  const btn = doc.getElementById('statsbtn'); if (btn) btn.onclick = () => { refresh(); show('statsscreen'); };
  host.querySelector('#statsback').onclick = () => back();
  host.querySelector('#statsreset').onclick = () => { if (confirm('Erase all saved run statistics?')) { save.reset(); refresh(); } };
  return { refresh };
}
