// buildDeck(template, snapshot, overrides, narrative) → resolved slides (pure).
//
// Stable slide keys make human edits survive "Refresh live data":
//   template slides:    spec.id
//   person slides:      `${spec.id}:${mondayUserId}` (+ `:p2` for overflow pages)
//   production slides:  `${spec.id}:${productionId}`
//   custom slides:      `custom:<uuid>` (free text, section divider or a one-project showcase)
import { SPECS, optionsFor } from '../slides/specs';

export function personKey(specId, uid, page) {
  return `${specId}:${uid}${page ? `:p${page + 1}` : ''}`;
}

const CUSTOM_TYPES = new Set(['custom', 'section', 'showcase']);

/** Default (template) order of slide stubs, before overrides.order is applied. */
function expandTemplate(template, snapshot, overrides) {
  const out = [];
  for (const spec of template?.slides || []) {
    if (spec.enabled === false) continue;
    const def = SPECS[spec.type];
    if (!def) continue;
    const options = optionsFor(spec.type, spec.options, overrides?.slides?.[spec.id]?.options);
    if (spec.repeat && def.repeat) {
      for (const params of def.repeat(spec, snapshot, overrides, options)) {
        const key = def.keyOf ? def.keyOf(spec.id, params) : personKey(spec.id, params.uid, params.page);
        out.push({ key, type: spec.type, specId: spec.id, params, baseOptions: options });
      }
    } else {
      out.push({ key: spec.id, type: spec.type, specId: spec.id, params: {}, baseOptions: options });
    }
  }
  // Custom slides: inserted after their anchor, else before the closing slide
  const custom = Object.entries(overrides?.custom || {});
  for (const [key, c] of custom) {
    const type = CUSTOM_TYPES.has(c.type) ? c.type : 'custom';
    const stub = { key, type, specId: key, params: {}, custom: true,
      baseOptions: optionsFor(type, c.options, overrides?.slides?.[key]?.options) };
    const anchor = c.after ? out.findIndex(s => s.key === c.after) : -1;
    if (anchor >= 0) out.splice(anchor + 1, 0, stub);
    else {
      // Anchor slide gone (e.g. a person page that no longer exists) → after that person's first slide
      const base = c.after ? out.findIndex(s => c.after.startsWith(`${s.key}:`)) : -1;
      const closing = out.findIndex(s => s.type === 'closing');
      out.splice(base >= 0 ? base + 1 : closing >= 0 ? closing : out.length, 0, stub);
    }
  }
  return out;
}

/** Apply a saved order; keys missing from it land right after their template predecessor. */
export function applyOrder(stubs, order) {
  if (!Array.isArray(order) || !order.length) return stubs;
  const byKey = new Map(stubs.map(s => [s.key, s]));
  const result = order.filter(k => byKey.has(k)).map(k => byKey.get(k));
  const placed = new Set(result.map(s => s.key));
  stubs.forEach((s, i) => {
    if (placed.has(s.key)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = result.findIndex(r => r.key === stubs[j].key);
      if (idx >= 0) { at = idx + 1; break; }
    }
    result.splice(at, 0, s);
    placed.add(s.key);
  });
  return result;
}

export function buildDeck(template, snapshot, overrides = {}, narrative = null) {
  if (!snapshot?.items) return [];
  const stubs = applyOrder(expandTemplate(template, snapshot, overrides), overrides?.order);
  let section = '';
  const slides = [];
  for (const stub of stubs) {
    const def = SPECS[stub.type];
    const ovSlide = overrides?.slides?.[stub.key] || {};
    const options = { ...stub.baseOptions, ...(ovSlide.options || {}) };
    let vm;
    try {
      vm = def.select(snapshot, { overrides, narrative, options, params: stub.params, key: stub.key });
    } catch (e) {
      vm = { error: e.message };
    }
    const generated = def.defaultText ? def.defaultText(vm, { options, snapshot }) : {};
    const customText = stub.custom ? (overrides?.custom?.[stub.key] || {}) : {};
    const text = {};
    for (const slot of def.textSlots || []) {
      const ov = ovSlide[slot];
      text[slot] = ov !== undefined ? ov : (customText[slot] !== undefined ? customText[slot] : (generated[slot] ?? ''));
    }
    const edited = (def.textSlots || []).some(s => ovSlide[s] !== undefined) || !!ovSlide.bullets || !!ovSlide.body;
    const empty = def.isEmpty ? !!def.isEmpty(vm) : false;
    const hidden = !!overrides?.hidden?.[stub.key];
    const autoHidden = empty && options.whenEmpty === 'hide';
    if (stub.type === 'section') section = text.title || section;
    slides.push({
      key: stub.key,
      type: stub.type,
      specId: stub.specId,
      custom: !!stub.custom,
      params: stub.params,
      options,
      text,
      generatedText: generated,
      vm,
      notes: ovSlide.notes || '',
      hidden,
      autoHidden,
      empty,
      edited,
      section,
      builds: def.builds ? def.builds(vm, options) : 0,
    });
  }
  return slides;
}

/** Slides that actually show when presenting. */
export function visibleSlides(slides) {
  return slides.filter(s => !s.hidden && !s.autoHidden);
}
