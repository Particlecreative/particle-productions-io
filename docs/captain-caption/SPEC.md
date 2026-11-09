# Captain Caption — spec

> Original brief from Tomer (Nov 9, 2026), kept as written. Corrections found while building, verified on the live systems:
> - There is no "In Review" status. Video uses **Review** and Design uses **Quality Check**; both boards have **For Approval**.
> - Design board departments are **Marketing, Socials, Website, Email** (no "Marketing/Media" or "Retention"). The Design board has no Type column.
> - In Frame.io, one Monday task = one folder. Each deliverable (version × size) is a **version stack**; each revision round is a **version inside the stack**. "V1/V2" in file names are *versions* (e.g. two hooks), not revisions.
> - The biggest size (16x9, else 9x16) is made first and cut down afterwards. Cut-downs are checked against the master.
> - The voiceover is checked too: does it make sense, are words right, and does it follow the script and its sentence order?
> - CP runs behind nginx, not Caddy. CP has no R2 storage and its Postgres has no pgvector yet. AFTERLIFE lives at afterlife.particle-creative.cloud.
> - The Captain uses its own accounts (tomer@blurrskin.com) on Frame.io, Figma and Monday.

---

Proofreads **video ads (Frame.io)** and **designs (Figma)**, triggered from Monday, and learns from every comment the team has ever left.

## Who you're working with
The person building this is the **Head of Creative & Productions, not a developer**. Work accordingly:
- Explain each step in plain language before doing it, and why it's needed.
- Do all the technical work yourself (installing tools, writing code, running commands on the server, deploying). Only hand over what truly needs a human: browser logins, approving access, copying a token from a settings page. When you do, give exact click-by-click instructions.
- **Ask before** anything that costs money, deploys to production, registers webhooks on live Monday boards, or touches a whole Frame.io account or Figma team.
- Build and test on **test Monday items, a test Frame.io project and a test Figma file first**. Go live only after a successful end-to-end test.
- Never print secrets in chat; keep them in the server's `.env`, never in git.
- **CP Panel is a live tool the team relies on.** Never break existing features; work on a branch and test before deploying.
- Maintain a plain-English `RUNBOOK.md`: what's running where, monthly cost, how to check health, how to rotate tokens, and what to do when something breaks (usually: open Claude Code in this folder and describe the problem).

## Read these first
1. **The CP Panel repo** (where Captain Caption is built). Summarise its structure, auth, roles, deploy process and conventions.
2. **The AfterLife repo** (`afterlife.particleformen.com`). It already solves most of the integration logic this project needs. Reuse or port, don't reinvent:
   - **BoardMap**: per-board column resolution. `link` means **Frame.io on the Video board** and **Figma on the Design board**: same column ID, different service. Resolve by board, never by column name. A Figma URL on a video item (or vice versa) is a data-quality flag, not something to process.
   - Monday client and webhook handling (fast acknowledge, then queue; service-account token).
   - Figma and Frame.io API clients and link parsing.
   - Media worker patterns (ffmpeg, concurrency limits), R2 storage, pgvector embeddings.
Report what you found and what you plan to reuse **before** writing code.

## What this project is
**Captain Caption** checks the text in Particle's creative work and leaves comments exactly where the problem is, like one more reviewer:
- **Video editors:** comments on the exact frame of the exact Frame.io version (they sync to Premiere as markers).
- **Designers:** comments pinned to the exact text layer in Figma.
- **Both:** a summary update on the Monday item.

