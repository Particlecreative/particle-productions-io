// Mirror of backend/src/lib/creative/config.js DEFAULT_TEMPLATE (used by the offline dev fixture and "reset").
export const DEFAULT_TEMPLATE = {
  version: 1,
  slides: [
    { id: 'cover', type: 'cover', enabled: true, options: {} },
    { id: 'exec_summary', type: 'exec_summary', enabled: true, options: {} },
    { id: 'kpis', type: 'kpis', enabled: true, options: {} },
    { id: 'highlights', type: 'highlights', enabled: true, options: { layout: 'hero+3' } },
    { id: 'sec_output', type: 'section', enabled: true, options: { number: '01', title: 'The Output', subtitle: 'What the studio shipped' } },
    { id: 'by_product', type: 'by_product', enabled: true, options: { limit: 10 } },
    { id: 'by_type', type: 'by_type', enabled: true, options: { dimension: 'type' } },
    { id: 'sec_team', type: 'section', enabled: true, options: { number: '02', title: 'The Team', subtitle: 'Who made what' } },
    { id: 'person_video', type: 'person', enabled: true, repeat: 'perPerson', options: { role: 'video', perPage: 8 } },
    { id: 'person_design', type: 'person', enabled: true, repeat: 'perPerson', options: { role: 'design', perPage: 8 } },
    { id: 'workload', type: 'workload', enabled: true, options: { variant: 'heatmap' } },
    { id: 'sec_prod', type: 'section', enabled: true, options: { number: '03', title: 'Productions', subtitle: 'From the CP weekly' } },
    { id: 'cp_productions', type: 'cp_productions', enabled: true, options: {} },
    { id: 'cp_updates', type: 'cp_updates', enabled: true, options: {} },
    { id: 'planned_next', type: 'planned_next', enabled: true, options: { groupBy: 'person' } },
    { id: 'risks', type: 'risks', enabled: true, options: { whenEmpty: 'celebrate' } },
    { id: 'closing', type: 'closing', enabled: true, options: {} },
  ],
};
