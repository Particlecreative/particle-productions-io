/**
 * productionTemplates.js
 * Pre-built line-item sets for each production type.
 * Items are merged with default CRUD fields before being saved.
 */

export const SHOOT_TEMPLATE = [
  // ── Crew ──
  { item: 'Director',                        type: 'Crew' },
  { item: 'Director Assistant',              type: 'Crew' },
  { item: 'Photographer',                    type: 'Crew' },
  { item: 'First Assistant Photographer',    type: 'Crew' },
  { item: 'Second Assistant Photographer',   type: 'Crew' },
  { item: 'Lighting Artist',                 type: 'Crew' },
  { item: 'Lighting Artist First Assistant', type: 'Crew' },
  { item: 'Grip',                            type: 'Crew' },
  { item: 'Grip Assistant',                  type: 'Crew' },
  { item: 'Art Director',                    type: 'Crew' },
  { item: 'Set Dresser',                     type: 'Crew' },
  { item: 'Make Up Artist',                  type: 'Crew' },
  { item: 'Stylist',                         type: 'Crew' },
  { item: 'Production Assistant',            type: 'Crew' },
  { item: 'Water Girl',                      type: 'Crew' },
  { item: 'BTS Photographer',               type: 'Crew' },
  { item: 'Production Coordinator',          type: 'Crew' },
  // ── Cast ──
  { item: 'Presenter',                       type: 'Cast' },
  { item: 'Lady',                            type: 'Cast' },
  // ── Equipment ──
  { item: 'Location',                        type: 'Equipment' },
  { item: 'Equipment',                       type: 'Equipment' },
  { item: 'Luxury Car',                      type: 'Equipment' },
  // ── Art Department (stored as Equipment) ──
  { item: 'Uniform',                         type: 'Equipment' },
  { item: 'Props',                           type: 'Equipment' },
  // ── Catering & Transport ──
  { item: 'Taxis & Deliveries',              type: 'Catering & Transport' },
  { item: 'Crew Transportation & Parking',   type: 'Catering & Transport' },
  { item: 'Catering',                        type: 'Catering & Transport' },
  { item: 'Refreshments & Supplies',         type: 'Catering & Transport' },
  // ── Post ──
  { item: 'Sound Mix',                       type: 'Post' },
  { item: 'Offline Editor',                  type: 'Post' },
  { item: 'Online Editor',                   type: 'Post' },
  { item: 'VO Artist',                       type: 'Post' },
  { item: 'Sampling',                        type: 'Post' },
  // ── Office ──
  { item: 'Unexpected',                      type: 'Office' },
];

export const REMOTE_SHOOT_TEMPLATE = [
  { item: 'Director',       type: 'Crew' },
  { item: 'Offline Editor', type: 'Post' },
  { item: 'Online Editor',  type: 'Post' },
  { item: 'Sound Design',   type: 'Post' },
];

export const AI_TEMPLATE = [
  { item: 'Soundmix',      type: 'Post',   planned_budget: 1300, currency_code: 'ILS' },
  { item: 'AI Credits',    type: 'Office', planned_budget: 500,  currency_code: 'USD' },
  { item: 'Scriptwriting', type: 'Crew',   planned_budget: 500,  currency_code: 'USD' },
];

export const TEMPLATES = {
  'Shoot':        SHOOT_TEMPLATE,
  'Remote Shoot': REMOTE_SHOOT_TEMPLATE,
  'AI':           AI_TEMPLATE,
};
