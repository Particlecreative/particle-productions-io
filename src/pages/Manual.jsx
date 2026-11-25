import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, BookOpen, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';
import clsx from 'clsx';

// ─── Manual Content Data ──────────────────────────────────────────────────────

// ─── Growth team (17 Nov 2026) ─────────────────────────────────────────────────
// RULE (Tomer): every change to the growth team's panel updates this section AND adds a dated line to "What's new".
const GROWTH_WHATS_NEW = [
  { date: '25 Nov 2026 — later', items: [
    '⏱ My HR (left menu): connect your own BambooHR once — clock in / out, your hours, time off and balances, who’s out — right in CP, with a 10:00 / 19:00 reminder if you forgot to clock in or out.',
    '⚡ Pages refresh themselves while they’re open, and dark mode looks right now.',
    '🌙 Quiet hours: 🔔 → ⚙️ — no pop-ups at night or all weekend; everything waits in the 🔔.',
  ] },
  { date: '25 Nov 2026', items: [
    '📁 New tickets — from New ticket or from the Briefs Creator — get their folders made for them: video tickets a Dropbox folder and a Frame.io folder, design tickets a Dropbox folder. The links are on the ticket and in the brief. TV tickets get their Frame.io folder in “Productions”, next to the commercial’s other cuts.',
    '🧭 Briefs Creator → Market Watch → new “Built like Particle”: brands with a business like ours in other categories (Upspring Lookalikes — e.g. Harry’s, Intake Breathing) and the ads they keep running for months. Each has “Brief from this”, plus a weekly “Outside idea”.',
    '🧴 The competitor brands in Market Watch now come from Upspring Lookalikes — Particle’s closest rivals, refreshed every Sunday. Brands added by hand stay; removed ones don’t come back.',
    '💬 A task’s updates now look like Monday’s: formatting and tables, pictures and files (click a picture to see it big), likes, who has seen each update, pinned updates first, replies under each update and a search. Status changes show as coloured labels. New tabs: Files (everything on the task) and Activity (status moves, who was put on it, date changes — day by day).',
  ] },
  { date: '24 Nov 2026', items: [
    '📦 New: Creative Studio → By product — every product, week by week: how many video and design tickets are due, how far along they are (Done = ready to go live) and which ones are for Meta. Filter Meta / Not Meta and Video / Design; click a number to see the tickets.',
    '🛠️ Creative Studio → Overview and Workload load again (they showed zeros and “Not part of the Growth Studio”).',
  ] },
  { date: '18 Nov 2026 · evening', items: [
    '🧠 On Air → TV now runs on Particle Brain, copied every hour: spend, orders, MER, AOV and CPO for Day / Week / Month, every spot, station, time of day and market — and the charts go back 13 months, so the same month last year is right there.',
    '⚖️ A week or month still running is compared with the same days of the one before (Mon–Wed vs last Mon–Wed), so the arrows are fair.',
    '🛒 New strip — What TV brought in: site visits from TV, store orders from TV, new customers and how much of the revenue used the TV promo code.',
    '⏳ When the agency hasn’t reported a day yet, the summary says so and shows what the media pre-log has booked.',
  ] },
  { date: '18 Nov 2026 · later', items: [
    '📊 On Air reads the agency’s Excel files too: every spot’s real numbers per day, when and where it first aired, which stations and times of day work best, and what’s booked this week (with the creatives coming up).',
    '🛠️ Gravité shows all its spots again (a reply in the report thread was being read as the day’s report).',
  ] },
  { date: '18 Nov 2026', items: [
    '📅 On Air → Day / Week / Month: every number, chart and spot follows the period — yesterday vs the day before, this week vs last week, this month vs last month.',
    '✍️ On Air opens with a short summary of what happened (spend, orders, MER, the strongest and weakest spot, what’s new), and spots show a plain verdict: Strong, Fine or Weak.',
    '🏷️ Task updates: tagging people works (they get a real Monday mention), and links inside updates (“Uploaded on Dropbox folder”) are blue and clickable.',
  ] },
  { date: '17 Nov 2026 · evening', items: [
    '📡 New: On Air — what’s running on TV right now, from the agency’s daily report: every spot on air with its spend, orders, MER, CPO and AOV, what moved since the last report, what’s new on air, and the agency’s note.',
    '🏷️ Each spot shows our name for it in the CP and its production (PRD number + name) — and what the agency calls it.',
    '🎞️ TV Productions — redesigned: a clean list grouped by stage, a “Coming up” strip (shoots, deliveries, on-air dates, deadlines), filters for product, producer, editor and stage, and the internal editor / designer on every production.',
    '📺 TV Library — the green “On air” dot now follows the agency’s daily report.',
  ] },
  { date: '17 Nov 2026', items: [
    '🎉 Welcome to CP! The growth team has its own panel: Creative Studio, Briefs Creator, New ticket, Campaign Tracker, Ads Library, TV Productions and TV Library.',
    '🔗 Connect your Monday — the briefs and tickets you send from CP land on Monday as you.',
    '📥 Creative Studio → My requests — every ticket you asked for, where it is now.',
    '📊 Creative Studio → Overview — the studio right now: Working, Pending, In review, Fixes, Stuck, by campaign type and by product.',
    '📱 Ads Library — AfterLife’s Fresh to test, live inside CP, plus an “Open AfterLife” button.',
    '📱 Works on your phone — bottom bar with Studio, Briefs, Ticket, Campaigns and More.',
  ] },
];

// The Creative team's manual (25 Nov 2026) — video editors & designers learn CP here. Every change to their pages updates
// this section and adds a dated line to CREATIVE_WHATS_NEW (same rule as the Growth team's).
const CREATIVE_WHATS_NEW = [
  { date: '25 Nov 2026 — later', items: [
    '🔑 Studio passwords (left menu): every studio login from the Access Passwords board — search, copy the login, reveal or copy the password (it hides again after 20 seconds), edit, or add a new one. It’s the Monday board itself, live.',
    '🎡 Home → My week: a wheel of your week’s tasks — by status, priority, requester, campaign type, product or type. Arrows go a week back or forward; click a slice to see its tasks. Still-open tasks from earlier weeks count as “carried over”.',
    '🎬 Home → Line of the day — the studio’s movie line, on your Home too.',
    '⚡ Live: Home and My Studio refresh themselves every 30 seconds (“● Live” at the top). A task you were just put on, or one someone else moved, shows a green New / Moved badge and a note at the top. An open task’s updates refresh every 20 seconds.',
    '🌙 Dark mode looks right now — every page.',
    '⏱ My HR (left menu): connect your own BambooHR once, then clock in / out, see today’s and this week’s hours, ask for time off, see your balances and who’s out — all in CP. A reminder at 10:00 if you haven’t clocked in, and at 19:00 if you’re still clocked in. The pill next to the 🔔 shows if you’re in.',
    '⏳ A task now shows “Time on this task”: when it was asked for, how long you actually worked on it (Working while you were clocked in), review rounds and where it waited.',
    '🎬 Cards show the latest Frame.io version in the task’s folder and its comment count (e.g. “v3 · 💬 4”); the task panel shows the file name too.',
    '✅ Delivery checklist: the task’s “Sizes needed” (× versions) as boxes in the task panel — tick each as you finish; the card shows 2/6. All ticked → CP asks if it should go to Review.',
    '▶ Now working on: the task you have in Working sits next to the clock at the top, with a running timer (it pauses while you’re clocked out). Click it to open the task.',
    '📅 My Studio → Week: ◀ ▶ go back and forward, and finished tasks show (green ✓) — “Show finished” turns them off.',
    '🏆 Home → My month: delivered, worked per task, review rounds, on time and your ads live on Meta — and months back.',
    '🌙 Quiet hours: 🔔 → ⚙️ → no pop-ups at night or all weekend — they wait in the 🔔.',
    '⏱ My HR opens with “Let’s connect your BambooHR” — two steps and you’re in.',
    '🧩 Home is yours to arrange: drag any card anywhere (⠿), resize it (⅓ ½ ⅔ Full, or drag its corner), hide it — and a tidier default (Today next to My clock, My week next to My month).',
    '⏰ Home → My clock: Clock in / Clock out in one click, today’s time, and your month so far against what’s expected (with % and how much is left to the month’s target).',
    '🌴 My Studio shows who on the team is out — vacation, sick or other — today and coming up, and the Week view marks each day with who’s out (and holidays).',
    '🗂️ My Studio, Monday-style: Filter by any field (status, priority, deadline, product, type, campaign, who asked, brand, board, missing link, checklist — with counts), Quick filters (Overdue, Due this week, Needs my link, High priority, In review, Fixes), Sort, Group by any field (board and table), table Columns (show, hide, order), change a status right in the table, and saved Views as tabs.',
  ] },
  { date: '25 Nov 2026', items: [
    '🎬 A video ticket made in CP (New ticket or Briefs Creator) already has its Frame.io folder — Video › year › month › product › the ticket (TV: Productions › product › the commercial). Upload your cuts there; the link is on the task.',
    '🎉 Your own CP: Home, My Studio (Board · My tasks · Week), New ticket, Briefs Creator, Productions, TV + Ads Library, On Air, My AfterLife and the Team Weekly — no need to open Monday for your day-to-day.',
    '🔗 Paste your Frame.io (video) or Figma (design) link right on the task — “Your delivery” at the top, or “+ Frame.io link” on the card. Once it’s saved CP asks if it should go to Review.',
    '🔔 Notifications: when your task’s status moves, someone writes or tags you, you’re put on a task, or your ad goes live on Meta. Choose what you get in 🔔 → ⚙️.',
    '📄 Briefs read cleanly: the facts on top, labelled sections, Dropbox / Frame.io / Figma links as named chips.',
  ] },
];

