export default function ProgressBar({ value = 0, showLabel = true }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 100 ? '#dc2626' : pct >= 80 ? '#f59e0b' : '#16a34a';

  return (
    <div className="flex items-center gap-2">
      <div className="progress-bar-track flex-1" style={{ minWidth: 60 }}>
        <div
          className="progress-bar-fill"
          style={{
            width: `${pct}%`,
            background: color,
            animation: 'progressGrow 0.8s ease-out',
          }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-semibold whitespace-nowrap" style={{ color, minWidth: 32 }}>
          {pct}%
        </span>
      )}
    </div>
  );
}
