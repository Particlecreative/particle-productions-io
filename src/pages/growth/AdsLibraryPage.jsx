// Ads Library — its own entry (17 Nov 2026): AfterLife's Fresh to test, live, + "Open AfterLife". Small "powered by AfterLife".
import { useEffect } from 'react';
import GrowthShell from '../../components/growth/GrowthShell';
import AdsLibrary from '../../components/growth/AdsLibrary';
import { meApi } from '../../lib/meService';

export default function AdsLibraryPage() {
  useEffect(() => { meApi.pageView('Ads Library'); }, []);
  return (
    <GrowthShell>
      <AdsLibrary header />
    </GrowthShell>
  );
}