const CREATIVE_CATEGORY = {
  id: 'creative', label: 'Creative team', color: 'from-violet-500 to-[#0808f8]', creativeOnly: true,
  sections: [
    {
      id: 'creative-whats-new', icon: '✨', label: 'What’s new',
      summary: `Latest: ${CREATIVE_WHATS_NEW[0].date} — what changed in your CP, newest first.`,
      keywords: ['new', 'updated', 'changes', 'release'],
      content: CREATIVE_WHATS_NEW.map(w => ({ type: 'guide', title: w.date, steps: w.items })),
    },
    {
      id: 'creative-start', icon: '🚀', label: 'Start here',
      summary: 'Connect your Monday once — then everything you do in CP lands on Monday as you.',
      keywords: ['start', 'monday', 'connect', 'login', 'welcome'],
      content: [
        { type: 'guide', title: 'First time', steps: [
          'Sign in with the email the studio gave you.',
          'Click “Connect your Monday” (top right of every page, or More → My Monday). Your status changes, updates and links then show as you on Monday — your name, your notifications.',
          'Open Home — your day — and My Studio — your board.',
        ]},
        { type: 'tips', items: [
          'Not connected yet? CP still works — it signs what you write with your name.',
          'You see your own tasks only. The studio sets timelines, people and deadlines; you move the status, write, and add your links.',
        ]},
      ],
    },
    {
      id: 'creative-home', icon: '🏠', label: 'Home',
      summary: 'Your day: what’s late and due, what needs your link, what changed for you, your ads on air.',
      keywords: ['home', 'dashboard', 'today', 'arrange', 'widgets'],
      content: [
        { type: 'guide', title: 'The cards', steps: [
          'Today — overdue, due today, next two days, and your next tasks in the smart order. “→ Review” moves one on.',
          'Waiting for your link — tasks you’re working on with no Frame.io / Figma link yet.',
          'For you — your latest notifications. Coming up — your next deadlines.',
          'Your ads on air — your creatives running on Meta (from AfterLife). Team Weekly and My AfterLife — one click away.',
          'Line of the day — the studio’s movie line (collapse it with the arrow).',
          'My week — a wheel of your week: switch Status · Priority · Requester · Campaign type · Product · Type; ◀ ▶ move a week; click a slice (or its row) to list those tasks and open one. “Carried over” = still open from an earlier week.',
          'My month — delivered, worked per task (Working while clocked in), review rounds, on time and your ads live on Meta; ◀ ▶ for earlier months.',
        ]},
        { type: 'tips', items: [
          'The page is live — it refreshes every 30 seconds while it’s open (“● Live · updated 12s ago”). New tasks and moves by others get a green badge for two minutes.',
        ]},
        { type: 'guide', title: 'Make it yours', steps: [
          'Move a card anywhere: hover it and drag the ⠿ grip (top-right of the card) to where you want it — the others make room. Cards pack together with no gaps.',
          'Resize: pick ⅓ · ½ · ⅔ · Full in the card’s top-right, or drag its bottom-right corner sideways.',
          'Hide a card with the crossed eye; Arrange shows the hidden ones (click to bring back) and “Back to the default”. It’s all saved for you, on any computer.',
        ] },
      ],
    },
    {
      id: 'creative-studio', icon: '🗂️', label: 'My Studio — Board, My tasks, Week',
      summary: 'Every task you’re on: a Kanban board like Monday’s (smarter), a table, and your two weeks.',
      keywords: ['board', 'kanban', 'tasks', 'status', 'week', 'workload', 'drag', 'deadline', 'priority'],
      content: [
        { type: 'guide', title: 'Board', steps: [
          'Columns are your statuses, in Monday’s order. Drag a card to another column — the status changes on Monday as you.',
          'Cards are sorted for you: late and due-today first, then priority (Critical, High), then what starts and is due first.',
          '“By deadline” regroups the same tasks: Overdue · Today · Next 2 days · This week · Later · No deadline.',
          'A card shows the product, the deadline (red when late), the timeline, Frame.io / Dropbox / Figma buttons and who asked. “+ Frame.io link” / “+ Figma link” when a task you’re working on doesn’t have one yet.',
        ]},
        { type: 'guide', title: 'Filter, sort, group, views (like Monday)', steps: [
          'Filter — every field with how many tasks each choice has: status, priority, deadline, product, type, campaign, who asked, brand, board, missing Frame.io / Figma link, checklist. Pick any mix; the chips underneath show what’s on (✕ removes one).',
          'Quick filters — one click: Overdue · Due this week · Needs my link · High priority · In review · Fixes.',
          'Sort — Smart (what’s next), deadline, priority, status, timeline start, created, name, product; ascending or descending.',
          'Group — the Board and the table can group by status, deadline, priority, product, type, campaign, who asked, brand or board. (Drag-to-move works when grouped by status.)',
          'Views — set it up the way you like, then “Save as view”: it becomes a tab next to Main (✕ deletes it). Everything is saved for you, on any computer.',
        ]},
        { type: 'guide', title: 'My tasks and Week', steps: [
          'My tasks — a Monday-style table: Group by any field (or none), Columns to show / hide / reorder, click a column title to sort, click a status to change it right there. Each group shows its status mix as a bar; Collapse all / Expand all.',
          'Week — two working weeks with each task’s timeline as a bar and the deadline as ◆; ◀ ▶ go back and forward (finished tasks show with a green ✓ — “Show finished” hides them), and what isn’t scheduled yet below.',
        ]},
        { type: 'tips', items: ['Arrange — choose what a card shows, compact cards, show Done. Search finds a task by name, product or who asked.'] },
      ],
    },
    {
      id: 'creative-task', icon: '📝', label: 'A task — status, links, brief, updates',
      summary: 'Open any task: move it on, paste your link, read the brief, talk.',
      keywords: ['task', 'brief', 'frame', 'figma', 'dropbox', 'link', 'review', 'update', 'reply', 'like', 'files'],
      content: [
        { type: 'guide', title: 'Status', steps: ['Its status, “Move to …” for the next step in one click, and “Other status” for the rest.'] },
        { type: 'guide', title: 'Your delivery — Frame.io / Figma', steps: [
          'Video: paste the Frame.io review link. Design: paste the Figma link. The Dropbox folder is made with the ticket — open or copy it right there.',
          'A video ticket made in CP comes with its Frame.io folder already (Video › year › month › product › the ticket; TV: Productions › product › the commercial). Upload there — or replace it with your review link.',
          '“Paste” reads what you copied and saves it straight away (only the right kind of link is accepted).',
          'Then CP asks: “Ready to send it to Review?” — one click and it moves.',
          'Copy and Replace are next to a saved link.',
          'Under it: the latest file in the Frame.io folder (version, when, how many comments), and the delivery checklist from “Sizes needed” (× versions) — tick each one; everyone on the task sees the same ticks. All done → “Ready to send it to Review?”.',
        ]},
        { type: 'guide', title: 'Brief and updates', steps: [
          'The brief is first: the facts in boxes, then labelled parts (task, concept, reference, hooks, script).',
          'Write an update with @ to tag someone, attach files (drop or paste a screenshot), reply under any update, like.',
          'Files — everything on the task. Activity — every status move and date change, day by day.',
        ]},
      ],
    },
    {
      id: 'creative-notify', icon: '🔔', label: 'Notifications',
      summary: 'Status moves, updates, tags, new tasks, and your ad going live — choose what you get.',
      keywords: ['notifications', 'bell', 'alerts', 'desktop', 'settings', 'meta', 'live'],
      content: [
        { type: 'guide', title: 'What you hear about', steps: [
          'Your task’s status moved (by someone else) · someone wrote or replied on your task · someone tagged you · you were put on a task.',
          'Your ad was uploaded to Meta, and when it starts running (from AfterLife — usually the next day).',
        ]},
        { type: 'guide', title: 'Settings', steps: ['🔔 → ⚙️: switch each kind on or off, the corner pop-up, and desktop notifications (your browser asks once).', 'Quiet hours: pick the hours (e.g. 20:00–08:00) and/or all Fri–Sat — nothing pops up then; it all waits in the 🔔.'] },
      ],
    },
    {
      id: 'creative-more', icon: '🧭', label: 'Briefs, tickets, productions, On Air, AfterLife, Weekly',
      summary: 'Everything else in your CP — all without money.',
      keywords: ['medium', 'brief', 'ticket', 'productions', 'library', 'on air', 'afterlife', 'weekly'],
      content: [
        { type: 'guide', title: 'Pages', steps: [
          'New ticket — ask for work; it’s created on Monday as you.',
          'Briefs Creator (Medium) — write briefs in the team’s style; you see your own.',
          'Productions — what’s being made and when (shoots, deliveries, on-air). TV Library and Ads Library — past work and fresh ads.',
          'On Air — what runs on Meta (live since, ended on, yours first) and on TV (spots, first airing, what’s booked). No money.',
          'My AfterLife — your own AfterLife page; “Open in a new tab” for the full screen.',
          'Team Weekly — the team’s Sunday deck, to watch.',
        ]},
      ],
    },
    {
      id: 'creative-hr', icon: '⏱', label: 'My HR — clock in, time off',
      summary: 'Your own BambooHR in CP: clock in / out, hours, time off, who’s out.',
      keywords: ['hr', 'bamboo', 'bamboohr', 'clock', 'clock in', 'clock out', 'hours', 'vacation', 'time off', 'sick', 'holiday'],
      content: [
        { type: 'guide', title: 'Connect it once (about a minute)', steps: [
          'Left menu → My HR. Open BambooHR in another tab and sign in.',
          'Click your name (bottom-left) → “API Keys” → “Add New Key”, call it “CP”, then “Generate Key”.',
          'Copy the whole key, paste it in My HR, press Connect. (No “API Keys” in your menu? Ask HR to allow it.)',
        ]},
        { type: 'guide', title: 'Every day', steps: [
          'Clock in / Clock out — the big button on My HR, or the pill next to the 🔔 at the top.',
          'Today and this week: your hours against 9h a day (Sun–Thu).',
          'Time off: your balances, “Ask for time off” (type, dates, half day, a note), your requests — cancel one that’s still waiting.',
          'Who’s out this week / next week, and your details from BambooHR.',
          'Home → My clock: the same clock in one click, plus your month so far (hours vs. expected, %, what’s left to the month’s target).',
        ]},
        { type: 'tips', items: [
          'At 10:00 CP reminds you if you haven’t clocked in; at 19:00 if you’re still clocked in (not on Fri / Sat, holidays or your days off). Turn it off in 🔔 → ⚙️.',
          'Forgot to clock out yesterday? My HR asks what time you finished and fixes it.',
          'Your key is kept encrypted on CP’s server — nobody can see it. Disconnect any time (⋯ on My HR).',
        ]},
      ],
    },
    {
      id: 'creative-passwords', icon: '🔑', label: 'Studio passwords',
      summary: 'Every studio login — the Access Passwords board on Monday, live.',
      keywords: ['password', 'passwords', 'login', 'logins', 'access', 'account', 'artlist', 'credentials'],
      content: [
        { type: 'guide', title: 'Find and use a login', steps: [
          'Left menu → Studio passwords. Particle / Blurr at the top; search, or pick a section (Creative Studio, Footage, AI Assets, Media, Production).',
          'Copy next to the login copies it. The 👁 shows the password for 20 seconds; Copy next to it copies it without showing it.',
          'The link under the name opens the service.',
        ]},
        { type: 'guide', title: 'Change or add one', steps: [
          'Hover a card → ✏️ to change the login, password, link or renewal day (leave the password empty to keep it).',
          '“+ Add login” adds a new one in the section you pick. It’s saved straight to the Monday board.',
        ]},
        { type: 'tips', items: [
          'Every reveal, copy and change is logged (who and when — never the password itself).',
          'Please don’t paste passwords into Monday updates, chats or briefs — keep them here.',
        ]},
      ],
    },
  ],
};

