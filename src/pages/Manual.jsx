import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, BookOpen, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';
import clsx from 'clsx';

// ─── Manual Content Data ──────────────────────────────────────────────────────

// ─── Growth team (17 Nov 2026) ─────────────────────────────────────────────────
// RULE (Tomer): every change to the growth team's panel updates this section AND adds a dated line to "What's new".
const GROWTH_WHATS_NEW = [
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
          'Creative Studio — the studio right now, the workload, and your own requests.',
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
      summary: 'Overview, Workload and My requests.',
      keywords: ['studio', 'overview', 'workload', 'requests', 'my requests', 'tickets', 'status'],
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
          'Submit → the ticket is on Monday (as you, when your Monday is connected), with a Dropbox folder for the finished files.',
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
      summary: 'What’s running on TV right now — from the agency’s daily report.',
      keywords: ['on air', 'onair', 'tv', 'live', 'spots', 'agency', 'report', 'mer', 'aov', 'cpo', 'networks', 'prd', 'production'],
      content: [
        { type: 'guide', title: 'TV', steps: [
          'Every product the agency runs (Face Cream, Gravité…): this week’s spend, orders, MER, AOV and CPO, with yesterday next to each.',
          'Spend per day, MER per day and the last weeks — so you see the movement, not just a number.',
          'On air now: every spot that aired this week, biggest spend first — its share of the week, orders, MER (green above the week’s average, red below), CPO, AOV, the stations, and what moved since the last report. NEW = first seen on air in the last 7 days.',
          'Each spot carries our name for it in the CP, its production (PRD number + name — click it to open TV Productions) and, underneath, what the agency calls it and its code.',
          'Play opens the commercial’s file from the TV Library; “Not in the TV Library” means no commercial there has that code yet.',
          'From us to the networks: every new creative the team emailed the agency — Sent → Agency confirmed → On air — with the networks it was sent to.',
          'What the agency says: the daily notes and replies, newest first.',
        ]},
        { type: 'tips', items: [
          'The TV report is read every day at 17:00 (the agency emails around 16:00–16:45).',
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
        id: 'studio', icon: '🎬', label: 'Studio Tickets',
        summary: 'Monday.com integration for video/design project tracking.',
        keywords: ['studio', 'monday', 'ticket', 'video', 'design', 'brief'],
        particleOnly: true,
        content: [
          { type: 'guide', title: 'Studio', steps: [
            'Syncs with Monday.com Video and Design boards. Filter by type (All/Video/Design/TV), requester, production.',
            'Generate AI Brief from item data. Copy brief. Sync to Gantt. View updates. Open in Monday.',
            'Completed/Archived groups auto-collapse.',
          ]},
          { type: 'tips', items: ['Available for the Particle brand only.'] },
        ],
      },
      {
        id: 'on-air', icon: '📡', label: 'On Air (TV + Meta)',
        summary: 'What’s running right now — TV from the agency’s daily report (read from Gmail at 17:00), Meta from AfterLife.',
        keywords: ['on air', 'onair', 'tv', 'meta', 'live', 'spots', 'agency', 'lbd2c', 'report', 'mer', 'roas', 'ctr', 'aov', 'thumbstop', 'networks', 'gmail'],
        particleOnly: true,
        content: [
          { type: 'guide', title: 'TV — the agency’s daily report', steps: [
            'Every day at 17:00 (catch-ups at 18:30 and 21:00 if a report is missing) CP reads the agency’s emails: the daily “Particle … Campaign” reports, their replies, and the new creatives the team emails them.',
            'Per product: this week’s spend, orders, MER, AOV and CPO with yesterday’s numbers, spend and MER per day, and the last weeks.',
            'On air now: every spot by its creative code — spend, share of the week, orders, MER, CPO, AOV, stations, what moved since the previous report, and NEW for spots first seen in the last 7 days.',
            'Each code is matched to the TV Library commercial with the same code: our name for it in the CP, its production (PRD number + name, click to open it), its poster and play button — with the agency’s own name and code underneath. The Library’s green “On air” dot follows the report.',
            'From us to the networks: creatives emailed to the agency → the agency confirmed (and to which networks) → first seen on air.',
            'Editors and admins can press “Read now” to read the mailbox immediately.',
          ]},
          { type: 'guide', title: 'Meta — from AfterLife', steps: [
            'Live now (video · static), New this week, yesterday’s spend and the 7-day ROAS, against the period before; all Meta spend per day for 14 days.',
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

  const visibleCategories = useMemo(() => {
    return CATEGORIES
      .filter(cat => {
        // Growth team: their own section only; admins see it too (to know what the team reads)
        if (isGrowth) return !!cat.growthOnly;
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
