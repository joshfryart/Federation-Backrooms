// Save UI: top-10 board table (title + end screens) and the Export / Import / Reset buttons (pause menu). Uses the LCARS button classes (css/lcars-buttons.css).
//   renderBoard(el, save, mode, highlight)   fills el with the mode's top 10 (highlight = rank to mark, from recordRun)
//   mountSaveControls(doc, save, hooks)      adds the buttons to #pause .settings; hooks.onChange() lets main.js reload in-memory settings after import / reset
import { rowText } from './save.js';

const CSS = `.sv-board{margin:1.2vh auto 0;max-width:560px;text-align:left;font:11px var(--f-m,monospace);letter-spacing:.06em;text-transform:uppercase}
.sv-board h4{margin:0 0 .4em;opacity:.7;font-weight:normal}.sv-board ol{margin:0;padding:0;list-style:none}
.sv-board li{display:flex;gap:.8em;padding:.15em .4em;border-bottom:1px solid #fff1}.sv-board li.me{background:#ff9c3340}
.sv-board li b{min-width:2.2em;opacity:.6}.sv-board li i{font-style:normal;flex:1;opacity:.75}.sv-board em{opacity:.5;font-style:normal}
.sv-tools{display:flex;flex-wrap:wrap;gap:.5em;align-items:center;margin-top:1em}.sv-tools .msg{font-size:11px;opacity:.8}`;
function css(doc) { if (doc.getElementById('sv-css')) return; const s = doc.createElement('style'); s.id = 'sv-css'; s.textContent = CSS; doc.head.appendChild(s); }

export function renderBoard(el, save, mode, highlight = 0) {
  if (!el) return; css(el.ownerDocument);
  const rows = save.board(mode), esc = (s) => String(s).replace(/[&<>]/g, '');
  el.className = 'sv-board'; el.dataset.mode = mode;
  el.innerHTML = `<h4>${mode === 'madness' ? 'Roguelike' : 'Systems Nominal'} · local top 10</h4>` + (rows.length ? '<ol>' + rows.map((r, i) => { const t = rowText(mode, r); return `<li${i + 1 === highlight ? ' class="me"' : ''}><b>${i + 1}.</b><span>${esc(t.main)}</span><i>${esc(t.sub)}</i></li>`; }).join('') + '</ol>' : '<em>No runs recorded yet.</em>');
}

export function mountSaveControls(doc, save, hooks = {}) {
  const host = doc.querySelector('#pause .settings'); if (!host || doc.getElementById('sv-tools')) return null; css(doc);
  const box = doc.createElement('div'); box.id = 'sv-tools'; box.className = 'sv-tools';
  box.innerHTML = '<span>Save</span><button type="button" class="lc-btn lc-sm lc-teal" id="sv-export">Export save</button><button type="button" class="lc-btn lc-sm lc-lilac" id="sv-import">Import save</button><button type="button" class="lc-btn lc-sm lc-warn" id="sv-reset">Reset save</button><input type="file" id="sv-file" accept="application/json,.json" hidden><span class="msg" id="sv-msg" role="status"></span>';
  host.appendChild(box);
  const $ = (id) => doc.getElementById(id), msg = (t) => { $('sv-msg').textContent = t; };
  $('sv-export').onclick = () => {
    try { const url = URL.createObjectURL(new Blob([save.exportJSON()], { type: 'application/json' })), a = doc.createElement('a'); a.href = url; a.download = 'starfarers-save.json'; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); msg('Save exported.'); } catch (e) { msg('Export failed.'); }
  };
  $('sv-import').onclick = () => $('sv-file').click();
  $('sv-file').onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return; let r; try { r = save.importJSON(await f.text()); } catch (er) { r = { ok: false, error: 'Could not read the file' }; }
    msg(r.ok ? 'Save imported.' : r.error); e.target.value = ''; if (r.ok) hooks.onChange?.();
  };
  let armed = 0;
  $('sv-reset').onclick = () => {   // two clicks: the first arms it
    if (!armed) { armed = 1; $('sv-reset').textContent = 'Really reset?'; setTimeout(() => { armed = 0; $('sv-reset').textContent = 'Reset save'; }, 4000); return; }
    armed = 0; $('sv-reset').textContent = 'Reset save'; save.reset(); msg('Save reset.'); hooks.onChange?.();
  };
  box.addEventListener('mousedown', (e) => e.stopPropagation());
  return box;
}
