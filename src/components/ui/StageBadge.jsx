const STAGE_CLASSES = {
  'Pre Production': 'stage-pre-production',
  'Production': 'stage-production',
  'Post': 'stage-post',
  'Post Production': 'stage-post',
  'Paused': 'stage-paused',
  'Pending': 'stage-pending',
  'Completed': 'stage-completed',
  'Paid': 'stage-completed',
  'Pre-Production': 'stage-pre-production',
  'In Progress': 'stage-production',
  'Upcoming': 'stage-pending',
  'Archived': 'stage-pending',
};

// Icons for accessibility — not just color
const STAGE_ICONS = {
  'Pre Production': '◐',
  'Pre-Production': '◐',
  'Production': '●',
  'In Progress': '●',
  'Post': '◑',
  'Post Production': '◑',
  'Paused': '⏸',
  'Pending': '○',
  'Upcoming': '○',
  'Completed': '✓',
  'Paid': '✓',
  'Archived': '—',
};

export default function StageBadge({ stage, size }) {
  const icon = STAGE_ICONS[stage] || '○';
  return (
    <span className={`badge ${STAGE_CLASSES[stage] || 'stage-upcoming'} ${size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : ''}`}>
      <span className="mr-0.5" aria-hidden="true">{icon}</span> {stage}
    </span>
  );
}
