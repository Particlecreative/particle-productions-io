import {
  Presentation, Sparkles, Gauge, Star, BarChart3, PieChart, Bookmark, UserRound, Grid3x3,
  Clapperboard, Megaphone, CalendarDays, AlertTriangle, Type, Flag, LayoutDashboard, Layers3, CalendarRange, Film, Images, Timer,
} from 'lucide-react';
import { CoverSlide, ExecSummarySlide, SectionSlide, CustomSlide, ClosingSlide } from './StorySlides';
import { KpisSlide, ByProductSlide, ByTypeSlide } from './NumberSlides';
import { HighlightsSlide, PersonSlide } from './WorkSlides';
import { WorkloadSlide, PlannedNextSlide, RisksSlide, CpProductionsSlide, CpUpdatesSlide, StudioStatsSlide } from './TeamSlides';
import { DeptOverviewSlide, DivisionOverviewSlide, DivisionNextSlide, ProductionSlide, ShowcaseSlide } from './DivisionSlides';

export const SLIDE_COMPONENTS = {
  cover: { Component: CoverSlide, icon: Presentation },
  exec_summary: { Component: ExecSummarySlide, icon: Sparkles },
  dept_overview: { Component: DeptOverviewSlide, icon: LayoutDashboard },
  division_overview: { Component: DivisionOverviewSlide, icon: Layers3 },
  division_next: { Component: DivisionNextSlide, icon: CalendarRange },
  production: { Component: ProductionSlide, icon: Film },
  showcase: { Component: ShowcaseSlide, icon: Images },
  kpis: { Component: KpisSlide, icon: Gauge },
  highlights: { Component: HighlightsSlide, icon: Star },
  by_product: { Component: ByProductSlide, icon: BarChart3 },
  by_type: { Component: ByTypeSlide, icon: PieChart },
  section: { Component: SectionSlide, icon: Bookmark },
  person: { Component: PersonSlide, icon: UserRound },
  workload: { Component: WorkloadSlide, icon: Grid3x3 },
  studio_stats: { Component: StudioStatsSlide, icon: Timer },
  cp_productions: { Component: CpProductionsSlide, icon: Clapperboard },
  cp_updates: { Component: CpUpdatesSlide, icon: Megaphone },
  planned_next: { Component: PlannedNextSlide, icon: CalendarDays },
  risks: { Component: RisksSlide, icon: AlertTriangle },
  custom: { Component: CustomSlide, icon: Type },
  closing: { Component: ClosingSlide, icon: Flag },
};
