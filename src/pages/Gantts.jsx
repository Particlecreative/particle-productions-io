import { useState, useEffect } from 'react';
import { GanttChartSquare } from 'lucide-react';
import GanttTab from '../components/production/GanttTab';
import { getAllGanttEvents } from '../lib/ganttService';
import { getProductions } from '../lib/dataService';
import { useBrand } from '../context/BrandContext';

export default function Gantts() {
  const { brandId } = useBrand();
  const [stats, setStats] = useState({ events: 0, productions: 0 });

  useEffect(() => {
    const evts = getAllGanttEvents();
    const prodIds = new Set(evts.map(e => e.production_id).filter(Boolean));
    Promise.resolve(getProductions(brandId)).then(prods => {
      setStats({ events: evts.length, productions: Array.isArray(prods) ? prods.length : prodIds.size });
    });
  }, [brandId]);

  return (
    <div className="page-enter">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--brand-primary)', opacity: 0.9 }}>
              <GanttChartSquare size={18} className="text-white" />
            </div>
            <h1 className="text-2xl font-black brand-title" style={{ color: 'var(--brand-primary)' }}>
              Gantts
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-1 ml-11">
            {stats.events} events across {stats.productions} productions
          </p>
        </div>
      </div>

      <GanttTab allProductions />
    </div>
  );
}
