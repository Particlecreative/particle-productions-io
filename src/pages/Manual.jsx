import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, BookOpen, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';
import clsx from 'clsx';

// ─── Manual Content Data ──────────────────────────────────────────────────────

const CATEGORIES = [
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

  const isAdmin = user?.role === 'admin';
  const isParticle = brand?.id === 'particle' || brand?.name?.toLowerCase().includes('particle');
  const isAccounting = user?.role === 'accounting';

  const visibleCategories = useMemo(() => {
    return CATEGORIES
      .filter(cat => {
        if (cat.adminOnly && !isAdmin) return false;
        if (cat.hideFor?.includes('accounting') && isAccounting) return false;
        return true;
      })
      .map(cat => ({
        ...cat,
        sections: cat.sections.filter(sec => !sec.particleOnly || isParticle),
      }))
      .filter(cat => cat.sections.length > 0);
  }, [isAdmin, isParticle, isAccounting]);

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
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2.5">
          <BookOpen size={20} style={{ color: 'var(--brand-primary)' }} />
          <h1 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>CP Panel Manual</h1>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500">v2.1</span>
        </div>
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search docs..." value={query}
            onChange={e => { setQuery(e.target.value); setExpandedSection(null); }}
            className="brand-input pl-9 pr-8 py-1.5 text-sm w-full" />
          {query && <button onClick={() => { setQuery(''); setExpandedSection(null); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">
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
