// TV Library — its own entry (17 Nov 2026): every TV commercial's final files.
import { useEffect } from 'react';
import { TvLibrary } from '../library/LibraryPage';
import { meApi } from '../../lib/meService';

export default function TvLibraryPage() {
  useEffect(() => { meApi.pageView('TV Library'); }, []);
  return <TvLibrary />;
}
