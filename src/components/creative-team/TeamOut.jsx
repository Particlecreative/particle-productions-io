// Who's out on the team (Tomer, 25 Nov 2026: "in My Studio show the team when they're OOO / on vacation / sick") —
// from BambooHR (approved time off with its type, and company holidays). Today first, then the next two weeks.
import { TreePalm, Thermometer, CalendarOff, PartyPopper } from 'lucide-react';
import { initials, colorFor } from '../../lib/hrService';

export const OUT_KIND = {
  vacation: { label: 'Vacation', cls: 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-400/10 dark:text-teal-200 dark:border-teal-400/30', dot: '#14b8a6', icon: TreePalm },
  sick: { label: 'Sick', cls: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-400/10 dark:text-rose-200 dark:border-rose-400/30', dot: '#f43f5e', icon: Thermometer },
  other: { label: 'Out', cls: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-white/5 dark:text-gray-300 dark:border-white/10', dot: '#9ca3af', icon: CalendarOff },
};
const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** People out on a date (for the Week view's day headers). */
export const outOn = (out, d) => (out?.people || []).filter(p => p.start <= d && p.end >= d);
export const holidayOn = (out, d) => (out?.holidays || []).find(h => h.start <= d && h.end >= d) || null;

export function OutDots({ people, max = 4 }) {
  if (!people?.length) return null;
  return (
    <span className="flex -space-x-1">
      {people.slice(0, max).map(p => (
        <span key={`${p.employee_id}${p.start}`} title={`${p.name} — ${p.type || OUT_KIND[p.kind]?.label}`}
          className="w-4 h-4 rounded-full ring-2 ring-white dark:ring-[#1c2028] text-[7px] font-bold text-white flex items-center justify-center" style={{ background: OUT_KIND[p.kind]?.dot || colorFor(p.name) }}>
          {initials(p.name)}
        </span>
      ))}
      {people.length > max && <span className="text-[9px] text-gray-400 pl-1.5">+{people.length - max}</span>}
    </span>
  );
}

export default function TeamOut({ out, today }) {
  if (!out?.connected) return null;
  const now = (out.people || []).filter(p => p.start <= today && p.end >= today);
  const soon = (out.people || []).filter(p => p.start > today).slice(0, 6);
  const hol = (out.holidays || []).filter(h => h.end >= today).slice(0, 2);
  if (!now.length && !soon.length && !hol.length) return null;
  const Chip = ({ p, when }) => {
    const k = OUT_KIND[p.kind] || OUT_KIND.other;
    return (
      <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold pl-1 pr-2.5 py-0.5 rounded-full border ${k.cls}`} title={`${p.name}: ${p.type} ${fmt(p.start)}${p.end !== p.start ? ` – ${fmt(p.end)}` : ''}`}>
        <span className="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: colorFor(p.name) }}>{initials(p.name)}</span>
        {p.name.split(' ')[0]}<k.icon size={11} className="opacity-70" /><span className="font-normal opacity-80">{when}</span>
      </span>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-gray-200 bg-white px-3 py-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Team</span>
      {now.length > 0 && <>
        <span className="text-[11.5px] text-gray-500">Out today</span>
        {now.map(p => <Chip key={`n${p.employee_id}${p.start}`} p={p} when={p.end > today ? `till ${fmt(p.end).split(' ').slice(0, 2).join(' ')}` : 'today'} />)}
      </>}
      {soon.length > 0 && <>
        <span className="text-[11.5px] text-gray-500 ml-1">Coming up</span>
        {soon.map(p => <Chip key={`s${p.employee_id}${p.start}`} p={p} when={fmt(p.start).split(' ').slice(0, 2).join(' ')} />)}
      </>}
      {hol.map(h => <span key={h.start} className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200"><PartyPopper size={11} />{h.name} · {fmt(h.start).split(' ').slice(0, 2).join(' ')}</span>)}
    </div>
  );
}
