// TV Productions — its own entry (17 Nov 2026): every production as a timeline — stage, product, type, producer, dates. No money.
import { useEffect } from 'react';
import GrowthShell from '../../components/growth/GrowthShell';
import GrowthProductions from '../../components/growth/GrowthProductions';
import { meApi } from '../../lib/meService';

export default function TvProductionsPage() {
  useEffect(() => { meApi.pageView('TV Productions'); }, []);
  return (
    <GrowthShell eyebrow="TV Productions" title="Productions" sub="What’s being made and when — stage, product, type, producer, shoot days, delivery and on-air.">
      <GrowthProductions />
    </GrowthShell>
  );
}
