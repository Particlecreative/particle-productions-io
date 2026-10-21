const test = require('node:test');
const assert = require('node:assert');
const { briefText } = require('../../src/lib/studio/tickets');

test('video brief: header line, underlined sections, numbered hooks (brief-writer format)', () => {
  const t = briefText('video', {
    department: 'Marketing/Media', product: 'NeoRoot', platform: 'Meta', type: 'Script (<1 min)', campaign: [],
    requested_by: ['Lilian Krumholz'], assignee: [], versions: '2', priority: 'High', sizes: [], deadline: '', duration: '',
    concept: 'Vertical 9x16.', hook: 'First hook\n- Second hook', script: 'SCRIPT',
  });
  assert.ok(t.startsWith('Department: Marketing/Media | Product: NeoRoot | Platform: Meta | Type: Script (<1 min) | Requestor: Lilian Krumholz | Versions Needed: 2 | Priority: High\n\n'));
  assert.ok(t.includes('Video Concept\n-------------\n\nVertical 9x16.'));
  assert.ok(t.includes('Hook Variations\n---------------\n\n1. First hook\n\n2. Second hook'));
  assert.ok(t.endsWith('Script / Message\n----------------\n\nSCRIPT'));
});

test('design brief: Concept / Idea and Supporting Text', () => {
  const t = briefText('design', { department: 'Marketing', product: 'Gravité', requested_by: [], assignee: [], sizes: [], campaign: [], versions: '3', concept: 'Copy the layout.', supporting_text: 'V1: A' });
  assert.ok(t.startsWith('Department: Marketing | Product / Bundle: Gravité | Amount of Versions: 3\n\n'));
  assert.ok(t.includes('Concept / Idea\n--------------\n\nCopy the layout.'));
  assert.ok(t.endsWith('Supporting Text\n---------------\n\nV1: A'));
});

test('example briefs: credentials and empty sections are removed', () => {
  const { cleanExample } = require('../../src/lib/studio/tickets');
  const raw = 'Department: Website | Product / Bundle: X | Priority: High | How did you create this?: ChatGPT\n\nConcept / Idea\n--------------\n\nPlease update the home page.\n\nLogin Password: hunter2\nAPI key = abc\n\nSupporting Text\n---------------\n\nnone\n\nHook Variations\n---------------\n\n1. none\n\nScript / Message\n----------------\n\nscript';
  const t = cleanExample(raw);
  assert.ok(!/hunter2|abc/.test(t), 'no credentials');
  assert.ok(!/How did you create/.test(t));
  assert.ok(!/Supporting Text|Hook Variations|Script \/ Message/.test(t), t);
  assert.ok(t.startsWith('Department: Website | Product / Bundle: X | Priority: High\n\nConcept / Idea\n--------------\n\nPlease update the home page.'));
});