const GROWTH_CATEGORY = {
  id: 'growth',
  label: 'Growth team',
  color: 'from-teal-400 to-blue-600',
  growthOnly: true,
  sections: [
    {
      id: 'growth-whats-new', icon: '✨', label: 'What’s new / updated',
      summary: `Latest: ${GROWTH_WHATS_NEW[0].date} — what changed in your panel, newest first.`,
      keywords: ['new', 'updated', 'changes', 'release', 'whats new', 'growth'],
      content: GROWTH_WHATS_NEW.map(w => ({ type: 'guide', title: w.date, steps: w.items })),
    },
    {
      id: 'growth-start', icon: '🚀', label: 'Start here',
      summary: 'What you have in CP, and the first thing to do.',
      keywords: ['growth', 'start', 'welcome', 'menu', 'panel', 'access'],
      content: [
        { type: 'guide', title: 'Your menu (left panel — on your phone, the bottom bar + More)', steps: [
          'Creative Studio — the studio right now, the workload, tickets by product week by week, and your own requests.',
          'Briefs Creator — Medium, the AI creative strategist: write briefs, approve them, send them to Monday.',
          'New ticket — ask the studio for Video or Design work in plain words.',
          'Campaign Tracker — every campaign, grouped by type, with its tickets.',
          'On Air — what’s running on TV right now.',
          'Ads Library — AfterLife’s Fresh to test: finished creative that never ran on Meta.',
          'TV Productions — what’s being made, who’s editing it and what’s coming (no budgets).',
          'TV Library — every TV commercial’s final files.',
        ]},
        { type: 'guide', title: 'First thing: connect your Monday', steps: [
          'The first time you sign in, CP asks you to connect your Monday — click “Connect Monday” (or paste your personal token: Monday → your picture → Developers → My access tokens).',
          'After that, every brief and ticket you send is created on Monday as you — your name, your notifications.',
          'Skipped it? Click “Connect Monday” at the top of any page (or More → My Monday on your phone).',
        ]},
        { type: 'tips', items: [
          'You see timelines and stages, never budgets or payments.',
          'The workload is view-only: the studio schedules and moves the work. Click any task to see it.',
        ]},
      ],
    },
    {
      id: 'growth-studio', icon: '🎬', label: 'Creative Studio',
      summary: 'Overview, Workload, By product and My requests.',
      keywords: ['studio', 'overview', 'workload', 'requests', 'my requests', 'tickets', 'status', 'product', 'by product', 'meta', 'week'],
      content: [
        { type: 'guide', title: 'Overview', steps: [
          'The studio right now: how many tasks are Working, Pending, In review, Fixes and Stuck — video and design.',
          'By campaign type and by product: where the studio’s time is going.',
          'Your briefs from the Briefs Creator, with their status.',
        ]},
        { type: 'guide', title: 'Workload', steps: [
          'Who’s on what, day by day — designers and video editors, 1, 2 or 4 weeks.',
          'Click a bar to open the task: status, dates, files, the brief and the updates.',
          'View only — nothing here moves or reschedules work.',
        ]},
        { type: 'guide', title: 'By product', steps: [
          'Every product down the side, four weeks across (‹ › to move a week). Each ticket sits in the week it’s due: the end of its timeline on Monday, else its deadline.',
          'In each week: how many video and design tickets, and a bar of how far along they are — green is Done (ready to go live), purple In review, orange Fixes, blue Working, grey Queued, red Stuck.',
          '“Meta” shows only tickets whose Platform on Monday is Meta; “Not Meta” the rest (Google, TikTok, TV, website… and tickets with no Platform).',
          'Overdue = open tickets due before these weeks. No date = open tickets with no timeline or deadline yet.',
          'Click a number to list those tickets; click a ticket for its brief, files and updates.',
        ]},
        { type: 'guide', title: 'My requests', steps: [
          'Every Video and Design ticket where you are “Requested by” on Monday — open ones first, finished ones from the last 60 days.',
          'Filter Open / Finished, Video / Design, or search. “Late” means past its deadline.',
          'It follows your Monday user — connect your Monday so it’s exactly you.',
        ]},
      ],
    },
    {
      id: 'growth-briefs', icon: '🔮', label: 'Briefs Creator (Medium)',
      summary: 'Write, approve and send briefs — in the team’s style, with your name on them.',
      keywords: ['medium', 'brief', 'briefs', 'approve', 'submit', 'monday', 'hook', 'script', 'holiday', 'higgsfield'],
      content: [
        { type: 'guide', title: 'Write a brief', steps: [
          'Today → “What do you want to make?”, or Create: I have an idea · Build on a winner · Headline → video hook · Plan a holiday · Higgsfield story film.',
          'Medium writes it in the team’s house style from what won; Captain Caption proofreads every on-screen line.',
          'Open the brief to read it, edit it, change its campaign, or ask Medium to improve it.',
        ]},
        { type: 'guide', title: 'Approve and send', steps: [
          'Approve → it becomes a Monday ticket with the brief as its update, in the right campaign.',
          'The brief says “Brief by Medium for you · approved by you”. With your Monday connected, Monday shows you as its creator.',
          'Briefs tab: your briefs only. Medium never writes briefs for you on its own.',
        ]},
        { type: 'tips', items: [
          'Market Watch and Behind the scenes are there to read — what Medium believes, its tests and its sources.',
          'Market Watch → “Built like Particle” shows brands with a business like ours in other categories (Upspring Lookalikes). Their long-running ads are formats to borrow — “Brief from this” opens Create with the ad attached.',
          'If Captain Caption flags a must-fix, fix the line (or ask an admin to override).',
        ]},
      ],
    },
    {
      id: 'growth-ticket', icon: '✨', label: 'New ticket',
      summary: 'Ask the studio for work in plain words.',
      keywords: ['ticket', 'new ticket', 'request', 'design', 'video', 'monday'],
      content: [
        { type: 'guide', title: 'How', steps: [
          'Write what you need like you’d tell the team — paste links, add files or screenshots.',
          'The assistant picks Video or Design, fills the Monday form and asks only what’s missing.',
          'Submit → the ticket is on Monday (as you, when your Monday is connected), with a Dropbox folder for the finished files — and for video a Frame.io folder for the cuts. Both links are on the ticket and in the brief.',
        ]},
      ],
    },
    {
      id: 'growth-campaigns', icon: '📣', label: 'Campaign Tracker',
      summary: 'Every campaign, grouped by type, with its tickets.',
      keywords: ['campaign', 'campaigns', 'group', 'higgsfield', 'holiday', 'launch', 'concept'],
      content: [
        { type: 'guide', title: 'Reading it', steps: [
          'Groups: Higgsfield Cinematic, Images into Videos, Holidays & Sales, Launches & Retail, Faces & Partners, Tests & Other Brands, Concept Families, Evergreen.',
          'Open a campaign to see its tickets, who’s on them and their dates; click a ticket for the details.',
          'Filter by Active / All / Finished, Video / Design, product, or who requested it.',
        ]},
      ],
    },
    {
      id: 'growth-onair', icon: '📡', label: 'On Air',
      summary: 'What’s running on TV right now — the numbers from Particle Brain (hourly), the notes and plan from the agency.',
      keywords: ['on air', 'onair', 'tv', 'live', 'spots', 'agency', 'report', 'mer', 'aov', 'cpo', 'networks', 'prd', 'production', 'brain', 'particle brain', 'sessions', 'new customers', 'promo code', 'markets'],
      content: [
        { type: 'guide', title: 'TV', steps: [
          'Pick Day, Week or Month at the top — everything follows it: yesterday vs the day before, this week vs last week, this month vs last month.',
          'The blue card says what happened in one breath: spend, orders, MER, the strongest and weakest spot, what’s new on air.',
          'Every product on TV (Face Cream, Gravité…): spend, orders, MER, AOV and CPO against the period before, and a chart per day, week or month (Spend / Orders / MER). The month chart shows the last 13 months, so you can compare with the same month last year.',
          'A week or month that’s still running is compared with the same days of the one before — this Mon–Wed vs last Mon–Wed, 1–18 Nov vs 1–18 Oct. The small line under each number also shows the whole previous period.',
          'What TV brought in: site visits from TV, store orders and revenue from TV, new customers (and their share), and how much of the TV revenue used the TV promo code.',
          'On air now (Month: everything that aired this month): each spot’s poster with a verdict — Strong / Fine / Weak against the product’s MER — its share of spend, orders, CPO, and how it moved (since the last report · vs last week · vs last month). NEW = first seen on air recently. Sort by Spend, MER or New.',
          'Each spot carries our name for it in the CP, its production (PRD number + name — click it to open TV Productions) and, underneath, what the agency calls it, its code and when it first aired (date · time · station).',
          'Booked this week: the agency’s plan — what’s booked, in which markets, and which creatives rotate (“Coming up” = booked but not aired yet).',
          'Where it works / When it works / Markets: the stations, times of day and markets for the period, green above the product’s MER and red below.',
          'Play opens the commercial’s file from the TV Library; “Not in the TV Library” means no commercial there has that code yet.',
          'From us to the networks: every new creative the team emailed the agency — Sent → Agency confirmed → On air — with the networks it was sent to.',
          'What the agency says: the daily notes and replies, newest first.',
        ]},
        { type: 'tips', items: [
          'The numbers come from Particle Brain, copied every hour (Brain gets them from the agency’s system). The agency’s email is read every day at 17:00 for its note, the booked plan and the creatives we sent.',
          'If the agency hasn’t reported a day yet, the summary says so and shows what the media pre-log has booked for it.',
        ]},
      ],
    },
    {
      id: 'growth-ads', icon: '📱', label: 'Ads Library',
      summary: 'AfterLife’s Fresh to test, live in CP.',
      keywords: ['ads', 'library', 'afterlife', 'fresh to test', 'download', 'never ran'],
      content: [
        { type: 'guide', title: 'Using it', steps: [
          'Fresh to test = finished creative that never ran on Meta — filter by page, product, size and format, open a quick view, download.',
          '“Open AfterLife” opens it full screen in its own tab.',
          'Downloads are logged in AfterLife under your name.',
        ]},
        { type: 'tips', items: ['If it says “This link expired”, click Reload — it opens a fresh session.'] },
      ],
    },
    {
      id: 'growth-productions', icon: '🎞️', label: 'TV Productions & TV Library',
      summary: 'What’s being made and when · every commercial’s final files.',
      keywords: ['productions', 'tv', 'timeline', 'shoot', 'delivery', 'on air', 'library', 'commercials', 'masters'],
      content: [
        { type: 'guide', title: 'TV Productions', steps: [
          'At the top: In the works, Shooting soon, Delivering and Going on air (next 30 days) — click one to see only those.',
          'Coming up: the next shoots, deliveries, on-air dates, deadlines and schedule steps, in order — click one to jump to its production.',
          'The list is grouped by stage. Each production shows its product, producer, the internal editor / designer (from its Studio tickets), what’s next and where it is (Pre → Shoot → Post → Delivery → On air).',
          'Click a production for its dates, schedule, team and Studio tickets (open any ticket in Monday).',
          'Filter by product, producer, editor / designer or stage, or search. No budgets or payments are shown to the growth team.',
        ]},
        { type: 'guide', title: 'TV Library', steps: [
          'Every TV commercial’s final files — pick a product, narrow by market, length or what’s on air, then click a market to download.',
          'The green “On air” dot follows the agency’s daily report (On Air → TV).',
        ]},
      ],
    },
  ],
};