Brand: **Particle** (men's skincare, DTC).

## Monday boards (same model for both disciplines)
| | Video | Design |
|---|---|---|
| Board ID | `5433027071` | `8036329818` |
| Review link (`link`) | Frame.io | Figma |
| Dropbox | `link4__1` | `link0__1` |
| Status column | TODO: find ID; confirm "In Review" / "For Approval" labels | TODO: same |
| Department / Type | `label` / `label4` (verify) | TODO: find IDs on this board |

(Board and column IDs come from the AfterLife spec; verify them.)

- One Monday webhook per board on `change_specific_column_value` for the status column. Echo Monday's `challenge`.
- Write-back: post an **update** on the item, e.g. `🧑‍✈️ Captain Caption: V3 has 2 issues — see Frame.io comments` / `see Figma comments`, or `🧑‍✈️ Captain Caption: V2 passed ✅`. Optional: a "Text QC" status column.

## Trigger logic

| Event | Video (Frame.io) | Design (Figma) |
|---|---|---|
| Status → **In Review** | Check **V1** | Check the design (counts as V1) |
| Status → **For Approval** | Check **V2** | Check the design again (V2) |
| New version, no status change | Frame.io `file.versioned` → check V3, V4, V5… | Figma `FILE_VERSION_UPDATE` → check again (V3+) |

**Rules (both disciplines):**
- **Scope: marketing/digital only. Never check TV projects.** On every trigger, read the Monday item. It's **in scope** if:
  - Department is one of `Marketing/Media`, `Socials`, `Website`, `Retention`, **or**
  - the item **title contains "Meta"** as a word (case-insensitive, `\bmeta\b`, so "Meta Ad – Face Cream" matches but "Metallic" doesn't), whatever its department,
  - **and** in both cases it is not TV (Department `TV` or Type `TV` is always skipped, even with "Meta" in the title).
  Allowed departments and title keywords live in config so more can be added without code. Log every skip with the reason.
- Once an item triggers "In Review", the Captain **tracks** its asset. Later versions are checked automatically until the item is Done/archived. *(Assumption — confirm.)*
- **Never check the same thing twice.** Video: dedupe by Frame.io file ID. Design: dedupe by Figma file version ID **plus a hash of the checked text and frame**, so an unchanged design isn't re-checked.
- If "For Approval" fires but nothing has changed since the last check, post a Monday update saying so instead of re-checking.
- Version-triggered events (Frame.io/Figma) are matched back to their tracked Monday item, and the same scope check applies. Untracked assets are ignored.

## Video pipeline (Frame.io)

**Example link:**
```
https://next.frame.io/project/d0a48ec1-1487-47cf-97cb-ee5311f76b09/view/9ee4e1a5-5139-48f9-adec-d36eb3e993c8
```
Format `next.frame.io/project/{project_id}/view/{asset_id}`: matches the V4 API's `view_url`, a direct asset link.

**Resolving it (verify against the live API first):**
- The ID may be a **file** (only V1) or a **version stack** (V2+). Try `GET /v4/accounts/{account_id}/version_stacks/{asset_id}`, then `.../files/{asset_id}`.
- When V2 is stacked onto a single file, Frame.io may create a **new** stack ID with the original file inside. Check the file's parent; store both IDs.
- Version order: `.../version_stacks/{id}/children`. Confirm how order is exposed.
- `account_id` is required in every V4 path; fetch once, keep in config.

**API notes:**
- Docs: https://next.developer.frame.io (V4; `/llms.txt` has an index). **V4 only**; V2 endpoints are removed Dec 1, 2026. Auth via Adobe Developer Console.
- Webhooks: `file.versioned` and `file.ready`. Wait for `file.ready`/transcoding before downloading.
- Download the **H.264 proxy** (`include=media_links.video_h264_720` or similar), not the original. Media links can be null until transcoded.
- Back off on 429 (~100 calls/min on some endpoints).
- Comments go on the **specific version**. `timestamp` is a **frame number starting at 1**; `duration` in frames. Verify field names.

**Check:** send the proxy to **Gemini** (video-native) with `prompts/qc-video.txt`. Keep the model call behind one function so Claude (ffmpeg frames every 0.5s) can be swapped in. Get fps from `ffprobe`; don't assume 30.

**Comments:**
- `timestamp = round(start × fps) + 1`, `duration = max(1, round((end − start) × fps))`
- `🧑‍✈️ Captain Caption: "recieve" → "receive"`
- Zero issues: one comment at frame 1: `🧑‍✈️ Captain Caption: V{n} passed ✅ — no typos found`

## Design pipeline (Figma)

**Example link (real, from the Design board):**
```
https://www.figma.com/design/LKvGdgYJ7LT5UHqa69i6Uy/MEDIA-Products-2026?node-id=1-18&t=4Ukl1MDJmWcnj6w1-1
```
- `file_key` = `LKvGdgYJ7LT5UHqa69i6Uy` (file "MEDIA-Products-2026")
- `node-id=1-18` → API node ID `1:18`
- `t=` is a share-tracking parameter; ignore it.

What this tells us: the team works in **large shared files** (e.g. one file for all 2026 media products), and each Monday task links to **one node inside it**. So:
- The Captain checks **only the linked node and its children**, never the whole file.
- First, inspect what `1:18` is (page, section or frame). If it's a section or contains several frames, treat each top-level frame as a **size variant** of the same task (for the cross-size copy check).
- One file holds many tasks, so a file-level event can affect many Monday items. Track `(file_key, node_id)` per item.
- Links without a `node-id` are flagged on the Monday item ("Please link to the specific frame") rather than checking a whole file.

**Reading the design (verify endpoints and scopes in Figma's REST API docs):**
- `GET /v1/files/{key}/nodes?ids={node_id}` and walk the tree for **TEXT nodes**: the exact text (`characters`), layer name, position and size. This gives the real copy, with no OCR guessing.
- `GET /v1/images/{key}?ids={node_id}&format=png&scale=2` to render the frame. Send it alongside the text so the AI can also catch text baked into images, text cut off or overflowing its box, and overlaps. Save the render for the panel.
- Use `/v1/files/{key}/versions` to know which version was checked; store the version ID.
- Respect rate limits (they depend on the plan and seat; check the current limits). Cache file data; never re-download unchanged files.

**Check:** send the text-layer list plus the render to the AI with `prompts/qc-design.txt`. Issues come back with the **node_id** of the layer.

**Design-specific checks:**
- Everything in the video list (spelling, wrong words, brand names, Brain rules).
- **Copy must match across sizes:** if the same ad exists as 1:1, 4:5, 9:16, banner, etc., the copy should be identical unless intentionally different. Flag mismatches.
- Leftover placeholders: "Lorem ipsum", "Text here", "XX%", "$00", "[Headline]".
- Text overflowing or clipped by its frame (compare text bounds to the parent frame; confirm with the render).

**Comments:** `POST /v1/files/{key}/comments` with `client_meta: {node_id, node_offset}` so each comment is **pinned to the exact text layer**. Same format: `🧑‍✈️ Captain Caption: "recieve" → "receive"`. Zero issues: one comment on the frame: `🧑‍✈️ Captain Caption: V{n} passed ✅`.

**Versions (confirmed): designers update the same frame.** There's no V2 frame to find, so versions come from **Figma's version history** and content changes:
- Figma keeps a version history per file (autosaves plus named versions): `GET /v1/files/{key}/versions`. Any version can be read with `?version={id}`.
- Each check stores the Figma version ID and a **hash of the node's text layers + render**. The version number shown (V1, V2, V3…) counts the distinct content states the Captain has checked for that Monday item.
- On a file event, re-read every tracked node in that file and check **only the ones whose hash changed**. In a big shared file, someone editing a different task must not trigger checks on yours.
- Debounce: wait until the file has been quiet for a few minutes (designers save constantly) before checking.

**Webhooks:** Figma webhooks v2 (`POST /v2/webhooks`). Test which events actually fire for this team's way of working: `FILE_UPDATE` (fires after editing pauses), `FILE_VERSION_UPDATE` (named versions; check whether autosaves trigger it) and `FILE_COMMENT` (live learning). Use whichever reliably catches changes, plus the hash check above. Verify the `passcode`. Confirm which context levels (team/project/file) the plan supports. Fallback if webhooks prove unreliable: poll `/versions` for tracked files every 10–15 minutes.

**Token:** AfterLife already has `FIGMA_TOKEN`. Check its scopes: this project also needs comment **write** and webhooks. Prefer a dedicated "Captain Caption" Figma account so comments show the Captain as author.

## QC engine: Gemini vs Claude 5.5 (decide by testing)
Gemini has already worked well on video. Claude 5.5 is a strong candidate, especially for designs and the Brain. Don't pick by opinion: **build both behind one `qcEngine` interface and run a bake-off.**

**Known facts (verify in current docs):**
- **Gemini** accepts video files directly, including audio. That matters for the voiceover-vs-caption check.
- **Claude API** has no video input: it takes images (many per request) and text. For video, send ffmpeg frames (every 0.5s plus scene changes) and, for audio, a transcript from **Whisper** (AfterLife's media service already runs Whisper; reuse it).
- **Designs** are images + exact text layers: native territory for both.
- Claude 5.5 models: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`. Check current pricing on the Anthropic docs.

**Starting defaults:**
| Job | Default | Also test |
|---|---|---|
| Video QC | Gemini (proven, native video + audio) | Claude Sonnet/Opus 5.5 with frames + Whisper transcript |
| Design QC | Claude Sonnet 5.5 | Gemini, Claude Opus 5.5 |
| Brain: classifying thousands of past comments | Claude Haiku 5.5 (fast, cheap, bulk) | Sonnet 5.5 |
| Brain: distilling patterns, rules and insights | Claude Opus 5.5 | Sonnet 5.5 |

**Bake-off:**
- Test set: the **confirmed corrections from the Brain bootstrap** (real assets where a typo was caught and fixed in the next version) plus 10–20 clean assets. That gives real right answers to grade against.
- Measure per engine and discipline: typos caught, false alarms, correct timestamps/layers, JSON reliability, cost per check, time per check.
- Show the results in HQ (a small "Engine comparison" page) and recommend a winner per discipline. The Head of Creative decides.
- Settings: engine per discipline, switchable without code. Optional **second-opinion mode**: run both engines and only post issues they agree on, or post 🔴 must-fix issues from either.
- Every check records which engine and model it used, so accuracy can be compared over time.

## Prompts
Keep in `prompts/`, inject the Brain at runtime. Prompts must work with both engines (same JSON output).

`qc-video.txt`:
```
You are a proofreader for UGC video ads for the skincare brand Particle.
Read ALL on-screen text: captions, titles, overlays, CTAs, prices, end cards.

Flag only real errors:
- Misspellings
- Wrong words (your/you're, its/it's, lose/loose, form/from)
- The same word spelled inconsistently across the video
- Brand or product names that don't exactly match the Brain
- Text cut off by the frame edge

Do NOT flag casual UGC language (gonna, obsessed!!, lowercase style, emojis). It's intentional.

Brand knowledge from the Brain:
{{BRAIN}}
Reference images, if attached, show approved on-screen text and layouts. Compare against them.

Return ONLY valid JSON:
{"issues": [{"start": 7.2, "end": 9.8, "found": "recieve", "fix": "receive", "type": "spelling", "severity": "must_fix"}]}
If no errors: {"issues": []}
```

`qc-design.txt`: same rules and Brain, adapted for static designs: input is the list of text layers (node_id, layer name, text) plus a render of the frame(s). Adds the cross-size copy match, placeholder and overflow checks. Returns `{"issues": [{"node_id": "12:345", "found": ..., "fix": ..., "type": ..., "severity": ...}]}`.

## Backend panel (Captain Caption HQ, inside CP Panel)
A section of CP Panel the team uses to see everything the Captain has done and to teach him. It should feel like a polished product: clean, fast, visual, light and dark mode, good on a laptop and usable on a phone.

**Access:** CP Panel's existing login and roles. Record who did what (feedback, Brain edits, re-runs).

### 1. Activity log (home screen)
Every event is logged, including skips:
- **Checks:** passed / issues found / error
- **Skipped:** TV project, out-of-scope department, already checked, nothing changed
- **Brain edits and feedback** (who, what, when)

Each row: thumbnail, **discipline (🎬 Video / 🎨 Design)**, Monday item, version, status badge, issue count, department, product, campaign, editor or designer, trigger (In Review / For Approval / new version / manual), scope reason (department or "Meta" in title), engine/model, date and time, processing time, AI cost. Links to the Monday item and the Frame.io version or Figma frame.

**Filtering and search:**
- Instant full-text search across item names, campaigns and the typo text itself (search "recieve" → every video and design where it was caught).
- Filters: discipline, date range, status, version, department, product, campaign, editor/designer, issue type, severity, trigger.
- Filters stack as removable chips; state lives in the URL so views can be shared. Saved views.

### 2. Check detail page
- **Video:** player (Frame.io proxy) with issue markers on the timeline; click to jump.
- **Design:** the rendered frame with numbered **pins on each issue's text layer**; click a pin to highlight it.
- Issue list with a still/crop, found → fix, type, severity.
- **Feedback on every issue:** ✅ Good catch / ❌ Not a typo → one-click "Teach the Captain".
- **Re-run** button (bypasses dedup; logs who). Collapsible raw AI response.

### 3. Insights
Checks and issues per week, split by video and design; pass rate on first check; most common mistakes; issues by product, campaign, type and discipline; Captain accuracy over time (Good catch vs Not a typo).

### 4. Manual check
Paste any Frame.io or Figma link → check now (respects scope unless an admin overrides).

### 5. Settings
Allowed departments and title keywords (e.g. "Meta"), auto-check new versions on/off (per discipline), QC engine and model per discipline, second-opinion mode, max reference images, show 💡 reviewer insights on/off. Admin-only.

## Captain Caption's Brain
The knowledge the Captain uses on every check. The UI should be clear that he "learns" by **remembering what the team teaches him and what reviewers have said before**: Brain items are added to his instructions at check time. The model itself is not retrained.

**Two layers:**
1. **Proofing knowledge (strict):** used to flag issues.
2. **Reviewer insights (suggestions):** patterns from real past feedback, e.g. "Reviewers often ask for a bigger logo on end cards" or "Hooks with the price in the first 2 seconds usually get pushback". Shown as a separate **💡 Heads-up** section in the Monday summary, never as typo comments. Can be turned off.

**Item types (each: title, content, discipline [video / design / both], scope, active toggle, source, added by, date):**
| Type | Examples | How it's used |
|---|---|---|
| Approved terms | Gravité (with accent), product and ingredient names, hashtags | Exact-match spelling list |
| Do-not-flag | UGC slang, intentional creator spellings | Never reported |
| Rules | "Prices always $29.99", "Never write 'cure'", "CTA must say 'Shop Now'" | Instructions in the prompt |
| Reference images | Approved end cards, logo lockups, packaging, correct layouts | Sent alongside the asset to compare |
| Documents | Brand guidelines, claims sheet, offer calendar | Text extracted and searchable; relevant parts added |
| Learned corrections | From ❌ feedback, confirmed catches, and the Frame.io/Figma history | Approved terms / do-not-flag / known common mistakes |
| Reviewer insights | Recurring creative feedback from past comments | 💡 Heads-up suggestions |

**Scope and retrieval:** items apply to everything, or to a discipline, product, campaign or department. At check time load global items plus matching ones; for large sets (especially insights and past comments) use **pgvector embeddings** to pull only the most relevant. Cap reference images per check.

**Brain UI:** drag-and-drop images and documents; quick-add for terms and rules; search and filter by type, discipline, scope, source and author; a **review queue** for anything learned automatically (nothing goes live without approval); version history with undo; "test it" re-runs a past check against the current Brain.

**Seed** with: Particle, Face Cream, Instant Eye Firming Cream, Anti Gray Serum, Gravité, Deodorant.

**Live learning:** new human comments on tracked assets (Frame.io comments, Figma `FILE_COMMENT`) are classified the same way as the history import and feed the review queue continuously.

## Brain bootstrap: learn from every past comment (Frame.io + Figma)
One-time import, re-runnable. Reads every comment ever left, across **all versions**, and turns the useful ones into Brain candidates. **Read-only: never post, edit or resolve anything during the import.**

**Step A: Crawl**
- **Frame.io:** every project → folder → file/version stack → every version → all comments and replies (frame, author, date, resolved, annotations).
- **Figma:** every team (TODO: get team IDs) → project → file → `GET /v1/files/{key}/comments` (includes replies and resolved comments, with the node or position each is pinned to) and `/versions`.
- Store raw data in `captain_import_*` tables first; later steps never hit the APIs again. Resumable; respect rate limits.
- **Before analysing, print a report:** projects, files, versions and comments per platform, plus an AI cost estimate. Wait for approval.

**Step B: Scope**
Match each asset to its Monday item via the `link` column on the right board (BoardMap). Learn only from in-scope items (marketing/digital, no TV). Unmatched assets are tagged and excluded unless an admin includes them.

**Step C: Understand each comment**
Classify with the AI:
- **Text/copy** (typos, wording, prices, offers, brand names, claims) → proofing candidates
- **Creative feedback** (pacing, music, hook, layout, hierarchy, colour, imagery) → reviewer-insight candidates
- **Noise** ("love it", "approved") → ignore

Add before/after context:
- **Video:** read the on-screen text at the comment's frame, then the **next version** at the same moment.
- **Design:** read the pinned text layer in the file version from when the comment was made (`/v1/files/{key}/nodes?ids=…&version=…`), then in a later version.
- If the text changed as requested, it's a **confirmed correction** ("recieve" → "receive", "Grab yours" → "Shop Now").

**Step D: Distil**
Merge into patterns ("'Gravité' missing its accent, corrected 14 times across 9 videos and 5 designs"). Recurring preferences become rules; recurring creative feedback becomes insights, tagged by discipline. Every candidate keeps its evidence: count, who said it, links to example comments and frames.

**Step E: Human review**
Everything lands in the review queue, sorted by frequency. Bulk approve / edit / reject. Old offers and prices are flagged as possibly expired.

## Stack & hosting: a module inside CP Panel
Built as an **extension of CP Panel** (https://particlepdio.particleface.com), not a separate app. Expected stack (verify): React frontend via nginx, Node/Express API, Postgres, Docker Compose behind Caddy on the company server.

- **Frontend:** a **Captain Caption** section in CP Panel's navigation with the HQ pages. Reuse CP Panel's design system so it feels native.
- **Login and roles:** CP Panel's existing auth. Admins edit the Brain and Settings; everyone can view history and give feedback.
- **API:** routes under `/api/captain/*` using CP Panel's auth middleware.
- **Worker:** a separate `captain-worker` service in `docker-compose.yml` for webhooks, downloads, ffmpeg, Figma renders and AI calls, so heavy jobs never slow down CP Panel. Postgres-backed job queue (e.g. pg-boss), or follow AfterLife's Redis pattern if that fits better. ffmpeg/ffprobe in the image. If AfterLife runs on the same server, check whether its media service can be shared, and ask before doing so.
- **Webhooks:** `/api/captain/webhooks/monday`, `/frameio`, `/figma` through Caddy. Acknowledge fast, then queue. Verify challenges, signatures and passcodes; these are the only unauthenticated routes.
- **Database:** new `captain_` tables in CP Panel's Postgres with migrations in the repo's pattern. Postgres full-text search for instant search; **pgvector** for Brain retrieval (check that the Postgres image supports it; AfterLife uses `pgvector/pgvector`).
- **Files:** stills, renders, thumbnails and Brain uploads in the existing R2 bucket under `captain/`.
- **Secrets:** Frame.io, Figma, Monday, Gemini and Anthropic keys in `.env` (names only in `.env.example`).
- **Backups:** confirm the nightly `pg_dump` covers the new tables.
- **Deploy:** the same way CP Panel deploys today; document in the RUNBOOK. Run CP Panel's build/tests before every deploy.
- **Resources:** check CPU/RAM/disk before going live; limit the worker to 1–2 checks at a time.

## Build order
1. Read CP Panel and AfterLife; report what you'll reuse.
2. **Video:** resolve the example Frame.io link (file vs stack, versions, fps). Get this right first.
3. Video QC: proxy → Gemini → issues. Test on 3–5 real ads, including one with a known typo.
4. Post Frame.io comments on a test file; confirm markers land correctly in Premiere.
5. **Design:** resolve the example Figma link (what `1:18` is, its frames and text layers, render, version history). Design QC → issues → pinned Figma comments on a test file (never the real MEDIA-Products-2026 file while testing).
6. Monday webhooks on both boards → V1 / V2 logic, scope filter, Monday updates.
7. Version webhooks: Frame.io `file.versioned`, Figma `FILE_VERSION_UPDATE` → V3+.
8. Dedup, retries, logging; deploy the worker and API routes.
9. Panel: activity log with search and filters, then check detail pages (video and design) with feedback.
10. Brain: terms, rules, do-not-flag; then images and documents; then learned items, review queue and insights.
11. Brain bootstrap from Frame.io and Figma history (crawl → report → classify → review queue). The crawls are read-only and can start early.
12. **Engine bake-off** (Gemini vs Claude 5.5) on the confirmed-corrections test set; set defaults per discipline.
13. Insights and settings.

Log every event from the start in the final format, so history is complete when the panel goes live.

## Ground rules
- Never delete or resolve human comments in Frame.io or Figma.
- Every bot comment and Monday update starts with `🧑‍✈️ Captain Caption:`.
- Fail loudly: if a check errors out, post a Monday update saying so.
- Name the module/service `captain-caption`.
