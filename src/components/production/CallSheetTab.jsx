/**
 * CallSheetTab — Split-panel Call Sheet builder.
 * Left: config form. Right: live <CallSheetDocument> preview.
 * Shoot / Remote Shoot productions only.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Download, Plus, Trash2, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import {
  getLinks, getPeopleOnSet, getCasting,
  createCallSheet, getCallSheets,
  createLink, generateId,
} from '../../lib/dataService';
import CallSheetDocument from './CallSheetDocument';
import clsx from 'clsx';

// ── helpers ────────────────────────────────────────────────────────────────
function addMonths(dateStr, months) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

const SECTION_LABELS = {
  overview:         'Overview · Call Times',
  location:         'Location',
  project_details:  'Project Details',
  primary_contacts: 'Primary Contacts',
  crew_contacts:    'Crew Contacts',
  technical:        'Technical Details',
  links:            'Production Links',
};

function blankConfig(production) {
  return {
    title: production?.project_name || '',
    shoot_date: production?.planned_end || '',
    footer_email: '',
    footer_phone: '',
    recipients: 'all',
    custom_recipient_ids: [],
    sections: {
      overview: true, location: true, project_details: true,
      primary_contacts: true, crew_contacts: true, technical: true, links: true,
    },
    overview: {
      crew_call_time: '', talent_call_time: '', client_call_time: '',
      wrap_time: '', timezone: 'Asia/Jerusalem (IST)', notes: '',
    },
    location: { address: '', on_site_contact: '', load_in: '', parking: '', location_notes: '' },
    project_details: { creative_brief: '', virtual_link: '', talent: '', schedule: '' },
    technical: { fps: '', resolution: '', color_profile: '', media_delivery: '' },
    primary_contacts: [],
    crew_contacts: [],
    selected_link_ids: [],
    extra_fields: [],
  };
}

// ── blank row factories ────────────────────────────────────────────────────
const blankPrimary = () => ({ name: '', role: '', email: '', phone: '', call_time: '' });

// ── sub-components ─────────────────────────────────────────────────────────

function SectionToggle({ label, sectionKey, sections, onChange }) {
  const on = sections[sectionKey] !== false;
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(sectionKey, !on)}
        className={clsx(
          'w-8 h-4 rounded-full transition-colors relative',
          on ? 'bg-blue-500' : 'bg-gray-300'
        )}
      >
        <div className={clsx('absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all', on ? 'left-4' : 'left-0.5')} />
      </div>
      <span className="text-xs text-gray-600">{label}</span>
    </label>
  );
}

function Field2({ label, name, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(name, e.target.value)}
        placeholder={placeholder || ''}
        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-300"
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function CallSheetTab({ productionId, production }) {
  const { user } = useAuth();
  const { brand } = useBrand();
  const brandColor = brand?.primary || '#030b2e';
  const brandName  = brand?.name || 'CP Panel';

  const [config, setConfig]             = useState(() => blankConfig(production));
  const [links, setLinks]               = useState([]);
  const [peopleOnSet, setPeopleOnSet]   = useState([]);
  const [casting, setCasting]           = useState([]);
  const [callSheets, setCallSheets]     = useState([]);
  const [generating, setGenerating]     = useState(false);
  const [generated, setGenerated]       = useState(null); // { id, title }
  const [showPreview, setShowPreview]   = useState(true);

  const previewRef = useRef(null);

  useEffect(() => {
    async function load() {
      const [linksRes, peopleRes, castRes, sheetsRes] = await Promise.all([
        Promise.resolve(getLinks(productionId)),
        Promise.resolve(getPeopleOnSet(productionId)),
        Promise.resolve(getCasting(productionId)),
        Promise.resolve(getCallSheets(productionId)),
      ]);
      setLinks(Array.isArray(linksRes) ? linksRes : []);
      setPeopleOnSet(Array.isArray(peopleRes) ? peopleRes : []);
      setCasting(Array.isArray(castRes) ? castRes : []);
      setCallSheets(Array.isArray(sheetsRes) ? sheetsRes : []);
    }
    load();
  }, [productionId]);

  // ── derived crew / cast for the document ──────────────────────────────
  const crewForDoc = useCallback(() => {
    const r = config.recipients;
    if (r === 'crew') return peopleOnSet;
    if (r === 'cast') return [];
    if (r === 'stakeholders') return peopleOnSet.filter(p => p.supplier_type === 'client');
    if (r === 'custom') return peopleOnSet.filter(p => config.custom_recipient_ids?.includes(p.id));
    return peopleOnSet; // 'all'
  }, [config.recipients, config.custom_recipient_ids, peopleOnSet]);

  const castForDoc = useCallback(() => {
    const r = config.recipients;
    if (r === 'crew') return [];
    if (r === 'stakeholders') return [];
    if (r === 'custom') return casting.filter(c => config.custom_recipient_ids?.includes(c.id));
    return casting; // 'all' or 'cast'
  }, [config.recipients, config.custom_recipient_ids, casting]);

  // ── config update helpers ─────────────────────────────────────────────
  function set(path, value) {
    setConfig(prev => {
      const next = { ...prev };
      const parts = path.split('.');
      if (parts.length === 1) { next[parts[0]] = value; return next; }
      next[parts[0]] = { ...next[parts[0]], [parts[1]]: value };
      return next;
    });
  }

  function toggleSection(key, on) {
    setConfig(prev => ({ ...prev, sections: { ...prev.sections, [key]: on } }));
  }

  function toggleLink(id) {
    setConfig(prev => {
      const ids = prev.selected_link_ids || [];
      return { ...prev, selected_link_ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] };
    });
  }

  function addPrimary() {
    setConfig(prev => ({ ...prev, primary_contacts: [...(prev.primary_contacts || []), blankPrimary()] }));
  }

  function updatePrimary(i, field, val) {
    setConfig(prev => {
      const arr = [...(prev.primary_contacts || [])];
      arr[i] = { ...arr[i], [field]: val };
      return { ...prev, primary_contacts: arr };
    });
  }

  function removePrimary(i) {
    setConfig(prev => ({ ...prev, primary_contacts: prev.primary_contacts.filter((_, idx) => idx !== i) }));
  }

  function addExtraField() {
    setConfig(prev => ({ ...prev, extra_fields: [...(prev.extra_fields || []), { label: '', value: '' }] }));
  }

  function updateExtra(i, field, val) {
    setConfig(prev => {
      const arr = [...(prev.extra_fields || [])];
      arr[i] = { ...arr[i], [field]: val };
      return { ...prev, extra_fields: arr };
    });
  }

  function removeExtra(i) {
    setConfig(prev => ({ ...prev, extra_fields: prev.extra_fields.filter((_, idx) => idx !== i) }));
  }

  // ── PDF generation ────────────────────────────────────────────────────
  async function generatePDF() {
    if (!previewRef.current) return;
    setGenerating(true);
    try {
      const [html2canvas, { jsPDF }] = await Promise.all([
        import('html2canvas').then(m => m.default),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgAspect = canvas.height / canvas.width;
      const imgH = pageW * imgAspect;

      if (imgH <= pageH) {
        pdf.addImage(imgData, 'PNG', 0, 0, pageW, imgH);
      } else {
        // Multi-page: slice canvas into A4-height segments
        const segH = Math.floor(canvas.width * (pageH / pageW));
        let yOffset = 0;
        while (yOffset < canvas.height) {
          const seg = document.createElement('canvas');
          seg.width = canvas.width;
          seg.height = Math.min(segH, canvas.height - yOffset);
          seg.getContext('2d').drawImage(canvas, 0, yOffset, seg.width, seg.height, 0, 0, seg.width, seg.height);
          if (yOffset > 0) pdf.addPage();
          pdf.addImage(seg.toDataURL('image/png'), 'PNG', 0, 0, pageW, seg.height * (pageW / seg.width));
          yOffset += segH;
        }
      }

      const shootLabel = config.shoot_date || 'undated';
      const fileName   = `call-sheet-${(config.title || production?.project_name || 'production').replace(/\s+/g, '-').toLowerCase()}-${shootLabel}.pdf`;
      pdf.save(fileName);

      // Persist call sheet record
      const cs = createCallSheet({
        production_id: productionId,
        title: config.title || production?.project_name || 'Call Sheet',
        shoot_date: config.shoot_date,
        created_by: user?.name || 'Unknown',
        recipients: config.recipients,
        custom_recipient_ids: config.custom_recipient_ids || [],
        sections: config.sections,
        overview: config.overview,
        location: config.location,
        project_details: config.project_details,
        technical: config.technical,
        primary_contacts: config.primary_contacts || [],
        crew_contacts: crewForDoc(),
        selected_link_ids: config.selected_link_ids || [],
        extra_fields: config.extra_fields || [],
      });

      // Add to Links tab under "Call Sheets" category
      const linkTitle = `Call Sheet – ${config.title || production?.project_name} (${config.shoot_date || 'undated'})`;
      createLink({
        id: generateId('lnk'),
        production_id: productionId,
        category: 'Call Sheets',
        title: linkTitle,
        url: `/call-sheet-view/${cs.id}`,
        added_by: user?.name || 'Unknown',
        added_at: new Date().toISOString(),
      });

      setGenerated({ id: cs.id, title: cs.title });
      Promise.resolve(getCallSheets(productionId)).then(r => setCallSheets(Array.isArray(r) ? r : []));
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setGenerating(false);
    }
  }

  // ── Combined crew for the document ──────────────────────────────────
  const docCrewContacts = crewForDoc();
  const docCastContacts = castForDoc();

  // ── Recipient options ────────────────────────────────────────────────
  const allPeople = [...peopleOnSet, ...casting];

  return (
    <div className="flex gap-4 h-full" style={{ minHeight: 600 }}>

      {/* ── LEFT PANEL: Config ──────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-1" style={{ maxHeight: '80vh' }}>

        {/* Header */}
        <div className="brand-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={16} className="text-blue-500" />
            <span className="font-bold text-sm">Call Sheet Builder</span>
          </div>

          {/* Title */}
          <div className="mb-3">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Title</label>
            <input
              value={config.title || ''}
              onChange={e => set('title', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="e.g. Day 1 – Studio"
            />
          </div>

          {/* Shoot date */}
          <div className="mb-3">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Shoot Date</label>
            <input
              type="date"
              value={config.shoot_date || ''}
              onChange={e => set('shoot_date', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Who Gets It</label>
            <div className="flex flex-wrap gap-1">
              {[['all', 'All'], ['crew', 'Crew Only'], ['cast', 'Cast Only'], ['stakeholders', 'Stakeholders'], ['custom', 'Custom']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => set('recipients', val)}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                    config.recipients === val
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  )}
                >{label}</button>
              ))}
            </div>
            {config.recipients === 'custom' && allPeople.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {allPeople.map(p => {
                  const id = p.id;
                  const sel = config.custom_recipient_ids?.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() => setConfig(prev => {
                        const ids = prev.custom_recipient_ids || [];
                        return { ...prev, custom_recipient_ids: sel ? ids.filter(x => x !== id) : [...ids, id] };
                      })}
                      className={clsx(
                        'px-2 py-0.5 rounded text-xs border transition-all',
                        sel ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'
                      )}
                    >{p.name || p.full_name || id}</button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Section toggles */}
        <div className="brand-card p-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Sections</div>
          <div className="flex flex-col gap-2">
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <SectionToggle key={key} sectionKey={key} label={label} sections={config.sections || {}} onChange={toggleSection} />
            ))}
          </div>
        </div>

        {/* Overview */}
        {config.sections?.overview !== false && (
          <div className="brand-card p-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Overview · Call Times</div>
            <div className="grid grid-cols-2 gap-2">
              <Field2 label="Crew Call" name="crew_call_time" value={config.overview?.crew_call_time} onChange={(n, v) => set(`overview.${n}`, v)} placeholder="08:00" />
              <Field2 label="Talent Call" name="talent_call_time" value={config.overview?.talent_call_time} onChange={(n, v) => set(`overview.${n}`, v)} placeholder="09:00" />
              <Field2 label="Client Call" name="client_call_time" value={config.overview?.client_call_time} onChange={(n, v) => set(`overview.${n}`, v)} placeholder="10:00" />
              <Field2 label="Wrap" name="wrap_time" value={config.overview?.wrap_time} onChange={(n, v) => set(`overview.${n}`, v)} placeholder="18:00" />
            </div>
            <div className="mt-2">
              <Field2 label="Timezone" name="timezone" value={config.overview?.timezone} onChange={(n, v) => set(`overview.${n}`, v)} />
            </div>
            <div className="mt-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Notes</label>
              <textarea
                value={config.overview?.notes || ''}
                onChange={e => set('overview.notes', e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                placeholder="Any important notes for the day…"
              />
            </div>
          </div>
        )}

        {/* Location */}
        {config.sections?.location !== false && (
          <div className="brand-card p-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Location</div>
            <div className="flex flex-col gap-2">
              <Field2 label="Address" name="address" value={config.location?.address} onChange={(n, v) => set(`location.${n}`, v)} placeholder="Full address" />
              <Field2 label="On-Site Contact" name="on_site_contact" value={config.location?.on_site_contact} onChange={(n, v) => set(`location.${n}`, v)} placeholder="Name + phone" />
              <Field2 label="Load-In Time" name="load_in" value={config.location?.load_in} onChange={(n, v) => set(`location.${n}`, v)} placeholder="07:00" />
              <Field2 label="Parking" name="parking" value={config.location?.parking} onChange={(n, v) => set(`location.${n}`, v)} placeholder="Parking instructions" />
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Location Notes</label>
                <textarea
                  value={config.location?.location_notes || ''}
                  onChange={e => set('location.location_notes', e.target.value)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Project Details */}
        {config.sections?.project_details !== false && (
          <div className="brand-card p-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Project Details</div>
            <div className="flex flex-col gap-2">
              <Field2 label="Creative Brief" name="creative_brief" value={config.project_details?.creative_brief} onChange={(n, v) => set(`project_details.${n}`, v)} placeholder="Brief summary" />
              <Field2 label="Virtual / Set Link" name="virtual_link" value={config.project_details?.virtual_link} onChange={(n, v) => set(`project_details.${n}`, v)} placeholder="Zoom / Miro URL" />
              <Field2 label="Talent" name="talent" value={config.project_details?.talent} onChange={(n, v) => set(`project_details.${n}`, v)} placeholder="Lead talent" />
              <Field2 label="Schedule Notes" name="schedule" value={config.project_details?.schedule} onChange={(n, v) => set(`project_details.${n}`, v)} placeholder="Running order notes" />
            </div>
          </div>
        )}

        {/* Primary Contacts */}
        {config.sections?.primary_contacts !== false && (
          <div className="brand-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Primary Contacts</div>
              <button onClick={addPrimary} className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-semibold">
                <Plus size={11} /> Add
              </button>
            </div>
            {(config.primary_contacts || []).map((c, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-2 mb-2 bg-gray-50 relative">
                <button onClick={() => removePrimary(i)} className="absolute top-1.5 right-1.5 text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
                <div className="grid grid-cols-2 gap-1.5 mb-1">
                  <input value={c.name || ''} onChange={e => updatePrimary(i, 'name', e.target.value)} placeholder="Name" className="border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-300" />
                  <input value={c.role || ''} onChange={e => updatePrimary(i, 'role', e.target.value)} placeholder="Role" className="border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-300" />
                  <input value={c.email || ''} onChange={e => updatePrimary(i, 'email', e.target.value)} placeholder="Email" className="border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-300" />
                  <input value={c.phone || ''} onChange={e => updatePrimary(i, 'phone', e.target.value)} placeholder="Phone" className="border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-300" />
                </div>
                <input value={c.call_time || ''} onChange={e => updatePrimary(i, 'call_time', e.target.value)} placeholder="Call time (e.g. 08:30)" className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-300" />
              </div>
            ))}
            {(config.primary_contacts || []).length === 0 && (
              <div className="text-xs text-gray-300 text-center py-2">No contacts added</div>
            )}
          </div>
        )}

        {/* Technical */}
        {config.sections?.technical !== false && (
          <div className="brand-card p-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Technical Details</div>
            <div className="grid grid-cols-2 gap-2">
              <Field2 label="FPS" name="fps" value={config.technical?.fps} onChange={(n, v) => set(`technical.${n}`, v)} placeholder="25" />
              <Field2 label="Resolution" name="resolution" value={config.technical?.resolution} onChange={(n, v) => set(`technical.${n}`, v)} placeholder="4K UHD" />
              <Field2 label="Color Profile" name="color_profile" value={config.technical?.color_profile} onChange={(n, v) => set(`technical.${n}`, v)} placeholder="Log C / Rec.709" />
              <Field2 label="Media Delivery" name="media_delivery" value={config.technical?.media_delivery} onChange={(n, v) => set(`technical.${n}`, v)} placeholder="H.264 MP4" />
            </div>
          </div>
        )}

        {/* Production Links */}
        {config.sections?.links !== false && links.length > 0 && (
          <div className="brand-card p-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Production Links</div>
            <div className="flex flex-wrap gap-1.5">
              {links.map(link => {
                const sel = (config.selected_link_ids || []).includes(link.id);
                return (
                  <button
                    key={link.id}
                    onClick={() => toggleLink(link.id)}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                      sel ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'
                    )}
                  >
                    {link.title || link.url}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer fields */}
        <div className="brand-card p-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Footer Info</div>
          <div className="flex flex-col gap-2">
            <Field2 label="Contact Email" name="footer_email" value={config.footer_email} onChange={(n, v) => set(n, v)} placeholder="producer@company.com" />
            <Field2 label="Contact Phone" name="footer_phone" value={config.footer_phone} onChange={(n, v) => set(n, v)} placeholder="+972 50 000 0000" />
          </div>
        </div>

        {/* Extra Fields */}
        <div className="brand-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Extra Fields</div>
            <button onClick={addExtraField} className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-semibold">
              <Plus size={11} /> Add
            </button>
          </div>
          {(config.extra_fields || []).map((f, i) => (
            <div key={i} className="flex gap-1.5 mb-1.5 items-center">
              <input
                value={f.label || ''}
                onChange={e => updateExtra(i, 'label', e.target.value)}
                placeholder="Label"
                className="w-28 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-300"
              />
              <input
                value={f.value || ''}
                onChange={e => updateExtra(i, 'value', e.target.value)}
                placeholder="Value"
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-300"
              />
              <button onClick={() => removeExtra(i)} className="text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
            </div>
          ))}
        </div>

        {/* Previous Call Sheets */}
        {callSheets.length > 0 && (
          <div className="brand-card p-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Previous Call Sheets ({callSheets.length})</div>
            {callSheets.slice(-3).reverse().map(cs => (
              <div key={cs.id} className="text-xs text-gray-500 py-1 border-b border-gray-50 last:border-0">
                <span className="font-semibold text-gray-700">{cs.title}</span>
                <span className="ml-1 text-gray-400">· {cs.shoot_date || 'no date'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL: Preview + Actions ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-500">Live Preview</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold bg-white border-gray-200 text-gray-600 hover:border-gray-400 transition-all"
            >
              {showPreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
            <button
              onClick={generatePDF}
              disabled={generating}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all',
                generating
                  ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-900 text-white border-gray-900 hover:bg-gray-700'
              )}
            >
              <Download size={14} />
              {generating ? 'Generating…' : 'Generate PDF'}
            </button>
          </div>
        </div>

        {/* Generated banner */}
        {generated && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700 font-semibold">
            ✓ Call sheet saved — "{generated.title}" added to Links tab.
            <button onClick={() => setGenerated(null)} className="ml-auto text-green-400 hover:text-green-600">✕</button>
          </div>
        )}

        {/* Preview */}
        {showPreview && (
          <div
            className="border border-gray-200 rounded-xl overflow-auto bg-gray-100 p-4"
            style={{ maxHeight: '75vh' }}
          >
            {/* Scale to fit the panel */}
            <div style={{ transform: 'scale(0.72)', transformOrigin: 'top left', width: '794px' }}>
              <CallSheetDocument
                ref={previewRef}
                config={{
                  ...config,
                  crew_contacts: docCrewContacts,
                }}
                production={production}
                crew={docCrewContacts}
                cast={docCastContacts}
                links={links}
                brandColor={brandColor}
                brandName={brandName}
              />
            </div>
          </div>
        )}

        {/* When preview hidden: keep hidden ref for PDF capture */}
        {!showPreview && (
          <div style={{ position: 'absolute', left: '-9999px', top: 0, width: '794px', overflow: 'hidden' }}>
            <CallSheetDocument
              ref={previewRef}
              config={{
                ...config,
                crew_contacts: docCrewContacts,
              }}
              production={production}
              crew={docCrewContacts}
              cast={docCastContacts}
              links={links}
              brandColor={brandColor}
              brandName={brandName}
            />
          </div>
        )}
      </div>
    </div>
  );
}
