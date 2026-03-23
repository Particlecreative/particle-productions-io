import { useState, useMemo, useEffect } from 'react';
import { Search, BookOpen, ChevronRight, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

// ─── Manual Content Data ──────────────────────────────────────────────────────

const MANUAL_SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    icon: '🏠',
    summary: 'What CP Panel is, how roles work, and how to navigate the app.',
    keywords: ['login', 'role', 'admin', 'editor', 'viewer', 'brand', 'switch', 'intro'],
    content: [
      {
        type: 'guide', title: 'What is CP Panel?',
        steps: [
          'CP Panel is a Creative Production management platform for tracking productions, budgets, timelines, cast, suppliers, and weekly reports across multiple brands.',
          'All data is stored per-brand — switching brands (top-left in sidebar) shows only that brand\'s data.',
          'The app has three permission levels: Admin, Editor, and Viewer.',
        ],
      },
      {
        type: 'guide', title: 'User Roles Explained',
        steps: [
          '👑 Admin — Full access: create/edit/delete everything, manage users, change settings, switch brands.',
          '✏️ Editor — Can create and edit productions, budgets, reports, and all content. Cannot manage users or change brand settings.',
          '👁️ Viewer — Read-only access. Can view all data but cannot create, edit, or delete anything.',
          'Role is shown on your user record in the Users page (Admin only).',
        ],
      },
      {
        type: 'guide', title: 'Switching Brands',
        steps: [
          'Click the brand switcher (logo + brand name) in the top of the sidebar.',
          'Select the brand you want to work in.',
          'All pages immediately reload to show that brand\'s data.',
          'Your role applies to all brands — there is no per-brand role assignment currently.',
        ],
      },
      {
        type: 'shortcuts', items: [
          { key: 'Ctrl/⌘ + K', action: 'Open Global Search (search everything)' },
          { key: 'N', action: 'Open New Production modal (Dashboard only, no input focused)' },
          { key: 'D', action: 'Toggle Dark / Light mode' },
          { key: '/', action: 'Open Global Search' },
          { key: 'Esc', action: 'Close any open modal' },
          { key: '← →', action: 'Navigate previous / next week (Weekly Reports tab)' },
        ],
      },
      {
        type: 'tips', items: [
          'Bookmark the direct URL for your most-used brand to skip the login switcher.',
          'Press Ctrl+K from any page to search for any production, cast member, supplier, or budget item instantly.',
          'Dark mode preference is saved across sessions — your system preference won\'t override it.',
        ],
      },
    ],
  },

  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: '📋',
    summary: 'The main productions table — create, filter, search, and manage all productions.',
    keywords: ['production', 'create', 'filter', 'search', 'import', 'column', 'drag', 'reorder', 'hide', 'stage', 'new'],
    content: [
      {
        type: 'guide', title: 'Creating a Production',
        steps: [
          'Click the "+ New" button (top-right of the Dashboard) or press N when no input is focused.',
          'Fill in the Project Name (required), planned budget, dates, stage, production type, and producer.',
          'Click "Create Production" — the new row appears in the table immediately.',
          'Production IDs are auto-generated (e.g. PRD26-24) and cannot be edited after creation.',
        ],
      },
      {
        type: 'guide', title: 'Editing a Production Inline',
        steps: [
          'Click the pencil icon at the end of any row to enter row-edit mode.',
          'All editable fields in that row become inputs — edit what you need.',
          'Click the green ✓ check to save changes, or the × to cancel.',
          'Stage and product type tags can also be changed directly via dropdown/tag selectors without entering full edit mode.',
        ],
      },
      {
        type: 'guide', title: 'Filtering & Searching',
        steps: [
          'Use the search bar (top-left) to search by production name, ID, producer, or product type.',
          'Use the Stage dropdown to filter by a specific stage (e.g. "Production", "Post Production").',
          'Use the Product Type dropdown to filter by product type (e.g. "TVC", "Digital").',
          'Toggle "Hide Completed" to remove completed productions from the view.',
          'Filters are remembered across sessions — clear them with the × next to each filter or refresh the page.',
        ],
      },
      {
        type: 'guide', title: 'Column Visibility & Reordering',
        steps: [
          'Click the Columns button (sliders icon) in the toolbar to open the column panel.',
          'Toggle any column on/off to show or hide it.',
          'Drag column headers left/right to reorder them. Your column order is saved per user.',
          'Some columns (ID, Project Name) are always visible and cannot be hidden.',
        ],
      },
      {
        type: 'guide', title: 'Reordering Rows by Drag',
        steps: [
          'Hover over any row — a drag handle (⠿) appears on the left side.',
          'Click and drag the handle to reorder productions.',
          'After reordering, a "Save View" prompt appears — save for yourself or for everyone.',
          'Custom row order is cleared when any filter or sort is active.',
        ],
      },
      {
        type: 'guide', title: 'Importing Productions from Excel or Monday.com',
        steps: [
          'Click the Upload icon in the toolbar to open the Import modal.',
          'Drop an .xlsx, .xls, or .csv file onto the upload area (or click to browse).',
          'Step 2: Map your spreadsheet columns to CP Panel fields (e.g. "Name" → Project Name). Auto-mapping detects common column names.',
          'Step 3: Review the preview table — uncheck any rows you don\'t want to import.',
          'Click "Import X Productions" to add them to the dashboard.',
          'Download a blank template using the "Download blank template" link if you\'re not sure of the format.',
        ],
      },
      {
        type: 'guide', title: 'Opening a Production',
        steps: [
          'Click anywhere on a production row (not the edit/drag controls) to open the Production Detail page.',
          'The detail page shows all sub-tabs: Overview, Budget, Comments, Links, Gantt, Call Sheets, Cast/Rights.',
        ],
      },
      {
        type: 'tips', items: [
          'Stages and Product Types shown in dropdowns are fully customizable in Settings → Lists.',
          'The "Color by Status" toggle (paint bucket icon) color-codes rows by their stage.',
          'Click any column header to sort by that column (click again to reverse).',
          'The Analysis tab (next to Productions and Weekly tabs) shows charts and KPIs for the current year.',
        ],
      },
      {
        type: 'faq', items: [
          { q: 'Why can\'t I click "New Production"?', a: 'You may be logged in as a Viewer. Only Editors and Admins can create productions.' },
          { q: 'How do I change the production ID?', a: 'Production IDs are auto-generated and cannot be changed after creation.' },
          { q: 'My filters aren\'t showing all productions.', a: 'Check if Stage, Product Type, or "Hide Completed" filters are active. All filters are shown in the toolbar bar above the table.' },
          { q: 'Can I bulk-delete productions?', a: 'Not currently. Delete productions one at a time from the Production Detail page → Overview tab → "Delete Production" button.' },
        ],
      },
    ],
  },

  {
    id: 'production-detail',
    label: 'Production Detail',
    icon: '🎬',
    summary: 'All sub-tabs for a single production: Overview, Budget, Comments, Links, Gantt, Call Sheets, Casting.',
    keywords: ['overview', 'budget', 'comments', 'links', 'gantt', 'call sheet', 'casting', 'rights', 'notes', 'update', 'crew', 'tab'],
    content: [
      {
        type: 'guide', title: 'Navigating Production Tabs',
        steps: [
          'Open a production from the Dashboard by clicking its row.',
          'Tabs appear at the top: Overview · Budget · Comments · Links · Gantt · Call Sheets · Casting & Rights.',
          'Each tab shows a different aspect of the production. Your last-visited tab is remembered.',
        ],
      },
      {
        type: 'guide', title: 'Overview Tab',
        steps: [
          'Shows all production fields: name, dates, stage, budget summary, producer, notes.',
          'Click "Edit" to modify any field.',
          'The "Activity" section shows a log of all changes made to this production.',
          'Scroll down for the "Notes" field — rich text for production notes.',
          '"Delete Production" button is at the bottom of the Overview tab (Editors+ only).',
        ],
      },
      {
        type: 'guide', title: 'Budget Tab',
        steps: [
          'Shows all budget line items organized by category.',
          'Click "+ Add Line Item" to add a new budget row.',
          'Each line item has: Description, Vendor, Category, Planned, Estimated, Actual, Status (Pending/Approved/Paid), and Payer.',
          'Click any cell to edit it inline.',
          'The summary bar at the top shows Planned vs. Estimated vs. Actual totals.',
          'Use the "Receipts" column to mark items as having a receipt uploaded.',
        ],
      },
      {
        type: 'guide', title: 'Comments Tab',
        steps: [
          'Shows all comments/updates for this production in chronological order.',
          'Type a comment in the text box and click "Add Update" (or press Enter).',
          'Comments appear in the Updates Panel (bell icon in header) for the whole team.',
          'Comments marked with ★ (star) appear in Weekly Reports for this production.',
        ],
      },
      {
        type: 'guide', title: 'Links Tab',
        steps: [
          'Add any URL related to this production: scripts, briefs, reference videos, shared drives.',
          'Click "+ Add Link" → enter URL, title, and category.',
          'Links are categorized (Script, Brief, Reference, Drive, etc.) and can be filtered.',
          'Starred links appear in Weekly Reports under this production.',
        ],
      },
      {
        type: 'guide', title: 'Gantt Tab',
        steps: [
          'Shows a Gantt-style timeline for this production\'s milestones and phases.',
          'Add tasks/phases with start and end dates.',
          'Toggle "Sync with production dates" to automatically update the production\'s planned start/end based on Gantt tasks.',
        ],
      },
      {
        type: 'tips', items: [
          'The budget summary at the top of the Budget tab updates in real-time as you edit line items.',
          'Add a "Shoot Date", "Delivery Date", and "On-Air Date" in the Overview tab — these can be shown as columns in the Dashboard.',
          'Comments with the star ★ are called "selected comments" and are used to populate Weekly Reports.',
        ],
      },
    ],
  },

  {
    id: 'financial',
    label: 'Financial',
    icon: '💰',
    summary: 'Yearly budget planning, spending tracking, and financial charts across all productions.',
    keywords: ['budget', 'financial', 'chart', 'annual', 'spending', 'currency', 'export', 'total', 'year'],
    content: [
      {
        type: 'guide', title: 'Setting the Annual Budget',
        steps: [
          'At the top of the Financial page, find the "Planned Budget YYYY" card.',
          'Click the pencil icon to edit the annual planned budget figure.',
          'Enter the total budget for the year and click "Save". This is the target for all productions combined.',
        ],
      },
      {
        type: 'guide', title: 'Reading the Charts',
        steps: [
          'Bar chart: compares Planned vs. Estimated vs. Actual spend per production.',
          'Line chart: tracks cumulative spending over time.',
          'Donut chart: shows budget distribution by production type or stage.',
          'KPI cards at top: Total Planned / Total Estimated / Total Actual / Remaining budget.',
        ],
      },
      {
        type: 'guide', title: 'Currency Toggle',
        steps: [
          'Click the currency selector (top-right) to switch between ILS ₪ and USD $.',
          'All budget values in the app convert using the current exchange rate.',
          'Preference is saved per session.',
        ],
      },
      {
        type: 'tips', items: [
          'Hover over any bar in the chart to see exact budget figures for that production.',
          'Use the year selector to compare financial data across different years.',
          'The "Overage" indicator shows productions where Actual > Planned.',
        ],
      },
    ],
  },

  {
    id: 'accounting',
    label: 'Accounting',
    icon: '📊',
    summary: 'Line-item payment tracking, receipt management, and payer workflow.',
    keywords: ['accounting', 'payment', 'receipt', 'payer', 'approve', 'paid', 'pending', 'invoice', 'line item'],
    content: [
      {
        type: 'guide', title: 'Understanding the Accounting View',
        steps: [
          'The Accounting page shows all budget line items across all productions in a single ledger view.',
          'Filter by production, payer, status (Pending / Approved / Paid), or date range.',
          'Use this view to track what has been paid, what is awaiting approval, and what is pending.',
        ],
      },
      {
        type: 'guide', title: 'Payment Status Workflow',
        steps: [
          '1. "Pending" — line item has been added but not yet approved.',
          '2. "Approved" — approved for payment but not yet paid.',
          '3. "Paid" — payment has been made and confirmed.',
          'Change status by clicking the status badge on any row.',
        ],
      },
      {
        type: 'guide', title: 'Receipt Management',
        steps: [
          'Mark a line item as having a receipt by checking the "Receipt" column.',
          'A receipt icon appears next to any item with confirmed receipt.',
          'The 48-hour rule: invoices over 48 hours old without a receipt are flagged automatically.',
        ],
      },
      {
        type: 'tips', items: [
          'Use the "Payer" filter to see all expenses assigned to a specific person or vendor.',
          'The total at the bottom of the ledger shows the sum of all visible (filtered) items.',
          'Export the accounting data using the download button to get a CSV of line items.',
        ],
      },
    ],
  },

  {
    id: 'invoices',
    label: 'Invoices',
    icon: '🧾',
    summary: 'Invoice lifecycle, receipt confirmations, and the 48-hour rule.',
    keywords: ['invoice', 'receipt', '48 hour', 'confirm', 'export', 'overdue', 'supplier'],
    content: [
      {
        type: 'guide', title: 'Invoice Lifecycle',
        steps: [
          '1. Invoice is created (linked to a budget line item).',
          '2. Status moves from "Pending" → "Approved" → "Paid".',
          '3. Receipt confirmation: once a payment is made, upload or confirm receipt.',
          '4. Completed invoices are archived but remain in history.',
        ],
      },
      {
        type: 'guide', title: 'The 48-Hour Rule',
        steps: [
          'Any invoice in "Approved" status for more than 48 hours without a receipt confirmation is flagged.',
          'Flagged invoices appear with a warning icon in the Invoices list.',
          'Resolve by either marking as Paid with receipt, or updating the status.',
        ],
      },
      {
        type: 'tips', items: [
          'Link invoices to specific suppliers to enable supplier-based reporting.',
          'The "Dealer Type" field (set on the Supplier record) automatically fills on invoices for that supplier.',
          'Export selected invoices as CSV for accountant handoff.',
        ],
      },
    ],
  },

  {
    id: 'weekly',
    label: 'Weekly Reports',
    icon: '📅',
    summary: 'Creating and managing weekly production status reports with an approval workflow.',
    keywords: ['weekly', 'report', 'status', 'approve', 'present', 'history', 'note', 'production note', 'link', 'comment', 'curate'],
    content: [
      {
        type: 'guide', title: 'Creating a Weekly Report',
        steps: [
          'Go to Dashboard → "Weekly" tab.',
          'The current week is shown by default. Click "← Prev" or "Next →" to navigate weeks (or use arrow keys ← →).',
          'Click "New Report" to create a report for the visible week.',
          'Add a report title and overall weekly notes.',
        ],
      },
      {
        type: 'guide', title: 'Adding Productions to a Report',
        steps: [
          'Click "+ Add Production" to select which productions to include in this week\'s report.',
          'Only productions active in this week\'s time range appear by default (you can add others manually).',
          'Each production card shows its status, notes, selected comments, and links.',
        ],
      },
      {
        type: 'guide', title: 'Curating Comments & Links',
        steps: [
          'In each production card, you\'ll see comments from that production\'s Comments tab.',
          'Click the star ☆ next to a comment to mark it as "selected" for this report.',
          'Similarly, star links from the production\'s Links tab to include them in the report.',
          'Approved items (shown with a check ✓) are locked in — only Admins can un-approve them.',
        ],
      },
      {
        type: 'guide', title: 'Presentation Mode',
        steps: [
          'Click "Present" (top-right of the report) to enter full-screen Presentation mode.',
          'Navigate through productions using arrow keys or the on-screen buttons.',
          'Each slide shows one production\'s status, comments, and links in a clean, client-ready format.',
          'Press Escape to exit presentation mode.',
        ],
      },
      {
        type: 'guide', title: 'Report History',
        steps: [
          'The left sidebar in the Weekly tab shows all past reports.',
          'Click any past report to view it (read-only if approved).',
          'Delete a past report by clicking the trash icon — this is permanent.',
        ],
      },
      {
        type: 'shortcuts', items: [
          { key: '← Arrow', action: 'Go to previous week' },
          { key: '→ Arrow', action: 'Go to next week' },
        ],
      },
      {
        type: 'tips', items: [
          'Save the report regularly — changes auto-save when you click away from a field.',
          'Production-level notes in the Weekly report are separate from the main production notes.',
          'Status options per production: On Track 🟢 / Pending ⬜ / At Risk 🟡 / Blocked 🔴 / Completed 🔵.',
        ],
      },
      {
        type: 'faq', items: [
          { q: 'Can I include the same production in multiple weekly reports?', a: 'Yes. Each week is a separate report, so a production can appear in as many weeks as needed.' },
          { q: 'Who can approve a report?', a: 'Editors and Admins can mark items as approved. Viewers cannot.' },
          { q: 'How do I export a weekly report?', a: 'Use Presentation mode for a client-ready view. CSV/PDF export is not currently available.' },
        ],
      },
    ],
  },

  {
    id: 'gantt',
    label: 'Gantt / Timelines',
    icon: '📈',
    summary: 'Timeline views for productions — milestone tracking and date sync.',
    keywords: ['gantt', 'timeline', 'milestone', 'task', 'sync', 'date', 'bar', 'schedule'],
    content: [
      {
        type: 'guide', title: 'Using the Gantt View',
        steps: [
          'Open a production → "Gantt" tab to see its timeline.',
          'Add tasks/phases by clicking "+ Add Task".',
          'Each task has a name, start date, end date, and optional assignee.',
          'Tasks appear as bars on the timeline. Drag the edges to resize (change duration).',
        ],
      },
      {
        type: 'guide', title: 'Syncing Gantt with Production Dates',
        steps: [
          'Toggle "Sync with production dates" on the Gantt tab.',
          'When enabled, the production\'s planned_start and planned_end automatically update to match the earliest task start and latest task end.',
          'The production\'s Timeline column in the Dashboard shows "Auto" when sync is enabled.',
        ],
      },
      {
        type: 'guide', title: 'Brand-Level Gantts Page',
        steps: [
          'The /Gantts page in the sidebar shows all productions\' timelines side-by-side.',
          'Use this for a high-level overview of all active productions.',
          'Click on any production in the Gantts view to open its detail.',
        ],
      },
      {
        type: 'tips', items: [
          'The Gantts sidebar page is read-only — edit tasks from within each production\'s Gantt tab.',
          'Tasks that span weekends are still shown as continuous bars (weekends aren\'t excluded).',
        ],
      },
    ],
  },

  {
    id: 'call-sheets',
    label: 'Call Sheets',
    icon: '📋',
    summary: 'Create and manage call sheets for shoot days — crew, talent, and logistics.',
    keywords: ['call sheet', 'shoot', 'crew', 'talent', 'schedule', 'call time', 'location'],
    content: [
      {
        type: 'guide', title: 'Creating a Call Sheet',
        steps: [
          'Open a production → "Call Sheets" tab.',
          'Click "+ New Call Sheet".',
          'Set the shoot date, general call time, and location.',
          'Add crew members: name, role, department, and individual call time.',
          'Save the call sheet — it can be printed or shared.',
        ],
      },
      {
        type: 'guide', title: 'Managing People on Set',
        steps: [
          'Use the "Cast & Crew" section to list everyone on set.',
          'Departments: Director, Camera, Art, Production, Talent, etc.',
          'Individual call times can vary from the general call time.',
          'Add notes per person (e.g. "bring own wardrobe", "confirm 24h before").',
        ],
      },
      {
        type: 'tips', items: [
          'You can create multiple call sheets per production (one per shoot day).',
          'Call sheets are visible in the /Call-Sheets page in the sidebar for a brand-level overview.',
        ],
      },
    ],
  },

  {
    id: 'casting',
    label: 'Casting & Rights',
    icon: '⭐',
    summary: 'Cast member management, contract types, expiry dates, and risk badges.',
    keywords: ['casting', 'cast', 'rights', 'contract', 'expiry', 'overdue', 'risk', 'talent', 'agency', 'character'],
    content: [
      {
        type: 'guide', title: 'Adding a Cast Member',
        steps: [
          'Open a production → "Casting & Rights" tab.',
          'Click "+ Add Cast Member".',
          'Fill in: Name, Role (Actor, Host, VO, etc.), Character name, Agency, and Contract Type.',
          'Set the Rights Expiry Date — this is the most important field for tracking.',
          'Save — the cast member appears in the production\'s cast list.',
        ],
      },
      {
        type: 'guide', title: 'Contract Status & Risk Badges',
        steps: [
          'Contract Status is automatically calculated based on the Rights Expiry Date:',
          '✅ Active — Expiry is more than 30 days away.',
          '⚠️ Close to Overdue — Expiry is within 30 days.',
          '🚨 Overdue — Expiry date has passed.',
          'The Casting sidebar item shows a badge count of at-risk cast members.',
          'A notification is triggered when any cast member enters "Close to Overdue" or "Overdue" status.',
        ],
      },
      {
        type: 'tips', items: [
          'Use the /Casting-Rights page in the sidebar for a brand-wide view of all cast members across all productions.',
          'Filter by status (Active/Close to Overdue/Overdue) to quickly find contracts that need renewal.',
          'The red badge on the Casting sidebar item is a count of overdue + close-to-overdue contracts.',
        ],
      },
      {
        type: 'faq', items: [
          { q: 'Why is there a red badge on the Casting menu item?', a: 'One or more cast members across your productions have rights contracts that are overdue or expiring within 30 days.' },
          { q: 'Can I track multiple contract types per cast member?', a: 'Each cast member record has one contract type field. Add separate records for the same talent with different contract types if needed.' },
        ],
      },
    ],
  },

  {
    id: 'links',
    label: 'Links',
    icon: '🔗',
    summary: 'Manage production-related links — scripts, briefs, reference videos, shared drives.',
    keywords: ['link', 'url', 'script', 'brief', 'reference', 'drive', 'category', 'weekly link'],
    content: [
      {
        type: 'guide', title: 'Adding Links to a Production',
        steps: [
          'Open a production → "Links" tab.',
          'Click "+ Add Link".',
          'Enter the URL, a title, and select a category (Script, Brief, Reference, Drive, Other).',
          'Save — the link appears in the production\'s link list.',
        ],
      },
      {
        type: 'guide', title: 'Links Page (Brand-level)',
        steps: [
          'The /Links page in the sidebar shows all links across all productions.',
          'Filter by production, category, or search by title.',
          'Click any link to open it in a new tab.',
        ],
      },
      {
        type: 'guide', title: 'Links in Weekly Reports',
        steps: [
          'Star (☆) a link on the production\'s Links tab or in the Weekly Report editor.',
          'Starred links appear in the Weekly Report under that production.',
          'Links can be marked as "approved" by Editors to lock them into the report.',
        ],
      },
      {
        type: 'tips', items: [
          'Use descriptive titles for links — the URL alone doesn\'t tell the team much.',
          'Google Drive, Dropbox, WeTransfer, Frame.io links work well as reference/delivery links.',
        ],
      },
    ],
  },

  {
    id: 'suppliers',
    label: 'Suppliers',
    icon: '🏢',
    summary: 'Supplier management, categories, contact info, and production usage.',
    keywords: ['supplier', 'vendor', 'company', 'contact', 'category', 'equipment', 'service'],
    content: [
      {
        type: 'guide', title: 'Adding a Supplier',
        steps: [
          'Go to /Suppliers in the sidebar.',
          'Click "+ New Supplier".',
          'Fill in: Company Name, Category (Equipment, Studio, Post, etc.), Contact Name, Email, Phone.',
          'Set the "Dealer Type" — this auto-fills on invoices for this supplier.',
          'Save — the supplier is available when adding budget line items.',
        ],
      },
      {
        type: 'guide', title: 'Supplier Dashboard Tab',
        steps: [
          'Switch to the "Dashboard" tab on the Suppliers page for visual reporting.',
          'See which suppliers are used most across productions.',
          'Chart shows spend per supplier, production count, and category breakdown.',
        ],
      },
      {
        type: 'tips', items: [
          'Suppliers are brand-specific — suppliers added for Particle don\'t appear for Blurr.',
          'Use the column visibility button to show/hide supplier fields you don\'t need.',
          'The "Full Name" field is used to match suppliers to budget line items automatically.',
        ],
      },
    ],
  },

  {
    id: 'contracts',
    label: 'Contracts',
    icon: '📝',
    summary: 'Contract tracking across productions — status, type, counterparty, and expiry.',
    keywords: ['contract', 'agreement', 'status', 'counterparty', 'expiry', 'type', 'signed'],
    content: [
      {
        type: 'guide', title: 'Managing Contracts',
        steps: [
          'Contracts are linked to productions. Open a production → you won\'t find a dedicated Contracts tab currently; use the /Contracts sidebar page.',
          'The /Contracts page lists all contracts brand-wide.',
          'Each contract has: Title, Counterparty, Type (NDA, Service Agreement, Talent Release, etc.), Status, and Expiry Date.',
          'Click a contract to view or edit its details.',
        ],
      },
      {
        type: 'guide', title: 'Contract Status Tracking',
        steps: [
          'Draft — Contract is being prepared.',
          'Sent — Sent to counterparty for signature.',
          'Signed — Fully executed.',
          'Expired — Past expiry date.',
          'Update status by clicking the status badge on the contract row.',
        ],
      },
      {
        type: 'tips', items: [
          'Set expiry dates on all contracts — the system will flag expired contracts.',
          'Link contracts to a specific production for easier filtering.',
        ],
      },
    ],
  },

  {
    id: 'users',
    label: 'Users',
    icon: '👥',
    summary: 'Invite users, manage roles, and organize user groups (Admin only).',
    keywords: ['user', 'invite', 'role', 'admin', 'editor', 'viewer', 'group', 'permission', 'access'],
    content: [
      {
        type: 'guide', title: 'Inviting a New User',
        steps: [
          'Go to /Users in the sidebar (Admin only).',
          'Click "+ Invite User".',
          'Enter their email address and select their role: Admin, Editor, or Viewer.',
          'Click "Send Invite" — they receive an email with a login link.',
          'Until they log in, their status shows as "Invited".',
        ],
      },
      {
        type: 'guide', title: 'Changing a User\'s Role',
        steps: [
          'Find the user in the Users list.',
          'Click the role badge (Admin/Editor/Viewer) to open a dropdown.',
          'Select the new role — change takes effect immediately.',
        ],
      },
      {
        type: 'guide', title: 'User Groups',
        steps: [
          'Click the "Groups" tab on the Users page.',
          'Groups allow you to organize users by team or department.',
          'Create a group, give it a name and default role, then add members.',
          'Groups are used for filtering and for setting default permissions on content.',
        ],
      },
      {
        type: 'faq', items: [
          { q: 'Can I limit a user to only one brand?', a: 'Not currently. Users can see all brands. Role applies globally across all brands.' },
          { q: 'How do I remove a user?', a: 'Click the trash icon on the user\'s row. This removes their account entirely. They will lose all access immediately.' },
          { q: 'What\'s the difference between Admin and Editor?', a: 'Admins can manage users, change brand settings, and access all pages. Editors can do everything except user management and settings.' },
        ],
      },
    ],
  },

  {
    id: 'settings',
    label: 'Settings',
    icon: '⚙️',
    summary: 'Customize list options (stages, types), manage brands, and submit improvement tickets.',
    keywords: ['settings', 'stage', 'type', 'list', 'brand', 'customize', 'ticket', 'improve', 'admin'],
    content: [
      {
        type: 'guide', title: 'Editing List Options',
        steps: [
          'Go to /Settings (Admin only).',
          'Find the "Lists" section — this controls the dropdown options throughout the app.',
          'Edit lists: Production Stages, Product Types, Production Types, Budget Categories, etc.',
          'Add a new option by clicking "+ Add Item" in any list.',
          'Reorder items by dragging them up/down.',
          'Delete an option by clicking the × next to it — note: existing productions using that value will still show the old value.',
        ],
      },
      {
        type: 'guide', title: 'Brand Management',
        steps: [
          'The "Brands" section in Settings shows all brands in the system.',
          'Edit brand name, primary color, and logo.',
          'The brand color affects the entire UI theme when that brand is active.',
        ],
      },
      {
        type: 'guide', title: 'Submitting Improvement Tickets',
        steps: [
          'Scroll to the "Improvement Tickets" section in Settings.',
          'Click "+ New Ticket" to submit a feature request or bug report.',
          'Add a title, description, and priority level.',
          'Tickets are visible to Admins and tracked on the Settings page.',
        ],
      },
      {
        type: 'tips', items: [
          'Changes to list options take effect immediately in all dropdowns across the app.',
          'The brand color can be any hex code — choose a color that represents the brand.',
          'Settings are global — all users see the same list options.',
        ],
      },
    ],
  },

  {
    id: 'analysis',
    label: 'Analysis',
    icon: '📉',
    summary: 'Dashboard charts and KPIs — understanding your production analytics.',
    keywords: ['analysis', 'chart', 'kpi', 'metric', 'analytics', 'graph', 'trend', 'breakdown'],
    content: [
      {
        type: 'guide', title: 'Reading the Analysis Tab',
        steps: [
          'From the Dashboard, click the "Analysis" tab (next to Productions and Weekly).',
          'Select a year from the year dropdown to view that year\'s analytics.',
          'Charts update based on all productions in the selected year.',
        ],
      },
      {
        type: 'guide', title: 'Key Metrics Explained',
        steps: [
          'Total Productions: count of all productions for the year.',
          'Total Planned Budget: sum of all productions\' planned_budget fields.',
          'Total Actual Spend: sum of all "Actual Spent" values from Budget tabs.',
          'Budget Variance: difference between Planned and Actual (negative = over budget).',
          'Stage Distribution: pie/donut chart showing how many productions are in each stage.',
          'Type Breakdown: breakdown of productions by product type (TVC, Digital, etc.).',
        ],
      },
      {
        type: 'tips', items: [
          'Hover over chart segments to see exact values.',
          'The analysis is read-only — edit productions from the Dashboard to update charts.',
          'Use the Financial page for deeper per-production budget comparison charts.',
        ],
      },
    ],
  },

  {
    id: 'global-search',
    label: 'Global Search',
    icon: '🔍',
    summary: 'Search across all productions, cast, budget items, and suppliers at once.',
    keywords: ['search', 'global', 'find', 'ctrl+k', 'command palette', 'cast', 'budget', 'supplier'],
    content: [
      {
        type: 'guide', title: 'Using Global Search',
        steps: [
          'Press Ctrl+K (Windows/Linux) or ⌘+K (Mac) from anywhere in the app.',
          'Or press / as a shortcut.',
          'Type your search query — results appear instantly grouped by category.',
          'Use ↑↓ arrow keys to navigate results, Enter to open, Esc to close.',
        ],
      },
      {
        type: 'guide', title: 'What Gets Searched',
        steps: [
          '📋 Productions — ID, name, producer, type, stage.',
          '💰 Budget Items — description, vendor, category, payer.',
          '🎭 Cast Members — name, role, character, agency.',
          '🏢 Suppliers — name, category, contact name, email.',
        ],
      },
      {
        type: 'tips', items: [
          'Search is brand-specific — only data from the currently active brand is searched.',
          'Clicking a result navigates directly to the relevant page (or production detail tab).',
          'Match text is highlighted in yellow to help you spot the match quickly.',
        ],
      },
    ],
  },

  {
    id: 'faq',
    label: 'FAQ',
    icon: '❓',
    summary: 'Frequently asked questions about CP Panel.',
    keywords: ['faq', 'question', 'help', 'how to', 'why', 'problem', 'issue', 'stuck'],
    content: [
      {
        type: 'faq', items: [
          { q: 'How do I reset my password?', a: 'On the login screen, click "Forgot password?" and enter your email. A reset link will be sent.' },
          { q: 'Can I export productions to Excel?', a: 'Not yet from the Dashboard. The Financial page has an export option. Full Excel export is planned.' },
          { q: 'Why does the app feel slow?', a: 'Try clearing your browser cache. If you have hundreds of productions with many budget items, the initial load may take a moment.' },
          { q: 'Can two people edit the same production at the same time?', a: 'Currently no real-time sync — if two users edit the same production simultaneously, the last save wins. Always communicate with your team.' },
          { q: 'How do I archive a production?', a: 'Set the stage to "Completed". Use "Hide Completed" filter on Dashboard to keep your view clean. Completed productions still appear in History.' },
          { q: 'Can I attach files to productions?', a: 'Not as direct file uploads, but use the Links tab to add links to Google Drive, Dropbox, or any hosted file.' },
          { q: 'How do I undo a change?', a: 'There is no undo currently. Be careful with deletions — they are permanent.' },
          { q: 'Why can\'t I see some pages (like Users or Settings)?', a: 'Those pages are Admin-only. Ask your admin to upgrade your role if you need access.' },
          { q: 'Can I customize the dashboard columns?', a: 'Yes — click the column visibility button (sliders icon) to show/hide any column. Drag column headers to reorder them.' },
          { q: 'How do I change which brand I\'m looking at?', a: 'Click the brand name / logo at the top of the sidebar — a switcher popup appears.' },
          { q: 'Notifications keep appearing for the same thing.', a: 'Notifications are deduplicated within 60 seconds. If the same event triggers repeatedly, check for a loop in your workflow.' },
          { q: 'Where do I find deleted productions?', a: 'Deleted productions are gone permanently. There is no recycle bin. Use "History" to review past production activity.' },
          { q: 'Can I print a call sheet?', a: 'Use your browser\'s print function (Ctrl/⌘+P) while viewing a call sheet. The layout is optimized for printing.' },
          { q: 'How are production IDs generated?', a: 'IDs follow the format PRD{YY}-{NN}, e.g. PRD26-01. YY is the last 2 digits of the production year, NN is a sequence number.' },
          { q: 'Can Viewers download or export data?', a: 'Viewers can view all data in the app but cannot use export features that create new files. Export buttons are visible to Editors and Admins.' },
        ],
      },
    ],
  },

  {
    id: 'changelog',
    label: 'Changelog',
    icon: '📦',
    summary: 'Version history — what was added, changed, or fixed in each release.',
    keywords: ['changelog', 'version', 'update', 'release', 'new', 'fix', 'feature', 'history'],
    content: [
      {
        type: 'guide', title: 'v1.9 — March 2026',
        steps: [
          '🌙 Dark mode — full app dark theme, persisted across sessions, toggle with D key or sun/moon icon.',
          '🔍 Global Search (Ctrl+K) — search productions, cast, budget items, and suppliers from anywhere.',
          '📖 Manual page — comprehensive in-app documentation with search (this page!).',
          '📱 Mobile nav "More" menu — all secondary pages accessible on mobile via the More button.',
          '💾 Filter persistence — dashboard filters are remembered across page navigations.',
          '🔐 Security hardening — all mutation functions now require Editor/Admin role on both UI and function level.',
          '⌨️ Keyboard shortcuts — N for new production, D for dark mode, ← → for weekly navigation.',
          '🔔 Notification deduplication — same notification won\'t fire twice within 60 seconds.',
          '🛡️ Error boundaries — page crashes are contained, showing a recovery screen instead of blank page.',
        ],
      },
      {
        type: 'guide', title: 'v1.8 — February 2026',
        steps: [
          '📅 Weekly Reports system — create weekly status reports with approval workflow and presentation mode.',
          '⭐ Casting & Rights tracking with automatic risk badges and expiry notifications.',
          '📊 Supplier Dashboard tab with spend analytics.',
          '🗂️ Column visibility and drag-to-reorder for Dashboard and Suppliers table.',
          '💱 Currency toggle (ILS / USD) across all budget views.',
        ],
      },
      {
        type: 'guide', title: 'v1.7 — January 2026',
        steps: [
          '📈 Gantt view per production with sync-to-dates feature.',
          '📋 Call Sheets module.',
          '🔗 Links tab on productions with category filtering.',
          '🏢 Suppliers module with form-based management.',
          '📝 Contracts module.',
        ],
      },
      {
        type: 'guide', title: 'v1.6 — December 2025',
        steps: [
          '💰 Financial page with annual budget planning and charts (Recharts).',
          '📊 Accounting ledger with payment status workflow.',
          '🧾 Invoices module with 48-hour rule enforcement.',
          '📥 Import productions from Excel / Monday.com exports.',
        ],
      },
      {
        type: 'guide', title: 'v1.5 and earlier',
        steps: [
          '🏗️ Core production management: create, edit, filter, search, sort productions.',
          '💬 Comments / Updates system per production.',
          '👥 User management with role-based access control.',
          '⚙️ Settings: customizable lists for stages, product types, categories.',
          '🎨 Multi-brand theming with CSS custom properties.',
          '📱 Mobile-responsive layout with bottom nav.',
        ],
      },
    ],
  },
];

