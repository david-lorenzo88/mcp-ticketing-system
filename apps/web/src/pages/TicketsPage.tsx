import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CancelDialog } from '../components/CancelDialog';
import { Filters } from '../components/Filters';
import { StatsBar } from '../components/StatsBar';
import { TicketForm } from '../components/TicketForm';
import { TicketTable } from '../components/TicketTable';
import { Toaster, type ToastMessage } from '../components/Toast';
import {
  cancelTicket,
  checkInTicket,
  createTicket,
  getStats,
  listTickets,
  reinstateTicket,
  updateTicket,
  type Ticket,
  type TicketFormValues,
  type TicketStats,
  type TicketStatus,
  type TicketType,
} from '../lib/api';

const PAGE_SIZE = 25;

export function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statuses, setStatuses] = useState<TicketStatus[]>([]);
  const [ticketType, setTicketType] = useState<TicketType | ''>('');
  const [page, setPage] = useState(1);

  const [formTicket, setFormTicket] = useState<Ticket | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Ticket | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((tone: ToastMessage['tone'], text: string) => {
    setToasts((current) => [...current, { id: ++toastId.current, tone, text }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  // Keep typing responsive: only query once the user pauses.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Any filter change puts us back on the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statuses, ticketType]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, nextStats] = await Promise.all([
        listTickets({
          search: debouncedSearch || undefined,
          status: statuses.length ? statuses : undefined,
          ticketType: ticketType ? [ticketType] : undefined,
          page,
          pageSize: PAGE_SIZE,
        }),
        getStats(),
      ]);

      setTickets(list.tickets);
      setTotalPages(list.pagination.totalPages);
      setTotal(list.pagination.total);
      setStats(nextStats);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load tickets.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statuses, ticketType, page]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Runs a row action, keeping that row disabled and reporting the outcome. */
  const runAction = async (ticket: Ticket, action: () => Promise<Ticket>, success: string) => {
    setBusyId(ticket.id);
    try {
      await action();
      await refresh();
      notify('success', success);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'That action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmit = async (values: TicketFormValues) => {
    const saved = formTicket
      ? await updateTicket(formTicket.id, values)
      : await createTicket(values);

    setFormOpen(false);
    setFormTicket(null);
    await refresh();
    notify(
      'success',
      formTicket
        ? `Saved changes to ${saved.ticketNumber}.`
        : `Issued ticket ${saved.ticketNumber} for ${saved.fullName}.`,
    );
  };

  const hasFilters = Boolean(debouncedSearch || statuses.length || ticketType);

  const resetFilters = () => {
    setSearch('');
    setStatuses([]);
    setTicketType('');
  };

  const rangeLabel = useMemo(() => {
    if (total === 0) return 'No tickets';
    const first = (page - 1) * PAGE_SIZE + 1;
    const last = Math.min(page * PAGE_SIZE, total);
    return `Showing ${first}–${last} of ${total}`;
  }, [page, total]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Tickets</h1>
          <p className="text-sm text-slate-500">Register attendees, correct details and admit them at the door.</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setFormTicket(null);
            setFormOpen(true);
          }}
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M10 3.5a.75.75 0 0 1 .75.75v5h5a.75.75 0 0 1 0 1.5h-5v5a.75.75 0 0 1-1.5 0v-5h-5a.75.75 0 0 1 0-1.5h5v-5A.75.75 0 0 1 10 3.5Z" />
          </svg>
          New ticket
        </button>
      </div>

      <StatsBar stats={stats} />

      <Filters
        search={search}
        onSearchChange={setSearch}
        statuses={statuses}
        onStatusesChange={setStatuses}
        ticketType={ticketType}
        onTicketTypeChange={setTicketType}
        onReset={resetFilters}
        hasFilters={hasFilters}
      />

      {loadError && (
        <div className="flex items-center justify-between gap-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 ring-inset">
          <span>{loadError}</span>
          <button type="button" className="btn-ghost btn-sm" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      <TicketTable
        tickets={tickets}
        loading={loading}
        busyId={busyId}
        onEdit={(ticket) => {
          setFormTicket(ticket);
          setFormOpen(true);
        }}
        onCancel={setCancelTarget}
        onCheckIn={(ticket) =>
          void runAction(
            ticket,
            () => checkInTicket(ticket.id),
            `Checked in ${ticket.fullName}.`,
          )
        }
        onReinstate={(ticket) =>
          void runAction(
            ticket,
            () => reinstateTicket(ticket.id),
            `Reinstated ${ticket.ticketNumber}.`,
          )
        }
      />

      {total > 0 && (
        <nav className="flex items-center justify-between gap-4" aria-label="Pagination">
          <p className="text-sm text-slate-500">{rangeLabel}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="text-sm tabular-nums text-slate-600">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </nav>
      )}

      {formOpen && (
        <TicketForm
          ticket={formTicket}
          onClose={() => {
            setFormOpen(false);
            setFormTicket(null);
          }}
          onSubmit={handleSubmit}
        />
      )}

      {cancelTarget && (
        <CancelDialog
          ticket={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={async (reason) => {
            const target = cancelTarget;
            await cancelTicket(target.id, reason);
            setCancelTarget(null);
            await refresh();
            notify('success', `Cancelled ${target.ticketNumber}.`);
          }}
        />
      )}

      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
