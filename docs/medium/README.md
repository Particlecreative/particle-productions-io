# MEDIUM 🔮: creative strategist (CP module)

Medium reads what won (AfterLife ranks, Upspring explains) and writes the next brief in the team's house style. Every brief is scored and proofread by Captain Caption, then approved by a person before anything is made.

Source spec: Tomer's `medium-strategist-bot-spec.md` v0.4 and `medium-house-style.md`. They are kept outside this public repo because they contain strategy.

## What is built (milestone 1: shadow mode, Nov 2026)

| Piece | Where | Notes |
|---|---|---|
| House-style corpus | `lib/medium/corpus.js`, `classify.js` | Reads every ticket the corpus requester wrote on the Video and Design boards since `corpus.since`. Monday is read-only. Each ticket is classified by kind (§3 openings), lane, template, persona and tool tokens. Test brands (Ashford, Levitas, Biomella, Blurr) and thin briefs are kept in the table but excluded. Job `medium_ingest`. |
| Writer | `lib/medium/writer.js`, `prompts/writer.txt` | Sonnet 5.5. The prompt holds the house-style summary, the full style guide (`medium_config.style_guide`, set in the UI), lane rules, Captain Caption's Brain (terms, rules, claims sheet, offer calendar), 3 retrieved examples, and the evidence. |
| Style check | `lib/medium/style.js` | Style guide §11.4: opening by kind, lane first line, time-coded script with SCRIPT/VISUALS or Beats, VO style line, design copy labelled per element with V1/V2, sizes in house notation, Don'ts, no "I want", exactly one Why and one Test. A failure gets one rewrite; a second failure drops the brief with its reasons. |
| Score | `prompts/scorer.txt` + `writer.score()` | Guardrails gate, then 8 weighted sub-scores (§18.2). Freshness is computed in code against the last 60 days of tickets. Evidence and Pattern fit stay empty, shown as `[AfterLife]` / `[Upspring]`, until those feeds exist. The score is labelled **uncalibrated**. Each brief also gets 3 critics and up to 3 fixes. |
| Captain pre-flight | `lib/captain/brief.js` (direct call) | Medium sends every on-screen and spoken line. A must-fix locks approval; an admin can override with a reason, which is logged. |
| Freeform | `writer.runFreeform()` | Input: an idea plus references (Monday tickets and web pages are read; Upspring links are stored). Output: chips, findings (supports / overlap / risk / gap / bonus), two versions ("mine" and "medium"), each scored and pre-flighted. |
| Review queue | `routes/medium.js` | PENDING_REVIEW → approve / edit (stored as a diff, then style check, re-derived lines and pre-flight again) / regenerate / reject (reason required). |
| UI | `/medium`: `pages/medium`, `components/medium` | Strategy Room, Brief Generator, Freeform, What it learns from (sources, corpus mix, templates, assumption ledger, style guide / Upspring read / language bank), A/B Lab & Transfers (seeded affinity map), Holiday Builder (calendar only). |

Jobs run on the existing captain-worker. Tables are created by `db/migrations/035_medium.sql`; the seeds (templates, donors, affinity, beliefs) are inserted on first load.

## Not built yet: blocked or next

- **Monday submission** (spec §10, phase 2): `monday_submit` stays off. Needs the Lane dropdown column on both boards, a decision between `label9` and `dropdown_mm8q7ysv`, a check that the 🔮 Medium group triggers no automations, and which Monday user creates the items.
- **AfterLife winners feed** (§5.3): `lib/medium/afterlife.js` calls `/api/export/winners`. The endpoint is built in the AFTERLIFE repo; until it's live, numbers show as `[AfterLife]`.
- **Upspring on the server** (§4.1): REST auth is unknown and the MCP OAuth refresh isn't wired up. Until then an admin pastes an account read and language-bank phrases in "What it learns from".
- **Corpus outcome join** (winner / never-ran) waits on AfterLife.
- **Next:**
  - Holiday Builder (§17), on top of the Captain batch pre-flight that is already live
  - Transfer engine tests (§6.5)
  - Improve loop with diffs (§18.3)
  - Market Watch, Growth digest

## Cost
About 5–10¢ per Generator brief (writer, possibly one rewrite, scorer, pre-flight) and about 15–25¢ per Freeform brief (two versions). Re-reading the corpus from Monday is free.
