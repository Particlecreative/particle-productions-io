// Productions for the Creative team (Tomer, 25 Nov 2026: "see all productions without prices, money or finance"):
// what's being made, by whom, and what's coming — shoots, deliveries, on-air dates. The server strips every money field.
import { useEffect } from 'react';
import CreativeShell from '../../components/creative-team/CreativeShell';
import GrowthProductions from '../../components/growth/GrowthProductions';
import { meApi } from '../../lib/meService';

export default function ProductionsView() {
  useEffect(() => { meApi.pageView('Productions'); }, []);
  return (
    <CreativeShell eyebrow="Productions" title="Productions" sub="What’s being made, who’s editing it, and what’s coming — shoots, deliveries and on-air dates. No budgets here.">
      <GrowthProductions />
    </CreativeShell>
  );
}
