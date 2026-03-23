const STAGE_CLASSES = {
  'Pre Production': 'stage-pre-production',
  'Production': 'stage-production',
  'Post': 'stage-post',
  'Paused': 'stage-paused',
  'Pending': 'stage-pending',
  'Completed': 'stage-completed',
  // Paid = green (same as Completed)
  'Paid': 'stage-completed',
  // Legacy fallbacks
  'Pre-Production': 'stage-pre-production',
  'In Progress': 'stage-production',
  'Upcoming': 'stage-pending',
  'Archived': 'stage-pending',
};

export default function StageBadge({ stage }) {
  return (
    <span className={`badge ${STAGE_CLASSES[stage] || 'stage-upcoming'}`}>
      {stage}
    </span>
  );
}
