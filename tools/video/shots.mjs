// Shot list for the shanty video, cut on the bar lines of the song (tools/video/song.mjs).
// Each deck block (8 bars) is: lift arrival, the lead's call in close-up (verses), wide shots of the deck's rooms, a named close-up,
// lift departure with the deck counter ticking to the next deck. The intro (title card) and the tag + end card are on the bridge.
//   shotList(song) -> [{ i, name, deck, kind, t0, t1, ...spec }]
export function shotList(song) {
  const E = song.E, bar = 8 * E, shots = [];
  const add = (deck, kind, t0, t1, spec = {}) => shots.push({ i: shots.length, deck, kind, t0, t1, ...spec, name: `${String(shots.length).padStart(3, '0')}-d${deck}-${kind}${spec.ri != null ? '-r' + spec.ri : ''}` });
  add(1, 'title', 0, song.intro * E, { ri: 0, crane: true, push: 0.25, arc: 1.4 });
  for (const b of song.blocks) {
    const T = (k) => b.e0 * E + k * bar, n = b.deck, last = b.i === song.blocks.length - 1;
    const common = { deckShown: n, visited: n - 1, block: b.i };
    if (b.kind === 'verse') {
      if (n === 1) add(n, 'close', T(0), T(2), { ...common, lead: 'block' });
      else { add(n, 'lift-arrive', T(0), T(1), common); add(n, 'close', T(1), T(2), { ...common, lead: 'block' }); }
      add(n, 'wide', T(2), T(4), { ...common, ri: 0, arc: 1 });
      add(n, 'wide', T(4), T(6), { ...common, ri: 1, arc: -1, crane: true });
      add(n, 'close', T(6), T(7), common);
    } else {
      add(n, 'lift-arrive', T(0), T(1), common);
      add(n, 'wide', T(1), T(3), { ...common, ri: 0, arc: -1, crane: true });
      add(n, 'close', T(3), T(4), common);
      add(n, 'wide', T(4), T(6), { ...common, ri: 1, arc: 1 });
      add(n, 'wide', T(6), T(7), { ...common, ri: 2, arc: -1, push: 0.25 });
    }
    add(n, 'lift-depart', T(7), T(8), { ...common, toDeck: last ? 1 : n + 1 });
  }
  add(1, 'end', song.tagE * E, song.dur, { deckShown: 1, visited: 9, ri: 0, arc: -1.4, push: 0.15, crane: true });
  return shots;
}
