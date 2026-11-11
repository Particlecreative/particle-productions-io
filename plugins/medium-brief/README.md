# medium-brief

A Claude Code / Cowork plugin that asks MEDIUM (the CP's creative strategist) for ad briefs.

```
/medium transfer FC Understand-the-Why to Neck Cream
/medium new hooks for the Neck Cream mirror ad, 3 of them
/medium use the headline "Your Neck Is Telling Everyone Your Age" as a video hook for NC
```

The brief is written, scored and proofread in the CP and lands in its review queue (`/medium` in the CP). Nothing reaches Monday until a person approves it there.

## What the plugin can do

With the Medium token it can only **create** briefs (`POST /api/medium/generate`, `/freeform`, `/static-hooks/generate`) and **read** them (`GET /api/medium/briefs`, `/briefs/:id`, `/overview`). It cannot approve, reject, change settings or touch Monday.

## Setup

**1 · Server (CP admin, once).** The CP accepts `MEDIUM_SERVICE_TOKEN`, and falls back to `CAPTAIN_SERVICE_TOKEN` when that isn't set. For a separate token (recommended, so it can be rotated without touching Captain):

- add `MEDIUM_SERVICE_TOKEN=<64 random hex>` to the server's `.env` (`openssl rand -hex 32`);
- list it under `api.environment` in `docker-compose.prod.yml` (`MEDIUM_SERVICE_TOKEN: ${MEDIUM_SERVICE_TOKEN:-}`);
- recreate the api container.

Never commit the token — this repo is public.

**2 · Each person's machine.** Put the token in the `env` block of your Claude settings (`~/.claude/settings.json`), not in a chat or a repo file:

```json
{ "env": { "MEDIUM_TOKEN": "<the token>" } }
```

Optional: `MEDIUM_URL` (default `https://particlepdio.particleface.com`).

**3 · Install.**

- Claude Code / the desktop app's Code tab:
  ```
  /plugin marketplace add <path to this repo>/plugins/medium-brief
  /plugin install medium-brief@particle-medium
  ```
  (or try it without installing: `claude --plugin-dir plugins/medium-brief`)
- Cowork: zip this folder (`cd plugins && zip -r medium-brief.plugin medium-brief`) and add the `.plugin` file under Plugins.

Needs `bash` and `curl` (both on every Mac).

## Files

- `.claude-plugin/plugin.json`: the plugin manifest. `marketplace.json` makes this folder installable as a one-plugin marketplace.
- `commands/medium.md`: the `/medium …` command.
- `skills/medium-brief/SKILL.md`: how Claude turns a request into the right call.
- `scripts/medium.sh`: the API calls. The token goes to curl through stdin, so it never shows in the process list.
