// propsymbols.js — U-3 deck-plan symbols (batch 10, docs/signart.md), split out of js/signart.js so pages without three.js can use them:
// tools/artifact/build-deck-plans.sh bundles this file into the deck-plans page; js/signart.js re-exports it.
// ================================================================ U-3: deck-plan symbols for the props of batches 1-4 (canvas recipes in the style of tools/artifact/deck-plans.template.html)
// Recipe ops in unit space (-0.5..0.5 of the tile symbol size s): ['r', x, y, w, h, radius?, 'a'?]  rounded rect, ['c', x, y, r, 'a'?] circle, ['l', x1, y1, x2, y2] line,
// ['p', [x, y, x, y, ...], close?, 'a'?] polygon, ['a', x, y, r, a0, a1] arc stroke.  'a' = fill with the accent colour (C.sci), otherwise panel fill + ink stroke.
export const PROP_SYMBOLS = {
  helm:           [['r', -.45, -.18, .9, .4, .08], ['r', -.3, -.34, .6, .12, .04, 'a'], ['c', 0, .02, .1], ['l', -.34, .22, -.34, .4], ['l', .34, .22, .34, .4]],
  baycontrol:     [['p', [-.46, .24, -.3, -.26, .3, -.26, .46, .24], true], ['r', -.2, -.16, .4, .16, .03, 'a'], ['c', -.3, .1, .05], ['c', .3, .1, .05]],
  beampedestal:   [['p', [-.36, .26, -.3, -.3, .3, -.3, .36, .26], true], ['l', -.18, -.1, -.18, .1], ['l', 0, -.1, 0, .1], ['l', .18, -.1, .18, .1]],
  secdesk:        [['p', [-.46, -.4, .46, -.4, .46, -.1, -.1, -.1, -.1, .4, -.46, .4], true], ['r', .08, -.32, .28, .1, .02, 'a'], ['c', -.28, .0, .05]],
  nursestation:   [['p', [-.46, -.3, .46, -.3, .46, .3, .3, .3, .3, -.08, -.46, -.08], true], ['r', -.4, -.26, .3, .1, .02, 'a'], ['c', .38, .12, .04]],
  holodesk:       [['r', -.45, -.12, .9, .34, .06], ['l', -.3, .0, .3, .0], ['c', -.18, -.3, .08, 'a'], ['c', .18, -.3, .08, 'a']],
  reactorstation: [['r', -.46, -.14, .92, .36, .05], ['r', -.4, -.4, .26, .22, .03, 'a'], ['r', -.13, -.4, .26, .22, .03, 'a'], ['r', .14, -.4, .26, .22, .03, 'a']],
  taskchair:      [['c', 0, .06, .26], ['r', -.24, -.34, .48, .14, .06, 'a']],
  steriliser:     [['r', -.46, -.26, .92, .52, .04], ['c', -.12, 0, .17], ['c', -.12, 0, .07, 'a'], ['r', .16, -.18, .24, .36, .03]],
  surgical_table: [['r', -.2, -.46, .4, .92, .08], ['l', -.2, -.18, .2, -.18], ['c', .34, -.28, .1, 'a'], ['c', -.34, -.28, .1, 'a']],
  med_dispenser:  [['r', -.36, -.3, .72, .6, .05], ['l', -.36, -.04, .36, -.04], ['l', -.36, .14, .36, .14], ['r', -.28, -.24, .56, .14, .02, 'a']],
  exam_couch:     [['r', -.22, -.46, .44, .92, .06], ['p', [-.22, -.46, .22, -.46, .22, -.2, -.22, -.2], true, 'a'], ['r', .26, .22, .2, .2, .03]],
  autopsy_table:  [['r', -.24, -.46, .48, .92, .04], ['r', -.17, -.38, .34, .72, .03], ['c', 0, .3, .05, 'a'], ['c', .38, -.3, .1]],
  infusion_stand: [['c', 0, 0, .05, 'a'], ['l', -.34, -.34, .34, .34], ['l', .34, -.34, -.34, .34], ['c', 0, 0, .34], ['r', .1, -.3, .16, .2, .02]],
  pumpskid:       [['r', -.46, -.3, .92, .6, .04], ['c', -.22, 0, .2], ['c', -.22, 0, .08, 'a'], ['r', .08, -.2, .3, .4, .03], ['l', .1, -.3, .1, .3]],
  heatexch:       [['r', -.46, -.2, .92, .4, .12], ['l', -.3, -.2, -.3, .2], ['l', -.1, -.2, -.1, .2], ['l', .1, -.2, .1, .2], ['l', .3, -.2, .3, .2], ['c', -.4, -.34, .06, 'a'], ['c', .4, .34, .06, 'a']],
  scrubber:       [['c', 0, 0, .4], ['c', 0, 0, .26, 'a'], ['l', -.26, 0, .26, 0], ['l', 0, -.26, 0, .26]],
  fieldgen:       [['p', [0, -.46, .4, -.23, .4, .23, 0, .46, -.4, .23, -.4, -.23], true], ['c', 0, 0, .18, 'a'], ['c', 0, 0, .08]],
  fabricator:     [['r', -.44, -.3, .88, .6, .05], ['r', -.3, -.18, .6, .36, .03, 'a'], ['l', 0, -.3, 0, -.18], ['l', -.3, .0, .3, .0]],
  range:          [['r', -.46, -.34, .92, .68, .04], ['c', -.22, -.14, .12], ['c', .22, -.14, .12], ['c', -.22, .16, .12], ['c', .22, .16, .12, 'a']],
  servery:        [['r', -.46, -.32, .92, .24, .04], ['r', -.46, .06, .92, .24, .04, 'a'], ['l', -.2, -.32, -.2, -.08], ['l', .2, -.32, .2, -.08]],
  bar:            [['p', [-.46, .3, -.46, -.3, .46, -.3, .46, -.12, -.28, -.12, -.28, .3], true], ['c', .1, .12, .08, 'a'], ['c', .32, .12, .08, 'a']],
  barstool:       [['c', 0, 0, .22], ['c', 0, 0, .08, 'a']],
  wastebin:       [['c', 0, 0, .28], ['l', -.2, -.2, .2, .2], ['l', .2, -.2, -.2, .2]],
  dishwasher:     [['r', -.34, -.4, .68, .8, .05], ['c', 0, .04, .2], ['r', -.26, -.34, .52, .1, .02, 'a']],
  // wiring pass: the batch 5-11 hardware that now hosts ship systems (js/crew.js SYSTEMS) and the field cell
  growbed:        [['r', -.46, -.22, .92, .44, .05], ['c', -.28, 0, .08, 'a'], ['c', 0, 0, .08, 'a'], ['c', .28, 0, .08, 'a']],
  relayrack:      [['r', -.26, -.36, .52, .72, .03], ['l', -.18, -.2, .18, -.2], ['l', -.18, 0, .18, 0], ['l', -.18, .2, .18, .2], ['c', .12, -.28, .04, 'a']],
  chargerack:     [['r', -.4, -.24, .8, .48, .03], ['c', -.22, -.08, .05, 'a'], ['c', 0, -.08, .05, 'a'], ['c', .22, -.08, .05, 'a'], ['c', -.22, .1, .05, 'a'], ['c', 0, .1, .05], ['c', .22, .1, .05, 'a']],
  buffertank:     [['c', 0, 0, .3], ['r', -.06, .12, .12, .2, .02, 'a']],
  cellfield:      [['r', -.44, -.36, .88, .62, .03], ['l', -.44, .34, .44, .34], ['r', -.44, .3, .88, .06, .02, 'a']],
};
const SYM_ALIAS = { taskchair_plain: 'taskchair', fieldgen_damp: 'fieldgen', range_bare: 'range', bar_plain: 'bar', barback: 'bar', nutrient_tanks: 'buffertank' };
export const PROP_NAME_X = { helm: 'Helm station', baycontrol: 'Bay control', beampedestal: 'Beam pedestal', secdesk: 'Security desk', nursestation: "Nurses' station", holodesk: 'Holo desk', reactorstation: 'Reactor station', taskchair: 'Task chair', steriliser: 'Steriliser bench',
  surgical_table: 'Surgical table', med_dispenser: 'Medication dispenser', exam_couch: 'Exam couch', autopsy_table: 'Autopsy table', infusion_stand: 'Infusion stand', pumpskid: 'Pump skid', heatexch: 'Heat exchanger', scrubber: 'Scrubber', fieldgen: 'Field generator', fabricator: 'Fabricator',
  range: 'Range', servery: 'Servery', bar: 'Bar', barstool: 'Bar stool', wastebin: 'Waste bin', dishwasher: 'Dishwasher',
  growbed: 'Grow bed', relayrack: 'Relay rack', chargerack: 'Charging rack', buffertank: 'Pattern buffer', cellfield: 'Field cell', nutrient_tanks: 'Nutrient tanks' };
