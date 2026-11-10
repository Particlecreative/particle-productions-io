#!/usr/bin/env node
/**
 * Captain Caption — learn from the history import (sort → check fixes → merge → pending Brain items).
 *   node src/scripts/captainLearn.js            run or resume everything
 *   node src/scripts/captainLearn.js --pilot    a small sample through sorting + both fix checks (no Brain items)
 *   node src/scripts/captainLearn.js --only video|design|classify|distil
 * Resumable; spend and progress are saved on the import run (captain_import_runs.plan.learn).
 */
const { runLearn } = require('../lib/captain/learn');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
runLearn({ pilot: args.includes('--pilot'), only })
  .then(() => process.exit(0))
  .catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
