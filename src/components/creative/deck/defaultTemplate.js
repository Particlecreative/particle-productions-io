// Mirror of backend/src/lib/creative/config.js DEFAULT_TEMPLATE (used by the offline dev fixture and "reset").
// Design, Video and TV & Special Productions always stay separate: overview → each person → this week.
export const DEFAULT_TEMPLATE = {
  version: 2,
  slides: [
    { id: 'cover', type: 'cover', enabled: true, options: {} },
    { id: 'exec_summary', type: 'exec_summary', enabled: true, options: {} },
    { id: 'dept_overview', type: 'dept_overview', enabled: true, options: {} },
    { id: 'sec_design', type: 'section', enabled: true, options: { number: '01', title: 'Design', subtitle: '', division: 'design' } },
    { id: 'design_overview', type: 'division_overview', enabled: true, options: { division: 'design' } },
    { id: 'person_design', type: 'person', enabled: true, repeat: 'perPerson', options: { role: 'design' } },
    { id: 'design_next', type: 'division_next', enabled: true, options: { division: 'design' } },
    { id: 'sec_video', type: 'section', enabled: true, options: { number: '02', title: 'Video', subtitle: '', division: 'video' } },
    { id: 'video_overview', type: 'division_overview', enabled: true, options: { division: 'video' } },
    { id: 'person_video', type: 'person', enabled: true, repeat: 'perPerson', options: { role: 'video' } },
    { id: 'video_next', type: 'division_next', enabled: true, options: { division: 'video' } },
    { id: 'sec_tv', type: 'section', enabled: true, options: { number: '03', title: 'TV & Special Productions', subtitle: '', division: 'tv' } },
    { id: 'tv_overview', type: 'division_overview', enabled: true, options: { division: 'tv' } },
    { id: 'productions', type: 'production', enabled: true, repeat: 'perProduction', options: {} },
    { id: 'tv_next', type: 'division_next', enabled: true, options: { division: 'tv' } },
    { id: 'cp_updates', type: 'cp_updates', enabled: true, options: {} },
    { id: 'studio_stats', type: 'studio_stats', enabled: true, options: {} },
  ],
};
