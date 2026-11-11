---
name: medium-brief
description: Ask MEDIUM, the CP's creative strategist, to write an ad brief and queue it for review. Use when the user says "/medium …", "ask Medium", "Medium brief", "write a brief for <product>", "transfer <concept> to <product / lane / format>", "new hooks for <winner>", "refresh <winner>", "new angle for <product>", "use the headline '<X>' as a video hook", or describes an ad idea they want Medium to write up. Briefs land in the CP review queue; nothing reaches Monday until a person approves it there.
---

# MEDIUM brief

MEDIUM lives in the CP (Particle's production panel). It writes briefs in the team's house style, scores them, has Captain Caption proofread them, and puts them in the review queue. This skill turns a request into one API call, waits for the brief, and reports back.

All calls go through the script next to this plugin:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/medium.sh" <command> …
```

(If `CLAUDE_PLUGIN_ROOT` is empty, the script is at `scripts/medium.sh` in this plugin's folder — two levels up from this file.)

## Before the first call

- The script needs `MEDIUM_TOKEN` in the environment. If it says the token is missing, tell the user to ask their CP admin for the Medium token and add it to the `env` block of their Claude settings. Never ask them to paste the token into the chat, and never write it into a file.
- Each brief costs roughly 5–15¢ of the CP's AI budget. For more than 3 briefs in one request, confirm the count with the user first.

## Read the request

**Products** (abbreviations the team uses): FC = Face Cream · NC = Neck Cream · IEFC = Instant Eye Firming Cream · HC = Hand Cream · AGS = Anti-Gray Serum. Anything else: use the product name as written; `medium.sh overview` lists the products the CP knows (`options.products`).

**Lanes**: `Particle` (direct, the default) · `SFY` (Science For You) · `GT` (Gentleman Today) · `WAC` (We Are Colognes). SFY / GT / WAC ads point at an article — pass `article_url` if the user gives one.

**Format**: `video` (default) or `design` (a static; the user may say "static", "image", "banner").

**Moves** — pick one:

| The user says | `move` | Extra fields |
|---|---|---|
| "transfer X from FC to NC", "take X to Neck Cream" | `TRANSFER_PRODUCT` | `product` = target, `source_product` = where it won, `source` = the concept |
| "take X from SFY to GT" | `TRANSFER_LANE` | `lane` = target, `source_lane` = where it won, `source` = the concept |
| "make a static version of X" / "turn this static into a video" | `TRANSFER_FORMAT` | `format` = target, `source_format` = where it won (`video` / `design`), `source` |
| "new hooks for X", "iterate X" | `ITERATE` | `source` = the winning ad |
| "refresh X", "X is fatiguing" | `REFRESH` | `source` |
| "bring back X" (a sibling that never ran) | `REVIVE` | `source` |
| "use the headline '…' as a video hook" | `HEADLINE_HOOK` | `headline` = the exact line, `format` = `video` |
| anything else for a product | `NEW_ANGLE` | — |

Optional for every move: `count` (1–6, default 1), `note` (anything else the user said — tone, length, season), `campaign`, `template`, `author` (the user's name, if you know it).

**Your own words, no move** — when the user describes an idea in their own words ("a guy notices his neck in a wedding photo…"), use **freeform** instead: `{ "idea": "…", "references": ["links they gave"], "lane"?, "product"?, "format"? }`. Medium writes it twice: the idea as given, and its own sharper version.

`product` is required for every move except freeform. If it is missing and you can't tell from the request, ask one short question. Don't ask about anything else — Medium decides the rest.

## Make the call

```bash
# a move
bash "${CLAUDE_PLUGIN_ROOT}/scripts/medium.sh" generate '{"lane":"Particle","product":"Neck Cream","format":"video","move":"TRANSFER_PRODUCT","source_product":"Face Cream","source":"Understand-the-Why","count":1}'
# → {"queued":1,"ids":["7e4c85f3-…"]}

# freeform
bash "${CLAUDE_PLUGIN_ROOT}/scripts/medium.sh" freeform '{"idea":"…","references":[]}'
# → {"queued":1,"id":"…"}
```

Then wait (about a minute per brief; the script polls every 10 s for up to 8 minutes):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/medium.sh" wait <id,id,…>
```

## Report back

For each brief in the `wait` result:

- **PENDING_REVIEW** — give the ticket name, the hook (in quotes), the score with its band, and Captain Caption's verdict (`preflight`; mention `must_fix` if it is above 0). Then the link: `https://particlepdio.particleface.com/medium?brief=<id>`.
- **DROPPED** — say why, in plain words, from `error` (for example a transfer the target product can't carry). Suggest a different move or product if the reason points to one.
- **ERROR** — show `error` and suggest trying again.
- Still writing after the wait — say so and give the `medium.sh briefs <ids>` command to check later.

Close with one line: the brief is waiting in the CP's review queue, and nothing goes to Monday until someone approves it there.

## Example

"/medium transfer FC Understand-the-Why to Neck Cream"

```json
{"lane":"Particle","product":"Neck Cream","format":"video","move":"TRANSFER_PRODUCT","source_product":"Face Cream","source":"Understand-the-Why","count":1}
```