/** drawPropSymbol(g, kind, s, C): draws the symbol centred on the current origin (the caller has done g.translate(cx, cy) as the deck-plans page does), s = tile symbol size in px,
 *  C = { panel, ink, sci } colours (strings). Returns true when it knows the kind (so the caller can fall back to its default box). */
export function drawPropSymbol(g, kind, s, C = { panel: '#1b2130', ink: '#9db2c8', sci: '#35e6d8' }) {
  const rec = PROP_SYMBOLS[kind] || PROP_SYMBOLS[SYM_ALIAS[kind]]; if (!rec) return false;
  g.save(); g.lineWidth = Math.max(1, s * 0.06); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = C.ink;
  const paint = (acc) => { g.fillStyle = acc ? C.sci : C.panel; g.globalAlpha = acc ? 0.85 : 1; g.fill(); g.globalAlpha = 1; g.stroke(); };
  for (const op of rec) {
    g.beginPath();
    if (op[0] === 'r') { g.roundRect(op[1] * s, op[2] * s, op[3] * s, op[4] * s, (op[5] || 0) * s); paint(op[6] === 'a'); }
    else if (op[0] === 'c') { g.arc(op[1] * s, op[2] * s, op[3] * s, 0, 7); paint(op[4] === 'a'); }
    else if (op[0] === 'l') { g.moveTo(op[1] * s, op[2] * s); g.lineTo(op[3] * s, op[4] * s); g.stroke(); }
    else if (op[0] === 'p') { op[1].forEach((v, i) => { if (i % 2 === 0) { const x = v * s, y = op[1][i + 1] * s; i ? g.lineTo(x, y) : g.moveTo(x, y); } }); if (op[2]) g.closePath(); paint(op[3] === 'a'); }
    else if (op[0] === 'a') { g.arc(op[1] * s, op[2] * s, op[3] * s, op[4], op[5]); g.stroke(); }
  }
  g.restore(); return true;
}
