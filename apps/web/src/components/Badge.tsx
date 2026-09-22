import {
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  type TicketStatus,
  type TicketType,
} from '../lib/api';

const STATUS_STYLES: Record<TicketStatus, string> = {
  RESERVED: 'bg-amber-50 text-amber-800 ring-amber-200',
  CONFIRMED: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  CHECKED_IN: 'bg-baltic-50 text-baltic-800 ring-baltic-200',
  CANCELLED: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {TICKET_STATUS_LABELS[status]}
    </span>
  );
}

export function TypeBadge({ ticketType }: { ticketType: TicketType }) {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      {TICKET_TYPE_LABELS[ticketType]}
    </span>
  );
}