// ─── Accordion FAQ Item ───────────────────────────────────────────────────────
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span>{q}</span>
        {open ? <ChevronDown size={15} className="flex-shrink-0 text-gray-400" /> : <ChevronRight size={15} className="flex-shrink-0 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-3 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 leading-relaxed">
          {a}
        </div>
      )}
    </div>
  );
}

// ─── Section Content Renderer ─────────────────────────────────────────────────
function SectionContent({ section }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{section.summary}</p>

      {section.content.map((block, bi) => (
        <div key={bi} className="brand-card p-5 rounded-xl">
          {block.type === 'guide' && (
            <>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3">{block.title}</h3>
              <ol className="space-y-2">
                {block.steps.map((step, si) => (
                  <li key={si} className="flex gap-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold flex items-center justify-center mt-0.5">
                      {si + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {block.type === 'tips' && (
            <>
              <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-1.5">
                💡 Tips
              </h3>
              <ul className="space-y-2">
                {block.items.map((tip, ti) => (
                  <li key={ti} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    <span className="text-amber-500 flex-shrink-0 mt-0.5">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {block.type === 'shortcuts' && (
            <>
              <h3 className="text-sm font-bold text-indigo-700 dark:text-indigo-400 mb-3 flex items-center gap-1.5">
                ⚡ Keyboard Shortcuts
              </h3>
              <div className="space-y-2">
                {block.items.map((item, ki) => (
                  <div key={ki} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{item.action}</span>
                    <kbd className="flex-shrink-0 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-mono text-xs border border-gray-300 dark:border-gray-600">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </>
          )}

          {block.type === 'faq' && (
            <>
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-1.5">
                ❓ Frequently Asked Questions
              </h3>
              <div className="space-y-2">
                {block.items.map((item, qi) => (
                  <FaqItem key={qi} q={item.q} a={item.a} />
                ))}
              </div>
            </>
          )}

          {block.type === 'mistakes' && (
            <>
              <h3 className="text-sm font-bold text-red-700 dark:text-red-400 mb-3 flex items-center gap-1.5">
                ⚠️ Common Mistakes
              </h3>
              <ul className="space-y-2">
                {block.items.map((item, mi) => (
                  <li key={mi} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    <span className="text-red-400 flex-shrink-0 mt-0.5">✕</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Manual Page ─────────────────────────────────────────────────────────
export default function Manual() {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState('overview');

  // Search filter
  const filteredSections = useMemo(() => {
    if (!query.trim()) return MANUAL_SECTIONS;
    const q = query.toLowerCase();
    return MANUAL_SECTIONS.filter(s =>
      s.label.toLowerCase().includes(q) ||
      s.summary.toLowerCase().includes(q) ||
      s.keywords.some(k => k.includes(q)) ||
      s.content.some(c =>
        c.title?.toLowerCase().includes(q) ||
        c.steps?.some(step => step.toLowerCase().includes(q)) ||
        c.items?.some(item => (item.q || item).toString().toLowerCase().includes(q))
      )
    );
  }, [query]);

  // Auto-select first result when searching
  useEffect(() => {
    if (filteredSections.length > 0) {
      setActiveId(filteredSections[0].id);
    }
  }, [filteredSections]);

  const activeSection = MANUAL_SECTIONS.find(s => s.id === activeId);

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <BookOpen size={20} style={{ color: 'var(--brand-primary)' }} />
          <h1 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>CP Panel Manual</h1>
          <span className="text-xs text-gray-400 ml-1">v1.9</span>
        </div>
        {/* Search */}
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search docs…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="brand-input pl-8 py-1.5 text-sm w-full"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar nav */}
        <aside className="w-52 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto py-3">
          {filteredSections.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-400 italic">No sections match "{query}"</p>
          )}
          {filteredSections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveId(section.id)}
              className={clsx(
                'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors',
                activeId === section.id
                  ? 'font-semibold bg-gray-100 dark:bg-gray-800'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              )}
              style={activeId === section.id ? { color: 'var(--brand-primary)' } : {}}
            >
              <span className="text-base leading-none">{section.icon}</span>
              <span className="truncate">{section.label}</span>
            </button>
          ))}
        </aside>

        {/* Content panel */}
        <main className="flex-1 overflow-y-auto px-6 py-5">
          {activeSection ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">{activeSection.icon}</span>
                <h2 className="text-xl font-black" style={{ color: 'var(--brand-primary)' }}>
                  {activeSection.label}
                </h2>
              </div>
              <SectionContent section={activeSection} />
            </>
          ) : (
            <div className="text-sm text-gray-400 italic mt-8 text-center">
              Select a section from the left to view documentation.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