const CATEGORIES = [
  GROWTH_CATEGORY,
  CREATIVE_CATEGORY,
  {
    id: 'getting-started',
    label: 'Getting Started',
    color: 'from-blue-500 to-indigo-500',
    sections: [
      {
        id: 'overview', icon: '🏠', label: 'Overview & Roles',
        summary: 'What CP Panel is, user roles, and how to navigate.',
        keywords: ['login', 'role', 'admin', 'editor', 'viewer', 'intro', 'start', 'begin'],
        content: [
          { type: 'guide', title: 'What is CP Panel?', steps: [
            'CP Panel is a Creative Production management platform for tracking productions, budgets, timelines, cast, suppliers, scripts, and weekly reports across multiple brands.',
            'All data is stored per-brand — switching brands (top-left in sidebar) shows only that brand\'s data.',
            'Three permission levels: Admin (full access), Editor (create & edit), Viewer (read-only).',
          ]},
          { type: 'guide', title: 'Switching Brands', steps: [
            'Click the brand logo/name in the top of the sidebar.',
            'Select the brand you want — all pages reload for that brand\'s data.',
            'Your role applies across all brands (no per-brand roles).',
          ]},
        ],
      },
      {
        id: 'navigation', icon: '🧭', label: 'Navigation & Shortcuts',
        summary: 'Keyboard shortcuts, sidebar, global search, dark mode.',
        keywords: ['keyboard', 'shortcut', 'search', 'dark mode', 'navigate', 'sidebar', 'ctrl'],
        content: [
          { type: 'shortcuts', items: [
            { key: 'Ctrl/⌘ + K', action: 'Open Global Search' },
            { key: 'N', action: 'New Production (Dashboard, no input focused)' },
            { key: 'D', action: 'Toggle Dark / Light mode' },
            { key: '/', action: 'Open Global Search' },
            { key: 'Esc', action: 'Close any open modal' },
            { key: '← →', action: 'Navigate weeks (Weekly Reports)' },
          ]},
          { type: 'guide', title: 'Sidebar', steps: [
            'Click any item to navigate. Drag items to reorder — save for yourself or for everyone.',
            'Toggle visibility with the eye icon. On mobile, use the bottom tab bar and "More" menu.',
          ]},
          { type: 'guide', title: 'Global Search (Ctrl+K)', steps: [
            'Searches productions, budget items, cast members, and suppliers.',
            'Type any part of a name, ID, or keyword — results appear instantly.',
          ]},
          { type: 'guide', title: 'Currency Toggle', steps: [
            'Click $ or ₪ in the header to switch between USD and ILS.',
            'Exchange rates are automatic based on the production\'s delivery date.',
          ]},
        ],
      },
    ],
  },
  {
    id: 'core',
    label: 'Core Features',
    color: 'from-emerald-500 to-teal-500',
    sections: [
      {
        id: 'dashboard', icon: '📋', label: 'Dashboard & Productions',
        summary: 'Three view modes (Table, Cards, Kanban), filters, search, import, and inline editing.',
        keywords: ['production', 'create', 'filter', 'search', 'import', 'column', 'drag', 'reorder', 'new', 'dashboard', 'table', 'card', 'kanban'],
        content: [
          { type: 'guide', title: 'Creating a Production', steps: [
            'Click "+ New" (top-right) or press N when no input is focused.',
            'Fill in Project Name (required), budget, dates, stage, type, and producer.',
            'IDs are auto-generated (e.g. PRD26-24) and cannot be edited.',
          ]},
          { type: 'guide', title: 'View Modes', steps: [
            'Table (☰) — the classic spreadsheet-style table with sortable columns, inline editing, and drag-to-reorder rows.',
            'Cards (▦) — a responsive grid of production cards showing name, stage, type badges, budget progress bar, and dates. Click any card to open it.',
            'Kanban (▥) — productions grouped by stage in swimlane columns. Scroll horizontally to see all stages. Great for tracking workflow.',
            'Switch between views using the toggle in the top-right toolbar. Your preference is saved.',
          ]},
          { type: 'guide', title: 'Table Editing & Columns', steps: [
            'Click the pencil icon to enter row edit mode. Click ✓ to save or ✕ to cancel.',
            'Click the Columns button to show/hide columns. Drag column headers to reorder.',
            'Use Compact mode for a denser view with smaller rows.',
          ]},
          { type: 'guide', title: 'Filtering', steps: [
            'Search by name, ID, producer, or product type.',
            'Filter by Stage or Product Type dropdowns.',
            'Toggle "Hide Completed" to remove finished productions. Filters persist across sessions.',
          ]},
          { type: 'guide', title: 'Importing', steps: [
            'Click the Upload icon. Drop an .xlsx/.csv file.',
            'Map columns, review preview, then confirm import.',
          ]},
          { type: 'guide', title: 'Multi-View Tabs', steps: [
            'Productions — main content area (table/cards/kanban).',
            'Weekly — status reports with approval workflow and presentation mode.',
            'Analysis — charts, KPIs, and budget breakdowns.',
          ]},
        ],
      },
      {
        id: 'production-detail', icon: '🎬', label: 'Production Detail',
        summary: 'The production hub — tabs for budget, people, accounting, gantt, scripts, and more.',
        keywords: ['production', 'detail', 'tab', 'budget', 'overview', 'crew', 'cast', 'taxi'],
        content: [
          { type: 'guide', title: 'Overview', steps: [
            'Hero card shows stage, name, ID, type, producer, dates, and budget summary.',
            'Click stage or name to edit inline. Budget card shows progress bar (green/orange/red).',
          ]},
          { type: 'guide', title: 'Tabs', steps: [
            'Budget Table, People on Set, Credit Card, Cast, Accounting, Financial, Links, Scripts, Updates, History, Gantt, Call Sheet, Studio (Particle only).',
            'Click the gear icon to rearrange, show/hide, and save tab layout for yourself or everyone.',
          ]},
          { type: 'guide', title: 'Taxi Wizard', steps: [
            'For Shoot-type productions. Click the Taxi icon to coordinate transport logistics across crew and cast.',
          ]},
        ],
      },
      {
        id: 'weekly', icon: '📅', label: 'Weekly Reports',
        summary: 'Weekly status reports with per-production status, comments, and presentation mode.',
        keywords: ['weekly', 'report', 'status', 'presentation', 'approve'],
        content: [
          { type: 'guide', title: 'Reports', steps: [
            'Navigate weeks with ← → arrows. Set status per production: On Track, Pending, At Risk, Blocked, Completed.',
            'Add notes, curate team comments, attach links. Use presentation mode for stakeholder reviews.',
          ]},
        ],
      },
      {
        id: 'analysis', icon: '📊', label: 'Analysis & Charts',
        summary: 'KPI cards, production distribution, budget breakdown, casting risk overview.',
        keywords: ['analysis', 'chart', 'kpi', 'budget', 'breakdown', 'casting'],
        content: [
          { type: 'guide', title: 'Dashboard Analytics', steps: [
            'KPI cards: Productions count, Completion rate, Total budget, Total spend.',
            'Charts: By Production Type (donut), By Stage (bar), By Month (bar), By Product Type (bar), Budget Breakdown (grouped bar), Casting Renewals (risk table).',
            'Switch years with the year selector.',
          ]},
        ],
      },
      {
        id: 'links', icon: '🔗', label: 'Links',
        summary: 'External resource links per production with categories and copy-to-clipboard.',
        keywords: ['link', 'url', 'resource', 'category'],
        content: [
          { type: 'guide', title: 'Links', steps: [
            'Toggle List or Card view. Filter by production, category, or search.',
            'Copy links to clipboard. Edit or delete inline. Links group by category in card view.',
          ]},
        ],
      },
    ],
  },
  {
    id: 'creative',
    label: 'Creative Tools',
    color: 'from-purple-500 to-pink-500',
    hideFor: ['accounting'],
    sections: [
      {
        id: 'scripts', icon: '📜', label: 'Scripts & Storyboards',
        summary: 'Scene-based script editor with three views, AI generation, import, sharing, and comments.',
        keywords: ['script', 'storyboard', 'scene', 'what we see', 'hear', 'draft', 'review', 'approve', 'share', 'import'],
        content: [
          { type: 'guide', title: 'Creating Scripts', steps: [
            'Go to Scripts in the sidebar. Click "New Script". Link to a production or create standalone.',
            'Choose: Blank, AI Generate (from brief), or Import (Google Docs, Slides, DOCX, PDF).',
          ]},
          { type: 'guide', title: 'Scene Editor', steps: [
            'Columns: Location, What We See, What We Hear, Visuals, Duration.',
            'Rich text editing (bold, italic, colors). Drag scenes to reorder. Toggle column visibility.',
          ]},
          { type: 'guide', title: 'Views', steps: [
            'Table — default editing view. VO — audio/voiceover focus with timecodes. Visual — storyboard gallery.',
          ]},
          { type: 'guide', title: 'Status & Sharing', steps: [
            'Draft → Review → Approved → Archived. Approval exports to Google Drive.',
            'Share with View/Comment/Edit permissions. Links work without login.',
          ]},
          { type: 'guide', title: 'Comments & Versions', steps: [
            'Select text to attach comments. Version History tracks all changes.',
          ]},
          { type: 'guide', title: 'AI Generation', steps: [
            'Provide product name, tone, duration, scene count, and description.',
            'Add up to 3 reference URLs or files. Preview before accepting.',
          ]},
        ],
      },
      {
        id: 'ai-images', icon: '🎨', label: 'AI Image Generation',
        summary: 'Storyboard images with character IDENTITY LOCK, product consistency, and style references.',
        keywords: ['ai', 'image', 'generate', 'character', 'product', 'reference', 'wizard', 'split', 'block'],
        content: [
          { type: 'guide', title: 'Image Wizard', steps: [
            'Click AI on a scene or "Generate All". 4-step wizard: Characters → Product → Style → Generate.',
            'Upload actor photos for 1:1 visual reference (sent directly to AI, not just described).',
            'Upload product photos (up to 3) for exact replication. Add reference images (up to 5) for mood/style.',
          ]},
          { type: 'guide', title: 'Split', steps: [
            'Click Split to break a scene into shots. Add break points manually or use AI suggestions.',
            'Edit each shot\'s text, then apply. Optionally generate images per shot.',
          ]},
          { type: 'guide', title: 'Universal Blocks', steps: [
            'Reusable scene templates (CTA, Intro, Disclaimer). Click Blocks in toolbar.',
            'Insert blocks with one click. Create new blocks from selected scenes with free-text categories.',
          ]},
          { type: 'guide', title: 'Regeneration', steps: [
            'Click an image to regenerate: Same prompt, Edit prompt, or Reference image.',
            'Use Image Setup (toolbar) to re-edit characters/product/style anytime.',
          ]},
        ],
      },
      {
        id: 'voiceover', icon: '🎙️', label: 'Voice Over (VO)',
        summary: 'ElevenLabs synthesis, mute non-spoken text, commercial timing with per-scene segments.',
        keywords: ['voice', 'vo', 'tts', 'elevenlabs', 'mute', 'timer', 'duration', 'play'],
        content: [
          { type: 'guide', title: 'Playback', steps: [
            'Click Play next to any scene\'s What We Hear. Switch to VO view for a dedicated experience.',
            'Download Full VO as MP3. Voice Picker shows all ElevenLabs voices with speed/stability controls.',
          ]},
          { type: 'guide', title: 'Muting Text', steps: [
            'Select non-spoken text (like "NEW AI VO:"). Click 🔇 Mute in the format toolbar.',
            'Muted text appears gray with strikethrough. Excluded from TTS and duration calculations.',
          ]},
          { type: 'guide', title: 'Timing Bar', steps: [
            'Segmented by scene with hover tooltips. Color-coded: green (on target), amber (over), red (too long).',
            'Set target: 15s, 30s, 60s presets or type a custom value. Speed adjustments affect all timings.',
          ]},
          { type: 'tips', items: [
            '[Brackets] and (parentheses) are automatically stripped from VO playback.',
            'Use Mute for any text visible in the script but not spoken.',
            'VO view shows word count, per-scene duration, and cumulative timecodes.',
          ]},
        ],
      },
      {
        id: 'gantt', icon: '📊', label: 'Gantt / Timelines',
        summary: 'Timeline views per production and across all productions.',
        keywords: ['gantt', 'timeline', 'schedule', 'task', 'sync'],
        content: [
          { type: 'guide', title: 'Gantt', steps: [
            'Each production has a Gantt tab. Global Gantts page shows all together.',
            'Create/edit tasks on the timeline. Sync-to-dates updates production dates from milestones.',
          ]},
        ],
      },
      {
        id: 'callsheets', icon: '📋', label: 'Call Sheets',
        summary: 'Shoot-day logistics — crew times, locations, recipients.',
        keywords: ['call sheet', 'shoot', 'crew', 'time', 'print'],
        content: [
          { type: 'guide', title: 'Call Sheets', steps: [
            'Open a Shoot production → Call Sheet tab. Fill in details and generate.',
            'Recipients: All, Crew Only, Cast Only, Stakeholders, Custom.',
            'Global Call Sheets page lists all across productions. Print with Ctrl/⌘+P.',
          ]},
        ],
      },
      {
        id: 'casting', icon: '⭐', label: 'Casting & Rights',
        summary: 'Contract tracking, usage rights, risk badges, daily automation checks.',
        keywords: ['cast', 'rights', 'contract', 'expiry', 'actor', 'model', 'overdue', 'automation'],
        content: [
          { type: 'guide', title: 'Cast Management', steps: [
            'Add cast with: photo, name, role, contract period, usage rights (Any Use/Digital/TV/Stills/OOH), contract file.',
            'Three views: By Status, By Expiry Date (red/orange highlighting), By Rights Type.',
          ]},
          { type: 'guide', title: 'Automations', steps: [
            'Daily check at 8:00 AM detects overdue (red), close to overdue (orange), and newly started (blue).',
            'Manual trigger with "Run Automations". Sidebar badge shows at-risk count.',
          ]},
        ],
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance & Admin',
    color: 'from-amber-500 to-orange-500',
    sections: [
      {
        id: 'financial', icon: '💰', label: 'Financial Overview',
        summary: 'Annual budgets, KPIs, production-level ledger, category breakdowns.',
        keywords: ['financial', 'budget', 'kpi', 'spend', 'variance', 'annual'],
        content: [
          { type: 'guide', title: 'Financial', steps: [
            'KPI cards: Total Budget, Spend, Variance, Unallocated. Set Yearly Budget inline.',
            'Views: Overview (KPIs), Category breakdown, Production Ledger (expandable per production).',
          ]},
        ],
      },
      {
        id: 'accounting', icon: '📒', label: 'Accounting',
        summary: 'Payment tracking with payer workflow, receipt management, and export.',
        keywords: ['accounting', 'payment', 'paid', 'pending', 'receipt', 'payer', 'export'],
        content: [
          { type: 'guide', title: 'Payments', steps: [
            'Status: Not Paid → Pending → Paid. Open confirmation modal to set payer, date, amount.',
            'Two views: By Production (grouped) and Full Table (flat). Filter by status, production, search.',
            'Edit receipt/invoice/proof URLs inline. Export to CSV.',
          ]},
        ],
      },
      {
        id: 'invoices', icon: '🧾', label: 'Invoices',
        summary: 'Invoice lifecycle with 48-hour rule and print/PDF support.',
        keywords: ['invoice', 'receipt', '48 hour', 'print', 'status'],
        content: [
          { type: 'guide', title: 'Invoices', steps: [
            'Status: Pending → Sent → Received → Paid. Grouped by production.',
            'Invoice type (Israeli/American/Other), auto due date, notes. Print with Ctrl/⌘+P.',
            'Receipts tab for managing receipt links.',
          ]},
          { type: 'tips', items: ['48-hour rule enforced — process invoices within 48h of payment.'] },
        ],
      },
      {
        id: 'contracts', icon: '📝', label: 'Contracts',
        summary: 'Contract tracking with status badges and Google Drive integration.',
        keywords: ['contract', 'sign', 'approve', 'drive'],
        content: [
          { type: 'guide', title: 'Contracts', steps: [
            'Filter by status: In Progress, Approved, Signed, Rejected.',
            'Click row to edit details. Delete with optional Google Drive file removal.',
          ]},
        ],
      },
      {
        id: 'suppliers', icon: '🏢', label: 'Suppliers',
        summary: 'Vendor management with banking, type badges, production linking, and CSV import.',
        keywords: ['supplier', 'vendor', 'banking', 'dealer', 'import', 'type'],
        content: [
          { type: 'guide', title: 'Suppliers', steps: [
            'Add suppliers with 3-tab modal: Info, Banking, Productions.',
            'Types: color-coded badges. Dealer types: Osek Patur, Osek Murshe, Ltd, Foreign.',
            'Import from CSV/Excel. Toggle between List and Dashboard (analytics) views.',
          ]},
        ],
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    color: 'from-red-500 to-rose-500',
    adminOnly: true,
    sections: [
      {
        id: 'users', icon: '👥', label: 'Users & Groups',
        summary: 'Invite users, assign roles, manage groups and page-level access.',
        keywords: ['user', 'invite', 'role', 'group', 'permission', 'password'],
        content: [
          { type: 'guide', title: 'Users', steps: [
            'Create User → name, email, role. Temporary password generated (copy & share).',
            'Toggle brand access per user. Reset passwords, deactivate, delete, or restore.',
          ]},
          { type: 'guide', title: 'Groups', steps: [
            'Create groups with role and members. Set page-level access per group.',
          ]},
        ],
      },
      {
        id: 'settings', icon: '⚙️', label: 'Settings',
        summary: 'List customization, integrations, branding, improvement tickets.',
        keywords: ['settings', 'stage', 'type', 'list', 'integration', 'drive', 'monday', 'branding', 'ticket'],
        content: [
          { type: 'guide', title: 'Lists', steps: [
            'Customize: Stages, Statuses, Product Types, Crew Positions, Dealer Types, Payment Methods, Invoice Types.',
            'Add, edit, delete, reorder. Some support color assignment. Reset to defaults.',
          ]},
          { type: 'guide', title: 'Integrations', steps: [
            'Google Drive: Connect, backup config, manual sync.',
            'Monday.com: Board/Workspace/Group IDs for Studio Tickets.',
          ]},
          { type: 'guide', title: 'Branding', steps: [
            'Set colors (primary, secondary, accent), upload logo, choose font.',
          ]},
          { type: 'guide', title: 'Tickets', steps: [
            'Submit bugs/feature requests with priority and category. Track status.',
          ]},
        ],
      },
      {
        id: 'history', icon: '📜', label: 'History & Audit',
        summary: 'Full change log with filters by field, user, date. Restore old values.',
        keywords: ['history', 'audit', 'change', 'restore', 'undo', 'log'],
        content: [
          { type: 'guide', title: 'History', steps: [
            'Shows every change: time, production, field, old → new value, who.',
            'Filter by text, field, user, production, date range.',
            'Click Restore on any entry to revert. Confirmation shows current vs. restored value.',
          ]},
        ],
      },
      {
        id: 'team-activity', icon: '👥', label: 'Team activity — every move',
        summary: 'Live: what everyone did in CP, who’s online now, and a quiet notification for each move.',
        keywords: ['activity', 'team', 'audit', 'online', 'moves', 'who did what', 'log'],
        content: [
          { type: 'guide', title: 'Team activity (Admin menu → Activity)', steps: [
            'Everyone but the super admin is logged: sign-ins, every page opened, task moves (“Moved a task to Review”), updates, delivery links, tickets, briefs, clock in / out and time off, password reveals / copies / edits, and any other change (“Changed something in Contracts”).',
            '“Online now” — who used CP in the last 5 minutes. The page refreshes itself every 20 seconds.',
            'Filter: Everything · Moves only · Tasks · Clock & time off · Passwords · Pages. Click a person to see only them.',
          ]},
          { type: 'tips', items: [
            'Each move also lands in your 🔔 under “Team moves” (quietly — no pop-up). Turn it off in 🔔 → ⚙️ → “Every move of the team”.',
            'Opening the same page twice within 10 minutes counts once.',
          ]},
        ],
      },
      {
        id: 'my-employees', icon: '👥', label: 'My HR → My employees',
        summary: 'The month so far for everyone: hours vs. expected with %, vacation left, days off, approvals — and each person’s days read for you, with their tickets.',
        keywords: ['employees', 'team', 'hours', 'timesheet', 'vacation', 'sick', 'approve', 'percent', 'month', 'payroll', 'csv'],
        content: [
          { type: 'guide', title: 'My HR → My employees (admins)', steps: [
            'Pick a month (◀ ▶). Top: the team’s %, hours clocked vs. expected, days off, missing days, forgotten clock-outs.',
            '“Who did more, who did less”: each person’s hours on finished days against what’s expected (workdays that aren’t off × 9h) — the bar, the %, the line for “expected so far”, a small calendar of the month (darker = more hours; teal = vacation, red = sick), hours left to the month’s target, vacation left, and badges for missing days / no clock-out. Sort by %, hours, days off or vacation left.',
            'Click someone → their days read for you: “Full day: 8h 30m (09:10–17:40). Worked on Face Cream | Hook test (5h)… Moved X → Review at 15:20.” with the tickets behind each day and the tickets of the whole period ranked by hours (Working while clocked in). Last 2 weeks / this month / last month.',
            'Waiting for you: approve or deny time off — each request shows how much vacation they have left and who else is out then.',
            'CSV for the month — hours, %, days, vacation left for everyone (payroll-ready).',
          ]},
          { type: 'tips', items: [
            '“Not in Working on any task” on a day means the clock and the board don’t match — reviews, fixes, meetings, or a status nobody moved.',
            'The team’s days off also show for everyone in My Studio (who’s out today and coming up, and on the Week view).',
          ]},
        ],
      },
      {
        id: 'team-hr', icon: '⏱', label: 'Team HR (BambooHR)',
        summary: 'Who’s in, hours, time-off requests and who’s out — the whole team, live from BambooHR.',
        keywords: ['hr', 'bamboo', 'bamboohr', 'clock', 'timesheet', 'vacation', 'time off', 'approve', 'who is out'],
        content: [
          { type: 'guide', title: 'Admin menu → Team HR', steps: [
            'Waiting for you — time-off requests: Approve / Deny (with an optional note). The person gets a CP notification.',
            'Today — In now · Not in yet · Done for today · Off today, with times.',
            'Timesheet — hours per person per day (Sun–Thu), totals against 9h a day; ◀ ▶ for other weeks. Amber = under, missing days stand out.',
            'Who’s out — the next 30 days, holidays included. Connected to CP — who connected My HR and Monday, with a message you can send them.',
          ]},
          { type: 'tips', items: [
            'It uses the company BambooHR connection (Studio → Connections), so approvals show in BambooHR as that key’s owner.',
            'Everyone else uses My HR with their own key: clock in / out, time off, reminders at 10:00 and 19:00.',
          ]},
        ],
      },
      {
        id: 'time-tracking', icon: '⏳', label: 'Time tracking — request to delivery',
        summary: 'How long tasks really take: status by status, and the hours actually worked (Working while clocked in).',
        keywords: ['time', 'tracking', 'hours', 'lead time', 'worked', 'utilization', 'review rounds', 'productivity'],
        content: [
          { type: 'guide', title: 'Left menu → Time tracking', steps: [
            'Pick a range (this week … last 90 days, or custom), Video / Design, and filter by person, product, type, requester or campaign — the link keeps the filters, so you can share a view.',
            'Key numbers: tasks delivered, median lead time (request → approved), median worked hours, review rounds, on time %, utilization (time with a task in Working while clocked in ÷ time clocked in).',
            'Where the time goes — waiting, working, review, fixes, stuck, paused. People, types and products — sortable. “Took much longer than usual” — over twice the usual worked time for its type.',
            'Each task has a status strip (hover for each step); Download CSV for everything.',
          ]},
          { type: 'tips', items: [
            '“Worked” = time in Working while the person on the task was clocked in on BambooHR. Without clock data it’s estimated from working hours (Sun–Thu 09:00–19:00) and marked ≈.',
            'The first load of a long range can take a while (it reads every status change) — after that it’s cached for 25 minutes; Refresh re-reads.',
            'Every task panel shows its own “Time on this task”. The Studio’s Time tab is the quick view; this is the detailed one.',
          ]},
        ],
      },
      {
        id: 'passwords', icon: '🔑', label: 'Studio passwords',
        summary: 'The Access Passwords boards (Particle + Blurr) in CP — the creative team, the studio, producers and admins.',
        keywords: ['password', 'passwords', 'login', 'access', 'credentials', 'subscriptions'],
        content: [
          { type: 'guide', title: 'How it works', steps: [
            'Left menu → Studio passwords. It reads and writes the Monday boards live — nothing is copied into CP.',
            'Passwords stay hidden until someone presses 👁 (20 seconds) or Copy. Every reveal, copy, edit and add is logged — “Who opened what” (admins) shows it.',
            'Producers and admins also see $/month and credits, and the monthly total; the creative team doesn’t see money.',
          ]},
        ],
      },
      {
        id: 'studio', icon: '🎬', label: 'Studio Tickets',
        summary: 'Monday.com integration for video/design project tracking.',
        keywords: ['studio', 'monday', 'ticket', 'video', 'design', 'brief', 'connect monday', 'schedule', 'workload', 'comment', 'as you'],
        particleOnly: true,
        content: [
          { type: 'guide', title: 'Studio', steps: [
            'Syncs with Monday.com Video and Design boards. Filter by type (All/Video/Design/TV), requester, production.',
            'Generate AI Brief from item data. Copy brief. Sync to Gantt. View updates. Open in Monday.',
            'Completed/Archived groups auto-collapse.',
            'Task panel → Brief & updates: type @ (or the @ button) to tag someone — they get a real Monday mention. Links inside updates (e.g. “Uploaded on Dropbox folder”) are blue and open in a new tab.',
            'Connect your Monday (the chip at the top of the Studio): then what you schedule, reassign, move, archive and comment here shows on Monday as you — your name in its activity, your comments without the “via CP Studio” line. Not connected, CP’s account does it and signs comments with your name.',
          ]},
          { type: 'tips', items: ['Available for the Particle brand only.', 'Green chip = connected (“Monday: Omer”). If Monday stops accepting your connection, CP’s account does the change and the message says so — reconnect from the chip.'] },
        ],
      },
      {
        id: 'on-air', icon: '📡', label: 'On Air (TV + Meta)',
        summary: 'What’s running right now — TV from Particle Brain (hourly) and the agency’s daily report (read from Gmail at 17:00), Meta from AfterLife.',
        keywords: ['on air', 'onair', 'tv', 'meta', 'live', 'spots', 'agency', 'lbd2c', 'report', 'mer', 'roas', 'ctr', 'aov', 'thumbstop', 'networks', 'gmail', 'brain', 'particle brain', 'sessions', 'store', 'promo code'],
        particleOnly: true,
        content: [
          { type: 'guide', title: 'TV — Particle Brain', steps: [
            'Particle Brain keeps a copy of the agency’s TV data (spend, orders, revenue per product per day, split by station, creative, time of day and market; TV-attributed site visits and store orders) from January 2024 on. CP copies it every hour at :25, the last 45 days every night, and the whole history once.',
            'When Brain has a product, its numbers drive the page: Day / Week / Month totals, the charts (13 months back), every spot’s numbers and first airing, Where it works / When it works / Markets, and the What TV brought in strip. A running week or month is compared with the same days of the one before.',
            'CP reads Brain through AfterLife (AfterLife holds the Brain key; CP never stores it). If Brain doesn’t answer, editors see a short notice and the page keeps the last good copy.',
            '“Read now” reads Brain and the mailbox at once.',
          ]},
          { type: 'guide', title: 'TV — the agency’s daily report', steps: [
            'Every day at 17:00 (catch-ups at 18:30 and 21:00 if a report is missing) CP reads the agency’s emails: the daily “Particle … Campaign” reports, their replies, and the new creatives the team emails them.',
            'Per product: this week’s spend, orders, MER, AOV and CPO with yesterday’s numbers, spend and MER per day, and the last weeks.',
            'On air now: every spot by its creative code — spend, share of the week, orders, MER, CPO, AOV, stations, what moved since the previous report, and NEW for spots first seen in the last 7 days.',
            'Each code is matched to the TV Library commercial with the same code: our name for it in the CP, its production (PRD number + name, click to open it), its poster and play button — with the agency’s own name and code underneath. The Library’s green “On air” dot follows the report.',
            'From us to the networks: creatives emailed to the agency → the agency confirmed (and to which networks) → first seen on air.',
            'The agency’s Excel files (with most daily reports): the RBD sheet — every aired spot since January — gives each creative’s real numbers per day / week / month, when and where it first aired, and the stations and times of day that work; the Future sheet gives what’s booked this week and which creatives rotate (“Coming up” = booked, not aired yet). CP keeps the newest of each per product.',
            'Replies in a report’s thread are read as replies, never as the day’s report.',
            'Editors and admins can press “Read now” to read the mailbox immediately.',
          ]},
          { type: 'guide', title: 'Day / Week / Month', steps: [
            'One switch at the top for both tabs. TV: yesterday vs the day before, this week vs last week, this month vs last month (months group the agency’s weeks by the week they start). Meta: the newest day, the last 7 days and the last 4 weeks, each against the period before.',
            'Each tab opens with a short written summary of what happened; charts toggle between Spend / Orders / MER (TV) or Spend / ROAS (Meta). Striped bars = a period still running.',
          ]},
          { type: 'guide', title: 'Meta — from AfterLife', steps: [
            'Spend and ROAS for the period, ads live now (video · static) and ads that started, with a chart per day, week or month.',
            'What’s working / Needs a look: the live ads furthest above and below our usual, with the reason in one line.',
            'Click any ad to open it: the real video plays (or the static shows), its ad copy, its numbers for Day / Week / Month, what makes it different, and where it sits against our videos or statics on every measure. “AfterLife view” shows its AfterLife page right inside CP; “AfterLife” and “Ads Manager” open them in a new tab.',
            'Our averages this year — Video team, Design team and Externals side by side: ROAS, CTR, thumb-stop, hold, average watch, watched-half, AOV, CPA, CPM.',
            'Video ads | Static ads: the list is split by format, each with our internal average for that format on top.',
            'Every live creative: maker and team, product, campaign, start day, 7-day spend with daily bars, this week’s ROAS and CTR against last week, and its numbers since it started against our average (+38% / −20%).',
            'Insights: what makes it different from what we usually make — top / bottom 10% of our videos or statics on a metric, “stops the scroll then loses them” (high thumb-stop, low hold), “gets the click, not the sale” (high CTR, low ROAS), “few clicks but they buy”, bigger baskets. Under $150 or 5,000 impressions it says it’s too early.',
            'Sort by “Stands out most” to see the creatives furthest from our average first.',
          ]},
          { type: 'tips', items: [
            'Setup (once, admin): Settings → reconnect Google — it adds read-only Gmail access. Nothing is sent, labelled or changed in the mailbox.',
            'Comparisons use the internal team only (video editors + designers) — video with video, static with static. Externals (Grapevine, outside creators) are shown for reference. Thumb-stop and hook rate are the same measure here: 3-second views ÷ impressions.',
            'The growth team sees the TV side only.',
          ]},
        ],
      },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    color: 'from-gray-500 to-gray-600',
    sections: [
      {
        id: 'faq', icon: '❓', label: 'FAQ',
        summary: 'Frequently asked questions.',
        keywords: ['faq', 'question', 'help', 'how', 'why', 'problem'],
        content: [
          { type: 'faq', items: [
            { q: 'How do I reset my password?', a: 'Click "Forgot password?" on the login screen.' },
            { q: 'Can I export to Excel?', a: 'Financial and Accounting pages have export. Full Dashboard export is planned.' },
            { q: 'Can two people edit simultaneously?', a: 'No real-time sync — last save wins. Communicate with your team.' },
            { q: 'How do I archive a production?', a: 'Set stage to "Completed". Use "Hide Completed" to clean the view.' },
            { q: 'How do I undo a change?', a: 'Use the History page — find the change and click Restore.' },
            { q: 'Why can\'t I see some pages?', a: 'Some are Admin-only or brand-specific. Ask your admin.' },
            { q: 'How do I mark text as non-spoken?', a: 'Select text in What We Hear → click 🔇 Mute in the format toolbar.' },
            { q: 'How do AI images use my actor photos?', a: 'Photos are sent directly to the AI with IDENTITY LOCK precision — not just described.' },
            { q: 'What are Universal Blocks?', a: 'Reusable scene templates you can save and insert into any script with one click.' },
            { q: 'What\'s the difference between Cards and Kanban?', a: 'Cards show a grid of production cards. Kanban groups them by stage in columns.' },
          ]},
        ],
      },
      {
        id: 'changelog', icon: '📦', label: 'Changelog',
        summary: 'Version history.',
        keywords: ['changelog', 'version', 'update', 'release', 'new', 'fix'],
        content: [
          { type: 'guide', title: 'v2.1 — April 2026', steps: [
            '🎬 Video-to-Script Matching — upload MP4, YouTube URL, or Google Drive link. AI matches video frames to script scenes by audio + visual content.',
            '📋 Clipboard Paste — Ctrl+V images directly into storyboard visuals.',
            '📄 PDF Export — print-optimized script output from More menu.',
            '🔊 Voice Picker — search by name, filter by gender (male/female), stability explanation.',
            '🔊 Share Page VO — Play per-scene and Play All now work on public share links.',
            '🔒 Production Lock — lock completed productions, only admins can edit.',
            '🗑️ Delete Production — cascade cleanup with confirmation modal.',
            '🏷️ Biomella Brand — red theme, Epilogue font, full CSS variables.',
            '🖼️ Logo Upload — upload to Google Drive, auto-save, shows in sidebar.',
            '🎨 Sidebar Color — customizable via Settings brand colors.',
            '💾 Dropbox Backup Fix — missing API keys added, 3x retry.',
            '🔐 Security — requireEditor on all routes, DOMPurify XSS, password 8+ chars.',
          ]},
          { type: 'guide', title: 'v2.1 — April 2026', steps: [
            '📜 Scripts & Storyboards — scene editor, 3 views, AI generation, import, sharing, comments, versions.',
            '🎨 AI Image Generation — IDENTITY LOCK, product consistency, storyboard continuity, reference images.',
            '🎙️ Voice Over — ElevenLabs, mute non-spoken text, segmented timing bar.',
            '✂️ Split Modal — by sentence + AI suggest, save as Universal Block.',
            '📦 Universal Blocks — reusable scene templates with categories.',
            '💬 AI Chat — Claude conversation panel for script refinement.',
            '▦ Cards + ▥ Kanban — new Dashboard views.',
            '📖 Manual v2.1 — card-based help center with role-aware visibility.',
          ]},
          { type: 'guide', title: 'v1.9 — March 2026', steps: [
            '🌙 Dark mode. 🔍 Global Search. 📖 Manual (first version). 📱 Mobile "More" menu. 💾 Filter persistence. 🔐 Security hardening. ⌨️ Shortcuts.',
          ]},
          { type: 'guide', title: 'v1.8 — February 2026', steps: [
            '📅 Weekly Reports. ⭐ Casting & Rights. 📊 Supplier Dashboard. 🗂️ Column management. 💱 Currency toggle.',
          ]},
          { type: 'guide', title: 'v1.7 and earlier', steps: [
            'Gantt, Call Sheets, Links, Suppliers, Contracts, Financial, Accounting, Invoices, Import, Core production management, Users, Settings, Multi-brand theming, Mobile layout.',
          ]},
        ],
      },
    ],
  },
];

// ─── UI Components ────────────────────────────────────────────────────────────

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" onClick={() => setOpen(o => !o)}>
        <span>{q}</span>
        {open ? <ChevronDown size={14} className="shrink-0 text-gray-400" /> : <ChevronRight size={14} className="shrink-0 text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-3 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 leading-relaxed">{a}</div>}
    </div>
  );
}

function SectionContent({ section }) {
  return (
    <div className="space-y-4">
      {section.content.map((block, bi) => (
        <div key={bi}>
          {block.type === 'guide' && (
            <div className="bg-white dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 rounded-xl p-5">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3">{block.title}</h3>
              <ol className="space-y-2">
                {block.steps.map((step, si) => (
                  <li key={si} className="flex gap-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] font-bold flex items-center justify-center mt-0.5">{si + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {block.type === 'tips' && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-2">💡 Tips</h3>
              <ul className="space-y-1.5">
                {block.items.map((tip, ti) => (
                  <li key={ti} className="flex gap-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    <span className="text-amber-500 shrink-0 mt-0.5">•</span><span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {block.type === 'shortcuts' && (
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30 rounded-xl p-4">
              <h3 className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-3">⚡ Keyboard Shortcuts</h3>
              <div className="space-y-2">
                {block.items.map((item, ki) => (
                  <div key={ki} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{item.action}</span>
                    <kbd className="shrink-0 px-2 py-0.5 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-mono text-xs border border-gray-200 dark:border-gray-600 shadow-sm">{item.key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          )}
          {block.type === 'faq' && (
            <div className="space-y-2">
              {block.items.map((item, qi) => <FaqItem key={qi} q={item.q} a={item.a} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Manual Page ─────────────────────────────────────────────────────────
export default function Manual() {
  const { user } = useAuth();
  const { brand } = useBrand();
  const [query, setQuery] = useState('');
  const [expandedSection, setExpandedSection] = useState(null);

  const role = String(user?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const isParticle = brand?.id === 'particle' || brand?.name?.toLowerCase().includes('particle');
  const isAccounting = role === 'accounting';
  const isGrowth = role === 'growth';
  const isCreativeTeam = role === 'creative';

  const visibleCategories = useMemo(() => {
    return CATEGORIES
      .filter(cat => {
        // Growth team: their own section only; admins see it too (to know what the team reads)
        if (isGrowth) return !!cat.growthOnly;
        if (isCreativeTeam) return !!cat.creativeOnly;   // the Creative team: their own section (25 Nov 2026)
        if (cat.creativeOnly && !isAdmin) return false;
        if (cat.growthOnly && !isAdmin) return false;
        if (cat.adminOnly && !isAdmin) return false;
        if (cat.hideFor?.includes('accounting') && isAccounting) return false;
        return true;
      })
      .map(cat => ({
        ...cat,
        sections: cat.sections.filter(sec => !sec.particleOnly || isParticle),
      }))
      .filter(cat => cat.sections.length > 0);
  }, [isAdmin, isParticle, isAccounting, isGrowth]);

  const filteredCategories = useMemo(() => {
    if (!query.trim()) return visibleCategories;
    const q = query.toLowerCase();
    return visibleCategories
      .map(cat => ({
        ...cat,
        sections: cat.sections.filter(sec =>
          sec.label.toLowerCase().includes(q) ||
          sec.summary.toLowerCase().includes(q) ||
          sec.keywords.some(k => k.includes(q)) ||
          sec.content.some(c =>
            c.title?.toLowerCase().includes(q) ||
            c.steps?.some(s => s.toLowerCase().includes(q)) ||
            c.items?.some(item => ((item.q || item.action || item.key || item) + '').toLowerCase().includes(q))
          )
        ),
      }))
      .filter(cat => cat.sections.length > 0);
  }, [query, visibleCategories]);

  const totalSections = visibleCategories.reduce((sum, c) => sum + c.sections.length, 0);

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2.5">
          <BookOpen size={20} style={{ color: 'var(--brand-primary)' }} />
          <h1 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>CP Panel Manual</h1>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500">v2.1</span>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search docs..." value={query}
            onChange={e => { setQuery(e.target.value); setExpandedSection(null); }}
            className="brand-input pl-9 pr-8 py-1.5 text-sm w-full" style={{ paddingLeft: 34 }} />
          {query && <button onClick={() => { setQuery(''); setExpandedSection(null); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 space-y-8">
          {!query && !expandedSection && (
            <div className="text-center py-2">
              <p className="text-sm text-gray-400 dark:text-gray-500">{totalSections} topics across {filteredCategories.length} categories</p>
            </div>
          )}

          {expandedSection && (() => {
            const sec = visibleCategories.flatMap(c => c.sections).find(s => s.id === expandedSection);
            if (!sec) return null;
            return (
              <div>
                <button onClick={() => setExpandedSection(null)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 mb-4">← Back to all topics</button>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{sec.icon}</span>
                  <h2 className="text-xl font-black text-gray-900 dark:text-gray-100">{sec.label}</h2>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{sec.summary}</p>
                <SectionContent section={sec} />
              </div>
            );
          })()}

          {!expandedSection && filteredCategories.map(cat => (
            <div key={cat.id}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-1 h-5 rounded-full bg-gradient-to-b ${cat.color}`} />
                <h2 className="text-sm font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">{cat.label}</h2>
                {cat.adminOnly && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">Admin Only</span>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cat.sections.map(sec => (
                  <button key={sec.id} onClick={() => setExpandedSection(sec.id)}
                    className="group text-left bg-white dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 rounded-xl p-4 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all">
                    <div className="flex items-start gap-3">
                      <span className="text-xl leading-none mt-0.5">{sec.icon}</span>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{sec.label}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">{sec.summary}</p>
                        {sec.particleOnly && <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 mt-2">Particle Only</span>}
                      </div>
                      <ChevronRight size={14} className="shrink-0 text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {!expandedSection && filteredCategories.length === 0 && (
            <div className="text-center py-16">
              <Search size={32} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-400">No topics match "{query}"</p>
              <button onClick={() => setQuery('')} className="text-xs text-indigo-500 hover:text-indigo-600 mt-2">Clear search</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
