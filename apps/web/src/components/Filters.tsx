import {
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  type TicketStatus,
  type TicketType,
} from '../lib/api';

interface FiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statuses: TicketStatus[];
  onStatusesChange: (value: TicketStatus[]) => void;
  ticketType: TicketType | '';
  onTicketTypeChange: (value: TicketType | '') => void;
  onReset: () => void;
  hasFilters: boolean;
}

export function Filters({
  search,
  onSearchChange,
  statuses,
  onStatusesChange,
  ticketType,
  onTicketTypeChange,
  onReset,
  hasFilters,
}: FiltersProps) {
  const toggleStatus = (status: TicketStatus) => {
    onStatusesChange(
      statuses.includes(status) ? statuses.filter((s) => s !== status) : [...statuses, status],
    );
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 3.23 9.95l3.16 3.16a.75.75 0 1 0 1.06-1.06l-3.16-3.16A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name, email or BS26-00042"
            aria-label="Search tickets"
            className="field pl-9"
          />
        </div>

        <select
          value={ticketType}
          onChange={(event) => onTicketTypeChange(event.target.value as TicketType | '')}
          aria-label="Filter by ticket type"
          className="field sm:w-44"
        >
          <option value="">All ticket types</option>
          {TICKET_TYPES.map((type) => (
            <option key={type} value={type}>
              {TICKET_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {TICKET_STATUSES.map((status) => {
          const active = statuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              aria-pressed={active}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-baltic-600 bg-baltic-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
              }`}
            >
              {TICKET_STATUS_LABELS[status]}
            </button>
          );
        })}

        {hasFilters && (
          <button
            type="button"
            onClick={onReset}
            className="cursor-pointer px-2 py-1.5 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
