// Campaign Tracker — its own entry in the Growth team's left panel (17 Nov 2026): every campaign, by group, read-only.
import { useEffect } from 'react';
import GrowthShell from '../../components/growth/GrowthShell';
import Campaigns from '../../components/studio/Campaigns';
import { meApi } from '../../lib/meService';

export default function CampaignTrackerPage() {
  useEffect(() => { meApi.pageView('Campaign Tracker'); }, []);
  return (
    <GrowthShell eyebrow="Campaign Tracker" title="Campaigns" sub="Every Video + Design ticket with a campaign, grouped by type — Higgsfield Cinematic, Holidays & Sales, Concept Families… Click a ticket to see it.">
      <Campaigns />
    </GrowthShell>
  );
}
