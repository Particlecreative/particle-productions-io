import GanttTab from '../components/production/GanttTab';

export default function Gantts() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-black brand-title" style={{ color: 'var(--brand-primary)' }}>
          Gantts
        </h1>
      </div>

      <GanttTab allProductions />
    </div>
  );
}
