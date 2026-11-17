// New ticket — its own entry in the Growth team's left panel (17 Nov 2026). Created on Monday as them when their Monday is connected.
import { useEffect } from 'react';
import GrowthShell from '../../components/growth/GrowthShell';
import TicketCreator from '../../components/studio/TicketCreator';
import { meApi } from '../../lib/meService';

export default function NewTicketPage() {
  useEffect(() => { meApi.pageView('New ticket'); }, []);
  return (
    <GrowthShell eyebrow="New ticket" title="New ticket" sub="Say what you need — it fills the Monday form for Video or Design, and the ticket lands on Monday with your name on it.">
      <TicketCreator />
    </GrowthShell>
  );
}
