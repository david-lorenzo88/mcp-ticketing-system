import { TICKET_TYPE_LABELS, type Ticket } from '../lib/api';
import { formatDate, formatDateTime, formatMoney, initials } from '../lib/format';
import { StatusBadge, TypeBadge } from './Badge';

export interface TicketActions {
  onEdit: (ticket: Ticket) => void;
  onCancel: (ticket: Ticket) => void;
  onCheckIn: (ticket: Ticket) => void;
  onReinstate: (ticket: Ticket) => void;
}

interface TicketTableProps extends TicketActions {
  tickets: Ticket[];
  loading: boolean;
  busyId: string | null;
}

/** Per-row buttons. Which ones apply depends on where the ticket is in its lifecycle. */
function RowActions({
  ticket,
  busy,
  onEdit,
  onCancel,
  onCheckIn,
  onReinstate,
}: TicketActions & { ticket: Ticket; busy: boolean }) {
  const cancelled = ticket.status === 'CANCELLED';

  return (
    <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
      {!cancelled && ticket.status !== 'CHECKED_IN' && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => onCheckIn(ticket)}
        >
          Check in
        </button>
      )}

      {cancelled ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => onReinstate(ticket)}
        >
          Reinstate
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => onEdit(ticket)}
        >
          Edit
        </button>
      )}

      {!cancelled && (
        <button
          type="button"
          className="btn btn-sm text-rose-700 hover:bg-rose-50"
          disabled={busy}
          onClick={() => onCancel(ticket)}
        >
          Cancel
        </button>
      )}
    </div>
  );
}

export function TicketTable({ tickets, loading, busyId, ...actions }: TicketTableProps) {
  if (loading) {
    return (
      <div className="card divide-y divide-slate-100">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex animate-pulse items-center gap-4 px-4 py-4">
            <div className="h-9 w-9 rounded-full bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-40 rounded bg-slate-200" />
              <div className="h-3 w-24 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 px-6 py-16 text-center">
        <svg viewBox="0 0 24 24" className="h-10 w-10 text-slate-300" fill="currentColor" aria-hidden="true">
          <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V6Z" />
        </svg>
        <p className="font-medium text-slate-700">No tickets match these filters</p>
        <p className="text-sm text-slate-500">
          Adjust the search or filters, or issue a new ticket.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Desktop: table */}
      <table className="hidden w-full text-left text-sm lg:table">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Attendee</th>
            <th scope="col" className="px-4 py-3 font-medium">Ticket</th>
            <th scope="col" className="px-4 py-3 font-medium">Type</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Price</th>
            <th scope="col" className="w-px px-4 py-3 text-right font-medium whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tickets.map((ticket) => (
            <tr key={ticket.id} className="hover:bg-slate-50/70">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-baltic-100 text-xs font-semibold text-baltic-800">
                    {initials(ticket.firstName, ticket.lastName)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900">{ticket.fullName}</div>
                    <div className="truncate text-xs text-slate-500">
                      {ticket.email}
                      {ticket.company ? ` · ${ticket.company}` : ''}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-mono text-xs whitespace-nowrap text-slate-700">{ticket.ticketNumber}</div>
                <div className="text-xs whitespace-nowrap text-slate-400">
                  {ticket.status === 'CHECKED_IN'
                    ? `In at ${formatDateTime(ticket.checkedInAt)}`
                    : formatDate(ticket.createdAt)}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap"><TypeBadge ticketType={ticket.ticketType} /></td>
              <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={ticket.status} /></td>
              <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-slate-700">
                {formatMoney(ticket.priceAmount, ticket.currency)}
              </td>
              <td className="w-px px-4 py-3 whitespace-nowrap">
                <RowActions ticket={ticket} busy={busyId === ticket.id} {...actions} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile / tablet: stacked cards */}
      <ul className="divide-y divide-slate-100 lg:hidden">
        {tickets.map((ticket) => (
          <li key={ticket.id} className="space-y-3 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{ticket.fullName}</div>
                <div className="truncate text-xs text-slate-500">{ticket.email}</div>
                {ticket.company && (
                  <div className="truncate text-xs text-slate-500">{ticket.company}</div>
                )}
              </div>
              <StatusBadge status={ticket.status} />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="font-mono text-slate-700">{ticket.ticketNumber}</span>
              <span>{TICKET_TYPE_LABELS[ticket.ticketType]}</span>
              <span className="tabular-nums">
                {formatMoney(ticket.priceAmount, ticket.currency)}
              </span>
            </div>

            <RowActions ticket={ticket} busy={busyId === ticket.id} {...actions} />
          </li>
        ))}
      </ul>
    </div>
  );
}
