// "or paste a link or the script text" — the second half of the script import box (24 Nov 2026).
// A Google Docs / Slides link works as before; a Claude artifact link explains how to bring its text over; pasted
// text goes to Claude to be split into scenes.
import { Sparkles, FileText, Info } from 'lucide-react';
import clsx from 'clsx';
import { importInput } from '../../lib/scriptImportInput';

export default function ImportLinkOrText({ value, onChange, accent = 'emerald', rounded = 'rounded-2xl' }) {
  const v = importInput(value);
  const multi = v.kind === 'text' && (v.lines > 1 || value.length > 90);
  const ring = accent === 'indigo' ? 'focus:ring-indigo-200 focus:border-indigo-400' : 'focus:ring-emerald-300 focus:border-emerald-400';
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-400 shrink-0">or paste a link or the script text</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={multi ? 7 : 1}
        placeholder="https://docs.google.com/…  — or paste the script itself"
        className={clsx('w-full border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-2 placeholder-gray-300 resize-none leading-relaxed', rounded, ring, multi ? 'overflow-y-auto' : 'overflow-hidden whitespace-nowrap')}
        style={multi ? { maxHeight: 220 } : undefined}
      />
      {v.kind === 'claude' && (
        <div className="flex gap-2.5 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-3 text-[12.5px] text-violet-900 leading-relaxed">
          <Sparkles size={15} className="shrink-0 mt-0.5 text-violet-500" />
          <div>
            <p className="font-semibold">Claude artifact links only open inside claude.ai — paste the text instead.</p>
            <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-violet-800">
              <li>Open the link and click anywhere in the script.</li>
              <li>Press <kbd className="px-1 rounded bg-white border border-violet-200 text-[11px]">⌘ A</kbd> then <kbd className="px-1 rounded bg-white border border-violet-200 text-[11px]">⌘ C</kbd> (Ctrl on Windows).</li>
              <li>Paste it here instead of the link.</li>
            </ol>
            <p className="mt-1.5 text-violet-700/80">A Claude doc can also be exported to Google Docs or PDF — that link or file works here too.</p>
          </div>
        </div>
      )}
      {v.kind === 'text' && (
        <p className="flex items-center gap-1.5 text-[12px] text-gray-500">
          <FileText size={13} className="text-gray-400" />
          Script text · {v.lines} line{v.lines === 1 ? '' : 's'} — Claude splits it into scenes (what we see / what we hear).
        </p>
      )}
      {v.kind === 'short' && (
        <p className="flex items-center gap-1.5 text-[12px] text-gray-400"><Info size={13} /> Paste a Google Docs / Slides link, or the whole script.</p>
      )}
    </>
  );
}
