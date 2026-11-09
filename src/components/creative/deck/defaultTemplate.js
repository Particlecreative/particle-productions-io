// Mirror of backend/src/lib/creative/config.js DEFAULT_TEMPLATE (used by the offline dev fixture and "reset").
// Design, Video and TV & Special Productions always stay separate: overview → each person → this week.
// Mirror of DEFAULT_TEAM_TEMPLATE in backend/src/lib/creative/config.js — the Creative Team Weekly.
export const DEFAULT_TEAM_TEMPLATE = {
  version: 1,
  slides: [
    { id: 'cover', type: 'cover', enabled: true, options: { text: { eyebrow: 'Particle · Creative Team', title: 'Team Weekly' } } },
    { id: 'sec_last', type: 'section', enabled: true, options: { number: '01', title: 'Last week, together', subtitle: '' } },
    { id: 'team_week', type: 'team_week', enabled: true, options: {} },
    { id: 'market_wins', type: 'market_wins', enabled: true, options: { whenEmpty: 'hide' } },
    { id: 'market_design', type: 'market_people', enabled: true, options: { role: 'design', whenEmpty: 'hide' } },
    { id: 'market_video', type: 'market_people', enabled: true, options: { role: 'video', whenEmpty: 'hide' } },
    { id: 'sec_this', type: 'section', enabled: true, options: { number: '02', title: 'This week', subtitle: '' } },
    { id: 'focus_video', type: 'team_focus', enabled: true, options: { role: 'video' } },
    { id: 'focus_design', type: 'team_focus', enabled: true, options: { role: 'design' } },
    { id: 'workload', type: 'workload', enabled: true, options: { week: 'next', text: { eyebrow: 'Workload · this week', title: 'Who’s on what' } } },
    { id: 'hot_projects', type: 'hot_projects', enabled: true, options: { whenEmpty: 'hide' } },
    { id: 'sec_how', type: 'section', enabled: true, options: { number: '03', title: 'How we work', subtitle: '' } },
    { id: 'sla', type: 'sla', enabled: true, options: {} },
    { id: 'shoutouts', type: 'custom', enabled: true, options: { text: { eyebrow: 'Shoutouts', title: 'Thank you, team' } } },
  ],
};

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
