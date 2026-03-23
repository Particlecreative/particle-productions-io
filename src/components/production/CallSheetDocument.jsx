/**
 * CallSheetDocument — A4 branded React component for call sheet PDF generation.
 * Uses inline styles (not Tailwind) — required for reliable html2canvas capture.
 */
import { forwardRef } from 'react';

const CallSheetDocument = forwardRef(function CallSheetDocument({ config, production, crew, cast, links, brandColor = '#030b2e', brandName = 'CP Panel' }, ref) {
  const s = config || {};
  const overview = s.overview || {};
  const location = s.location || {};
  const projectDetails = s.project_details || {};
  const technical = s.technical || {};

  const primaryContacts = s.primary_contacts || [];
  const crewContacts = s.crew_contacts || [];
  const selectedLinks = (s.selected_link_ids || []).map(id => links.find(l => l.id === id)).filter(Boolean);
  const extraFields = s.extra_fields || [];

  const sectionOn = key => !s.sections || s.sections[key] !== false;

  const styles = {
    page: {
      width: '794px',
      minHeight: '1123px',
      background: '#ffffff',
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: '12px',
      color: '#1a1a1a',
      padding: '0',
      boxSizing: 'border-box',
    },
    header: {
      background: brandColor,
      color: '#ffffff',
      padding: '24px 32px 20px',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: '16px',
    },
    headerLeft: { flex: 1 },
    headerBrand: { fontSize: '10px', fontWeight: '700', letterSpacing: '2px', opacity: 0.7, textTransform: 'uppercase', marginBottom: '4px' },
    headerTitle: { fontSize: '22px', fontWeight: '900', lineHeight: 1.1, marginBottom: '4px' },
    headerMeta: { fontSize: '11px', opacity: 0.7 },
    headerRight: { textAlign: 'right', fontSize: '11px', opacity: 0.8 },
    body: { padding: '24px 32px' },
    section: { marginBottom: '20px' },
    sectionTitle: {
      fontSize: '10px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase',
      color: brandColor, borderBottom: `2px solid ${brandColor}`, paddingBottom: '4px', marginBottom: '10px',
    },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' },
    grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' },
    label: { fontSize: '9px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' },
    value: { fontSize: '12px', fontWeight: '600', color: '#1a1a1a', marginTop: '2px' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' },
    th: { background: '#f4f4f4', padding: '6px 8px', textAlign: 'left', fontWeight: '700', fontSize: '10px', borderBottom: '1px solid #e0e0e0' },
    td: { padding: '6px 8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' },
    warningBox: { background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', padding: '8px 12px', fontSize: '11px', color: '#856404', marginBottom: '12px' },
    linkRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '11px', borderBottom: '1px solid #f5f5f5' },
    footer: {
      borderTop: `3px solid ${brandColor}`, padding: '12px 32px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: '10px', color: '#888', background: '#fafafa',
    },
    chip: { display: 'inline-block', background: '#f0f0f0', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', marginRight: '4px', marginBottom: '2px' },
  };

  function Field({ label, value }) {
    if (!value) return null;
    return (
      <div>
        <div style={styles.label}>{label}</div>
        <div style={styles.value}>{value}</div>
      </div>
    );
  }

  return (
    <div ref={ref} style={styles.page}>
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerBrand}>{brandName} · Call Sheet</div>
          <div style={styles.headerTitle}>{s.title || production?.project_name || 'Call Sheet'}</div>
          <div style={styles.headerMeta}>
            {s.shoot_date && `📅 ${s.shoot_date}`}
            {production?.producer && ` · Producer: ${production.producer}`}
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={{ fontSize: '10px', opacity: 0.6, marginBottom: '4px' }}>Generated</div>
          <div>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          {production?.id && <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px' }}>{production.id}</div>}
        </div>
      </div>

      <div style={styles.body}>

        {/* ── OVERVIEW ───────────────────────────────────────────────── */}
        {sectionOn('overview') && (overview.crew_call_time || overview.talent_call_time || overview.client_call_time || overview.wrap_time || overview.notes) && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Overview · Call Times</div>
            <div style={styles.grid4}>
              <Field label="Crew Call" value={overview.crew_call_time} />
              <Field label="Talent Call" value={overview.talent_call_time} />
              <Field label="Client Call" value={overview.client_call_time} />
              <Field label="Wrap" value={overview.wrap_time} />
            </div>
            {overview.timezone && <div style={{ fontSize: '10px', color: '#888', marginTop: '6px' }}>🕐 {overview.timezone}</div>}
            {overview.notes && <div style={{ marginTop: '6px', fontSize: '11px', color: '#555' }}>{overview.notes}</div>}
          </div>
        )}

        {/* ── LOCATION ──────────────────────────────────────────────── */}
        {sectionOn('location') && (location.address || location.on_site_contact || location.load_in || location.parking) && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Location</div>
            <div style={styles.grid2}>
              <Field label="Address" value={location.address} />
              <Field label="On-Site Contact" value={location.on_site_contact} />
              <Field label="Load-In Time" value={location.load_in} />
              <Field label="Parking" value={location.parking} />
            </div>
            {location.location_notes && <div style={{ marginTop: '8px', fontSize: '11px', color: '#555' }}>{location.location_notes}</div>}
          </div>
        )}

        {/* ── PROJECT DETAILS ────────────────────────────────────────── */}
        {sectionOn('project_details') && (projectDetails.creative_brief || projectDetails.virtual_link || projectDetails.talent || projectDetails.schedule) && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Project Details</div>
            <div style={styles.grid2}>
              <Field label="Creative Brief" value={projectDetails.creative_brief} />
              <Field label="Virtual / Set Link" value={projectDetails.virtual_link} />
              <Field label="Talent" value={projectDetails.talent} />
              <Field label="Schedule Notes" value={projectDetails.schedule} />
            </div>
          </div>
        )}

        {/* ── PRIMARY CONTACTS ───────────────────────────────────────── */}
        {sectionOn('primary_contacts') && primaryContacts.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Primary Contacts</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Name', 'Role', 'Email', 'Phone', 'Call Time'].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {primaryContacts.map((c, i) => (
                  <tr key={i}>
                    <td style={{ ...styles.td, fontWeight: '600' }}>{c.name || '—'}</td>
                    <td style={styles.td}>{c.role || '—'}</td>
                    <td style={styles.td}>{c.email || '—'}</td>
                    <td style={styles.td}>{c.phone || '—'}</td>
                    <td style={styles.td}>{c.call_time || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── CREW CONTACTS ─────────────────────────────────────────── */}
        {sectionOn('crew_contacts') && crewContacts.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Crew Contacts</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Name', 'Role', 'Phone', 'Call Time'].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {crewContacts.map((c, i) => (
                  <tr key={i}>
                    <td style={{ ...styles.td, fontWeight: '600' }}>{c.name || '—'}</td>
                    <td style={styles.td}>{c.role || c.supplier_role || c.type || '—'}</td>
                    <td style={styles.td}>{c.phone || c.contact_phone || '—'}</td>
                    <td style={styles.td}>{c.call_time || overview.crew_call_time || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── TECHNICAL DETAILS ─────────────────────────────────────── */}
        {sectionOn('technical') && (technical.fps || technical.resolution || technical.color_profile || technical.media_delivery) && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Technical Details</div>
            <div style={styles.grid4}>
              <Field label="FPS" value={technical.fps} />
              <Field label="Resolution" value={technical.resolution} />
              <Field label="Color Profile" value={technical.color_profile} />
              <Field label="Media Delivery" value={technical.media_delivery} />
            </div>
          </div>
        )}

        {/* ── PRODUCTION LINKS ──────────────────────────────────────── */}
        {sectionOn('links') && selectedLinks.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Production Links</div>
            {selectedLinks.map(link => (
              <div key={link.id} style={styles.linkRow}>
                <span style={{ color: brandColor, fontWeight: '700', fontSize: '10px', minWidth: '80px' }}>{link.category || 'Link'}</span>
                <span style={{ fontWeight: '600' }}>{link.title || link.url}</span>
                <span style={{ color: '#888', fontSize: '10px' }}>{link.url}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── EXTRA FIELDS ──────────────────────────────────────────── */}
        {extraFields.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Additional Information</div>
            <div style={styles.grid2}>
              {extraFields.map((f, i) => <Field key={i} label={f.label} value={f.value} />)}
            </div>
          </div>
        )}

      </div>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <div style={styles.footer}>
        <div>
          {production?.producer && <span style={{ fontWeight: '700' }}>{production.producer}</span>}
          {s.footer_email && <span> · {s.footer_email}</span>}
          {s.footer_phone && <span> · {s.footer_phone}</span>}
        </div>
        <div style={{ opacity: 0.5 }}>CP Panel · {brandName} · {s.shoot_date || ''}</div>
      </div>
    </div>
  );
});

export default CallSheetDocument;
