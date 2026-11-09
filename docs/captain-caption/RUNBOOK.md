# Captain Caption 🧑‍✈️ — Runbook

Plain-English notes on what's running, what it costs, how to tell it's healthy, and what to do when something breaks.
**When in doubt: open Claude Code in the CP Panel folder and describe the problem.** It can read this file.

## What it is
A proofreader inside CP Panel (**Captain Caption** in the menu). It checks the text in Particle's videos (Frame.io) and designs (Figma). Then it comments exactly where the problem is, like one more reviewer:
- **Videos:** a comment on the exact frame of the exact version. These sync to Premiere as markers.
- **Designs:** a comment pinned to the exact text layer in Figma. Designs come in the next step.
- **Monday:** one summary update on the task.

It reads the on-screen text **and listens to the voiceover**. Then it compares both with the Monday brief: the script, the hook variations, and the sentence order.

## What runs where
| Piece | Where | Notes |
|---|---|---|
| HQ pages | CP Panel → Captain Caption (`/captain`) | Activity, Check a link, Brain, Settings |
| API | CP's `api` container, routes under `/api/captain/*` | Only receives clicks and webhooks, then queues jobs |
| Worker | `captain-worker` container (same code, `node src/captainWorker.js`) | Does the heavy work: downloads, Gemini, comments. Runs 1 check at a time, capped at 1 CPU and 1 GB memory |
| Job queue | `captain_jobs` table in CP's Postgres | No Redis needed |
| History | `captain_checks`, `captain_issues`, `captain_events` | Included in the nightly database backup to Dropbox |
| Brain | `captain_brain` (+ `captain_brain_history`) | Terms, rules, do-not-flag, learned items, insights |
| Settings | `settings.captain_config` | Edited in HQ → Settings (admins only) |

### The Captain's own accounts (email tomer@blurrskin.com)
| Service | How it's connected | Where the secret lives |
|---|---|---|
| Frame.io | **Connect the Captain** button in HQ → Settings (Adobe sign-in) | Database: `settings.captain_frameio_tokens`. Creative Weekly's own Frame.io connection is separate and untouched |
| Figma | Personal access token named "Captain Caption" | Server `.env` → `CAPTAIN_FIGMA_TOKEN`. **Expires 7 Feb 2027** |
| Monday | The Captain user's API token | Server `.env` → `CAPTAIN_MONDAY_TOKEN` |
| Gemini (video AI) | CP's existing key | Server `.env` → `GEMINI_API_KEY` (prepaid credit; auto-reload is off) |
| Claude (design AI) | CP's existing key | Server `.env` → `ANTHROPIC_API_KEY` |

## The posting switch (HQ → Settings)
- **Off:** checks run and results show in HQ only.
- **Test only** (the starting setting): comments are posted only in the Frame.io folder *Video › 2026 › 11_November › Not a Product Task › Captain Caption Test* and the Figma file *Captain Test*. Every other check is still run and shown in HQ.
- **Live:** comments go on real videos and designs, plus a summary on real Monday tasks.

## Monthly cost (estimates; check the bills)
- **Gemini video checks:** about **2¢ per video** with Gemini 3.8 Flash (≈30k tokens in, 2k out for a 1-minute ad). 300 videos a month ≈ **$6**. Gemini 3.1 Pro as a second opinion costs about 4× more.
- **Claude design checks:** to be measured in the design test.
- **Seats:** the Captain's Monday user (paid seat) and its Frame.io seat if it uses one. Check both on the billing pages.
- **Server:** nothing extra. The worker runs on the existing CP server.

HQ shows an estimated AI cost on every check (Activity → each row).

## How to check it's healthy
Open **CP → Captain Caption**. The pills at the top should all be green:
- **Frame.io / Figma / Monday:** connected as Captain Caption.
- **Gemini:** key present.
- **Worker:** heartbeat in the last 2 minutes.

In **Activity → Errors**, any failed check is listed with the reason. The Captain also says so on the Monday item when posting is live.

## When something breaks
| Symptom | Likely cause | Fix |
|---|---|---|
| Worker pill red | The worker container stopped | Ask Claude: "restart the captain-worker". On the server: `docker compose -f docker-compose.prod.yml up -d captain-worker` |
| Frame.io pill red / "session expired" | The Adobe sign-in lapsed, or the password changed | HQ → Settings → **Reconnect**, signing in as the Captain (tomer@blurrskin.com) |
| Figma errors "403" | The token expired (7 Feb 2027) or was revoked | See "Rotating tokens" below |
| "Gemini 402" or "credit" errors | Gemini credit is used up | Top up in Google AI Studio → Billing |
| Checks stuck on "Checking…" | The worker restarted mid-check | Jobs stuck over 30 minutes go back in the queue automatically. **Re-run** in the check's panel |
| A false alarm keeps coming back | The Captain doesn't know it's intentional | Click **❌ Not a typo** on the issue, then approve it in Brain → Review queue |

## Rotating tokens
**Never paste a token in chat or commit it to git.** The repo is public.

1. **Figma:**
   - Log in to Figma as the Captain.
   - Go to **Settings → Security → Personal access tokens → Generate new token**. Name it "Captain Caption", with the same scopes: file content read, file versions read, comments write, webhooks write.
   - Save the token in a text file on your Desktop named `captain-figma-token.txt`.
   - Ask Claude to "install the new Captain Figma token". It updates `CAPTAIN_FIGMA_TOKEN` in the server `.env`, restarts the api and captain-worker, and deletes the file.
2. **Monday:**
   - As the Captain, go to **avatar → Developers → My access tokens**.
   - Save the token to `captain-monday-token.txt` on your Desktop and ask Claude to install it (it goes in `CAPTAIN_MONDAY_TOKEN`).
3. **Frame.io:** HQ → Settings → **Reconnect**. There's no token to copy.

## Deploying
Captain Caption deploys with CP Panel:
1. Build the frontend and copy `dist/` to the server.
2. Copy the backend to the server and rebuild the containers: `docker compose -f docker-compose.prod.yml up -d --build api captain-worker`.
3. Run new database migrations (`db/migrations/032_captain_caption.sql` and later).

Run `cd backend && node --test test/captain.test.js` and `npm run build` first. Deploy only when Tomer says **deploy**.
