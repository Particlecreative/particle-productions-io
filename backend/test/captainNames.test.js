// Character names (24 Nov 2026): Captain never "corrects" who is who from the picture (Gravité "The Cologne Rain Heist":
// 6 Gary ↔ Walt must-fixes, contradicting himself between rounds; the editor kept the adapted script Omer approved).
const test = require('node:test');
const assert = require('node:assert/strict');
const { tidy, nameCall } = require('../src/lib/captain/briefed');

const mf = (type, found, fix, note) => ({ type, found, fix, note, severity: 'must_fix' });

// The notes Captain posted on the ticket (rounds 1–3, main and short version)
const POSTED = [
  mf('wrong_word', "Walt, that's my Gravité.", "Gary, that's my Gravité.", 'Gary is the one wearing the tracksuit and spraying the cologne, but he is addressed as Walt (and calls Walt Gary later), swapping their names.'),
  mf('wrong_word', "It's called a wall, Gary.", "It's called a wall, Walt.", "Character name confusion: Gary calls Walt 'Gary'."),
  mf('wrong_word', 'Gary, you smell like... pancakes.', 'Walt, you smell like... pancakes.', 'Dolores is smelling Walt (in the apron who cooked pancakes), but calls him Gary.'),
  mf('wrong_word', 'Round one: Walt.', 'Round one: Gary.', "Dolores raises Gary's hand (tracksuit) as winner of round one, but the caption and dialogue declare 'Walt'."),
  mf('wrong_word', 'Walt, go.', 'Gary, go.', 'Dolores prompts the tracksuit man to name base notes, calling him Walt instead of Gary.'),
  mf('wrong_word', 'Gary, you smell unforgettable.', 'Walt, you smell unforgettable.', 'Dolores is sniffing and congratulating Walt after raising his arm in victory; Gary was already sprayed out the door.'),
  mf('wrong_word', 'Gary', 'Walt', 'The character speaking in the blue jacket addresses the man with the apron as Gary (the brief has it too)'),
  mf('wrong_word', 'WALT, GO.', 'GARY, GO.', 'Dolores calls the wrong character'),
];

test('Names: a character name swapped from the picture is never a note', () => {
  for (const i of POSTED) assert.equal(nameCall(i), 'drop', `${i.found} → ${i.fix}`);
  assert.deepEqual(tidy(POSTED, { brief: {} }), []);
});

test('Names: a caption showing another name than the one said stays — as a please-check', () => {
  const out = tidy([mf('caption_vs_voiceover', 'Gary, you smell unforgettable.', 'Walt, you smell unforgettable.', "Speaker says 'Walt', but subtitle reads 'Gary'.")], { brief: {} });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, 'check');
});

test('Names: real word and spelling errors are untouched', () => {
  const keep = [
    mf('wrong_word', 'Its time to shine.', "It's time to shine.", 'its / it’s'),
    mf('wrong_word', 'Lose the gray.', 'Loose the gray.', 'wrong word'),
    mf('spelling', 'Jon loves it.', 'John loves it.', 'name spelled two ways'),
    mf('brand_name', 'Particle Gravity Cologne', 'Particle Gravité Cologne', 'product name'),
    mf('wrong_word', 'THEIR SKIN', 'THERE SKIN', 'wrong word'),
    mf('wrong_word', 'IS YOUR SKIN DRY', 'IS YOUR SKIN OILY', 'the brief says oily'),
    mf('caption_vs_voiceover', "Particle Gravité cologne for men's base notes.", 'Particle Gravité cologne for men base notes.', "The speaker says 'for men base notes'."),
  ];
  for (const i of keep) assert.equal(nameCall(i), null, `${i.found} → ${i.fix}`);
  const out = tidy(keep, { brief: {} });
  assert.equal(out.filter(i => i.severity === 'must_fix').length, keep.length);
});
