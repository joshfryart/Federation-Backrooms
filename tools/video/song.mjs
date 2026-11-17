// The shanty: "What Shall We Do with the Drunken Sailor" (traditional, public domain), ship-flavoured verses written for this video.
// One source of truth for the audio synth (tools/video/synth.py reads song.json) and the renderer (karaoke captions, jaw motion,
// shot timing). node tools/video/song.mjs  -> writes tools/video/out/song.json and prints the lyric sheet.
// Time unit: an eighth note ("e"). 132 bpm quarter -> e = 0.2273 s, a line = 2 bars of 4/4 = 16 e = 3.64 s, a block (4 lines) = 14.55 s.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BPM = 132, E = 60 / BPM / 2, LINE = 16, KEY = 'D dorian';
// melody templates (MIDI, women's octave; men sing an octave lower): pitch at each eighth of the 16-e line
const D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, B4 = 71, C5 = 72, D5 = 74, C4 = 60;
const tpl = (bar1, b2) => [...Array(8).fill(bar1), b2[0], b2[0], b2[1], b2[1], b2[2], b2[2], b2[3], b2[3]];
const T = {
  a: tpl(A4, [A4, D4, F4, A4]),   // What shall we do with the drun-ken sai-lor
  g: tpl(G4, [G4, C4, E4, G4]),   // (second time, a step down)
  a2: tpl(A4, [A4, B4, C5, D5]),  // (third time, climbing)
  end: [C5, C5, A4, A4, G4, G4, E4, E4, D4, D4, D4, D4, D4, D4, D4, D4],   // Ear-ly in the mor-ning
};
// chords for the drone / bass (per half line = one bar)
const CH = { a: ['Dm', 'Dm'], g: ['C', 'C'], a2: ['Dm', 'Dm'], end: ['C', 'Dm'] };
// a lyric line: syllables with lengths in eighths (sum 16). '-' joins a word that continues.
const L = (s) => s.split(' ').map(tok => { const [w, n] = tok.split(':'); return { w, e: +(n || 1) }; });
const VERSE_RHYTHM = (words) => L(words);
const EARLY = L('Ear-:2 ly:2 in:2 the:2 mor-:4 ning:4');
const CHORUS = L('Way:4 hay:2 and:1 up:1 she:2 ri-:2 ses:4');
const verse = (line) => [VERSE_RHYTHM(line), VERSE_RHYTHM(line), VERSE_RHYTHM(line), EARLY];
// verses (10 eighths of syllables: What:2 shall:1 we:1 do:2 with:1 the:1 | drun-:2 ken:2 sai-:2 lor:2)
const V = {
  ensign: verse('What:2 shall:1 we:1 do:2 with:1 the:1 drun-:2 ken:2 en-:2 sign:2'),
  sickbay: verse('Put:2 him:1 in:1 sick-:2 bay:2 till:2 he\'s:2 so-:2 ber:2'),
  brig: verse('Lock:2 him:1 in:1 the:2 brig:2 till:2 he\'s:2 so-:2 ber:2'),
  airlock: verse('Shave:2 his:1 chin:1 with:2 a:1 rus-:1 ty:2 phas-:2 er:4'),
  reactor: verse('Make:2 him:1 scrub:1 the:2 re-:1 ac-:1 tor:2 plat-:2 ing:4'),
  chorus: [CHORUS, CHORUS, CHORUS, EARLY],
};
const TPL_FOR = ['a', 'g', 'a2', 'end'];
// the arrangement: intro (4 bars, instruments), 9 blocks (one per deck, verse / chorus alternating), tag, outro
export const DECK_BLOCKS = [
  { deck: 1, kind: 'verse', v: 'ensign', title: 'Bridge' },
  { deck: 2, kind: 'chorus', v: 'chorus' },
  { deck: 3, kind: 'verse', v: 'sickbay' },
  { deck: 4, kind: 'chorus', v: 'chorus' },
  { deck: 5, kind: 'verse', v: 'brig' },
  { deck: 6, kind: 'chorus', v: 'chorus' },
  { deck: 7, kind: 'verse', v: 'airlock' },
  { deck: 8, kind: 'chorus', v: 'chorus' },
  { deck: 9, kind: 'verse', v: 'reactor' },
];
export function buildSong() {
  const notes = [], lines = [], blocks = [], chords = []; let e = 0;
  const INTRO = 2 * LINE;   // 4 bars: squeezebox + stomps under the title card
  for (let i = 0; i < INTRO / 8; i++) chords.push({ e: i * 8, n: 8, ch: i % 2 ? 'C' : 'Dm' });
  e = INTRO;
  DECK_BLOCKS.forEach((b, bi) => {
    const blk = { ...b, i: bi, e0: e, lines: [] };
    V[b.v].forEach((ln, li) => {
      const t = TPL_FOR[li]; let k = 0;
      // who sings: verse line 1 = the deck's lead alone (the call), lines 2-4 = everyone on the deck; chorus = everyone
      const part = b.kind === 'verse' && li === 0 ? 'lead' : 'all';
      const line = { block: bi, li, e0: e, part, syl: [] };
      for (const s of ln) { const n = { e: e + k, n: s.e, midi: T[t][k], w: s.w, part, block: bi, li }; notes.push(n); line.syl.push({ e: n.e, n: n.n, w: s.w }); k += s.e; }
      if (k !== LINE) throw new Error(`line ${b.v}/${li} has ${k} eighths`);
      CH[t].forEach((c, h) => chords.push({ e: e + h * 8, n: 8, ch: c }));
      line.text = ln.map(s => s.w).join(' ').replace(/- /g, ''); blk.lines.push(line); lines.push(line); e += LINE;
    });
    blk.e1 = e; blocks.push(blk);
  });
  // tag: everyone, "Ear-ly in the mor-ning!" with the last note held (fermata), then a final stomp
  const tag = { block: blocks.length, li: 0, e0: e, part: 'all', syl: [], tag: true }; let k = 0;
  for (const s of L('Ear-:2 ly:2 in:2 the:2 mor-:4 ning!:12')) { const midi = k < 16 ? T.end[k] : D4; notes.push({ e: e + k, n: s.e, midi, w: s.w, part: 'all', block: blocks.length, li: 0, tag: true }); tag.syl.push({ e: e + k, n: s.e, w: s.w }); k += s.e; }
  tag.text = 'Early in the morning!'; lines.push(tag); chords.push({ e, n: 8, ch: 'C' }, { e: e + 8, n: 16, ch: 'Dm' }); e += k;
  const END = e + 12;   // ring out under the end card
  return { bpm: BPM, E, key: KEY, intro: INTRO, notes, lines, blocks, chords, tagE: tag.e0, endE: END, dur: END * E };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = buildSong(), out = join(dirname(fileURLToPath(import.meta.url)), 'out'); mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'song.json'), JSON.stringify(s));
  for (const l of s.lines) console.log(`${(l.e0 * s.E).toFixed(2).padStart(7)}s  ${l.part.padEnd(4)}  ${l.text}`);
  console.log('duration', s.dur.toFixed(2), 's');
}
