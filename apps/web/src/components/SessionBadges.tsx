import { SESSION_FORMAT_LABELS, type SessionFormat } from '../lib/sessions';

const FORMAT_STYLES: Record<SessionFormat, string> = {
  KEYNOTE: 'bg-accent-400/20 text-accent-600 ring-accent-500/40',
  TALK: 'bg-baltic-50 text-baltic-800 ring-baltic-200',
  WORKSHOP: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  PANEL: 'bg-violet-50 text-violet-800 ring-violet-200',
  LIGHTNING: 'bg-sky-50 text-sky-800 ring-sky-200',
  BREAK: 'bg-slate-100 text-slate-600 ring-slate-200',
  OTHER: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function FormatBadge({ format, label }: { format: SessionFormat; label?: string | null }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${FORMAT_STYLES[format]}`}
    >
      {label && format === 'OTHER' ? label : SESSION_FORMAT_LABELS[format]}
    </span>
  );
}

export function TagBadge({ tag }: { tag: string }) {
  const tone =
    tag.toLowerCase() === 'sold out'
      ? 'bg-rose-50 text-rose-700 ring-rose-200'
      : 'bg-white text-slate-600 ring-slate-300';
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone}`}
    >
      {tag}
    </span>
  );
}

/** A speaker recognition such as MVP or MCT. */
export function SpeakerBadge({ badge }: { badge: string }) {
  return (
    <span className="inline-flex items-center rounded bg-baltic-900 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
      {badge}
    </span>
  );
}
