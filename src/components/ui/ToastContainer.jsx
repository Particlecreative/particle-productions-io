import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import clsx from 'clsx';

const STYLES = {
  success: { bar: 'bg-green-500',  icon: CheckCircle,     text: 'text-green-700',  bg: 'bg-green-50  border-green-200' },
  error:   { bar: 'bg-red-500',    icon: XCircle,         text: 'text-red-700',    bg: 'bg-red-50    border-red-200'   },
  warning: { bar: 'bg-amber-400',  icon: AlertTriangle,   text: 'text-amber-700',  bg: 'bg-amber-50  border-amber-200' },
  info:    { bar: 'bg-blue-500',   icon: Info,            text: 'text-blue-700',   bg: 'bg-blue-50   border-blue-200'  },
};

function Toast({ toast, onRemove }) {
  const s = STYLES[toast.type] || STYLES.info;
  const Icon = s.icon;

  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), toast.duration ?? 3500);
    return () => clearTimeout(t);
  }, [toast.id, toast.duration, onRemove]);

  return (
    <div className={clsx(
      'flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg min-w-[260px] max-w-[360px]',
      'animate-slide-in relative overflow-hidden',
      s.bg,
    )}>
      <div className={clsx('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl', s.bar)} />
      <Icon size={16} className={clsx('shrink-0 mt-0.5', s.text)} />
      <p className={clsx('text-sm font-medium flex-1 leading-snug', s.text)}>{toast.message}</p>
      <button onClick={() => onRemove(toast.id)} className={clsx('shrink-0 opacity-50 hover:opacity-100 transition-opacity', s.text)}>
        <X size={13} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  useEffect(() => {
    function handler(e) {
      setToasts(t => [...t.slice(-4), e.detail]); // max 5 at once
    }
    window.addEventListener('cp-toast', handler);
    return () => window.removeEventListener('cp-toast', handler);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} onRemove={remove} />
        </div>
      ))}
    </div>
  );
}
