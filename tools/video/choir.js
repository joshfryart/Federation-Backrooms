// The shanty's audio, rendered in the game page with the GAME's own audio engine (injected by tools/video/render.mjs `audio`, after stage.js):
//   voices: js/speech.js sing() — the babble voice (sawtooth source, vibrato, three vowel formant bands, breath, roughness) held on melody
//           notes, one voice per crew member with their own js/voice.js profile (pitch register, formant, vibrato, breath, rough, volume)
//   room, stomps, claps, squeezebox: js/audio.js Sound.offline() — the game's bus + cavernous reverb, tone() / noise() / thud()
// Everything is scheduled on an OfflineAudioContext and rendered faster than real time; the result comes back as a 16-bit WAV.
//   window.__CHOIR.render(song, { from, to }) -> { L, R: base64 float32 PCM of [from, to + tail), stats }  (segments, overlap-added by render.mjs)
import { sing, SING } from '../../js/speech.js';
import { Sound } from '../../js/audio.js';

const V = window.__V;
const hashN = (...a) => { let h = 2166136261; for (const x of a.join('|')) h = Math.imul(h ^ x.charCodeAt(0), 16777619); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const ROOT = { Dm: 50, C: 48 }, TRIAD = { Dm: [62, 65, 69], C: [60, 64, 67] };
const female = (p) => p.body !== 'crew_m' && p.body !== 'crew_heavy';

// render [from, to) seconds of the song (+ a tail for the reverb); render.mjs overlap-adds the segments
async function render(song, { from = 0, to = song.dur, tail = 2.5 } = {}) {
  if (!SING) throw new Error('page needs ?video=1');
  const SR = 44100, E = song.E, total = to - from + tail;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * SR), SR);
  const snd = Sound.offline(ctx, { wet: 0.22, ir: 1.8 }); snd.master.gain.value = 0.9;
  const people = V.people, stats = { phrases: 0, singers: new Set() };
  const inSeg = (t) => t >= from && t < to, sh = (t) => t - from;
  // the section choir behind the deck on screen: 16 of the off-deck crew, each standing in for a few (keeps the offline render tractable)
  const section = (deck) => people.filter(o => o.deckNo !== deck).sort((a, b) => hashN('sec', a.p.id) - hashN('sec', b.p.id)).slice(0, 16);
  const chordAt = (e) => (song.chords.find(c => e >= c.e && e < c.e + c.n) || { ch: 'Dm' }).ch;
  // each person: a fixed pan (left-right spread), a timing habit (early / late), a detune, an octave for their register
  const habit = new Map(people.map(o => [o.p.id, { pan: (hashN('pan', o.p.id) - 0.5) * 1.5, late: (hashN('late', o.p.id) - 0.4) * 0.05, det: (hashN('det', o.p.id) - 0.5) * 18 }]));
  const phrase = (o, notes, gain, opt = {}) => {
    if (!notes.length || !inSeg(notes[0].at)) return; notes = notes.map(n => ({ ...n, at: sh(n.at) }));
    const h = habit.get(o.p.id), pan = ctx.createStereoPanner(); pan.pan.value = opt.pan ?? h.pan; pan.connect(snd.master);
    sing(o.p, notes, { ctx, dest: pan, noiseBuf: snd.noiseBuf, gain, jitter: opt.jitter ?? h.late, detune: opt.det ?? h.det, breath: opt.breath ?? 0 });   // a crowd's breath noise sums to a hiss: only the soloist breathes audibly
    stats.phrases++; stats.singers.add(o.p.id);
  };
  for (const line of song.lines) {
    const blk = song.blocks[line.block], deck = blk ? blk.deck : null, notes = song.notes.filter(n => n.block === line.block && n.li === line.li && !!n.tag === !!line.tag);
    const mel = notes.map(n => ({ at: n.e * E, dur: n.n * E * 0.97, midi: n.midi, w: n.w }));
    if (line.part === 'lead') {   // the call: the deck's senior officer alone, a little forward and centred
      const L = people.find(o => o.p.id === V.leads[line.block]?.id); if (L) phrase(L, mel, 2.4, { pan: 0, jitter: 0, det: 0, breath: 1 });
      continue;
    }
    const chorus = !blk || blk.kind === 'chorus' || line.tag;
    const voices = deck == null ? people : [...people.filter(o => o.deckNo === deck), ...(chorus ? section(deck) : [])];
    for (const o of voices) {
      const onDeck = deck == null || o.deckNo === deck;   // verses: the deck's crew; choruses and the tag: the whole ship (the deck on screen forward)
      const nDeck = voices.filter(q => deck == null || q.deckNo === deck).length;
      const gain = (onDeck ? 0.62 * Math.min(1, Math.sqrt(10 / nDeck)) : 0.3) * (line.tag ? 1.15 : 1);   // a crowd gets louder, not 9x louder
      // low male voices take the chord roots in the choruses (a bass line under the tune)
      const bass = chorus && !female(o.p) && (o.p.voice?.pitch ?? 1) < 0.9;
      const notesFor = bass ? notes.map(n => ({ at: n.e * E, dur: n.n * E * 0.97, midi: ROOT[chordAt(n.e)] + 12, w: n.w })) : mel;
      phrase(o, notesFor, gain, bass ? { } : {});
    }
  }
  // squeezebox: oom-pah on the chords (root on the beat, the triad on the off-beat), the tune in the intro, a held chord at the end
  const reed = (m, t, dur, vol) => { if (!inSeg(t)) return; t = sh(t); const f = 440 * Math.pow(2, (m - 69) / 12); snd.tone(f, dur, 'sawtooth', vol * 2.2, 0, t); snd.tone(f * 1.004, dur, 'square', vol * 1.0, 0, t); };
  const thud = (vol, t) => { if (inSeg(t)) snd.thud(vol, sh(t)); }, noise = (d, v, f, q, ty, t) => { if (inSeg(t)) snd.noise(d, v, f, q, ty, sh(t)); };
  for (const c of song.chords) {
    for (let b = 0; b < c.n / 2; b++) {
      const t = (c.e + b * 2) * E; if (t > song.tagE * E + 8 * E) break;
      reed(ROOT[c.ch] - 12, t, E * 0.85, 0.05);
      for (const m of TRIAD[c.ch]) reed(m - 12, t + E, E * 0.7, 0.026);
    }
  }
  const tune = [[0, 4, 69], [4, 2, 69], [6, 1, 69], [7, 1, 69], [8, 2, 62], [10, 2, 65], [12, 4, 69], [16, 4, 67], [20, 2, 67], [22, 1, 67], [23, 1, 67], [24, 2, 60], [26, 2, 64], [28, 4, 67]];
  for (const [e, n, m] of tune) reed(m, e * E, n * E * 0.95, 0.05);
  for (const m of [...TRIAD.Dm, 50]) reed(m - 12, (song.tagE + 8) * E, (song.endE - song.tagE - 8) * E, 0.035);
  // percussion: stomps on 1 and 3 (a few feet, not quite together), claps on 2 and 4 (not under the lead's call), a big stomp to finish
  const leadSpans = song.lines.filter(l => l.part === 'lead').map(l => [l.e0, l.e0 + 16]);
  for (let e = 0; e < song.tagE; e += 2) {
    const beat = (e / 2) % 4, t = e * E, solo = leadSpans.some(([a, b]) => e >= a && e < b);
    if (beat === 0 || beat === 2) for (let k = 0; k < (solo ? 3 : 6); k++) thud((beat === 0 ? 0.16 : 0.12), Math.max(0, t + (hashN('st', e, k) - 0.5) * 0.03));
    else if (!solo && e >= 8) for (let k = 0; k < 8; k++) { const d = Math.max(0, t + (hashN('cl', e, k) - 0.5) * 0.025); noise(0.05, 0.05, 1300 + hashN('cf', e, k) * 900, 1.3, 'bandpass', d); noise(0.1, 0.018, 900, 0.8, 'bandpass', d + 0.004); }
  }
  for (let k = 0; k < 10; k++) thud(0.16, (song.endE - 4) * E + (hashN('fin', k) - 0.5) * 0.03);

  const buf = await ctx.startRendering();
  const enc = (f32) => { const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let out = ''; for (let k = 0; k < u8.length; k += 0x8000) out += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000)); return btoa(out); };
  return { L: enc(buf.getChannelData(0)), R: enc(buf.getChannelData(1)), sr: SR, stats: { phrases: stats.phrases, singers: stats.singers.size, from, to } };
}
window.__CHOIR = { render };
