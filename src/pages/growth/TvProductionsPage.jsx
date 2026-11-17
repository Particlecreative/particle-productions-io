// TV Productions — its own entry (17 Nov 2026): what's coming (shoots, deliveries, on-air), every production with its
// stage, product, producer and internal editor / designer. No money.
import { useEffect } from 'react';
import GrowthShell from '../../components/growth/GrowthShell';
import GrowthProductions from '../../components/growth/GrowthProductions';
import { meApi } from '../../lib/meService';

export default function TvProductionsPage() {
  useEffect(() => { meApi.pageView('TV Productions'); }, []);
  return (
    <GrowthShell eyebrow="TV Productions" title="Productions" sub="What’s being made, who’s editing it, and what’s coming — shoots, deliveries and on-air dates.">
      <GrowthProductions />
    </GrowthShell>
  );
}
