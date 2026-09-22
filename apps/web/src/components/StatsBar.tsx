import type { TicketStats } from '../lib/api';
import { formatMoney } from '../lib/format';

function Tile({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          accent ? 'text-baltic-700' : 'text-slate-900'
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function StatsBar({ stats }: { stats: TicketStats | null }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card h-[86px] animate-pulse bg-slate-100" />
        ))}
      </div>
    );
  }

  const valid = stats.total - (stats.byStatus.CANCELLED ?? 0);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="Tickets issued"
        value={String(stats.total)}
        hint={`${valid} valid · ${stats.byStatus.CANCELLED ?? 0} cancelled`}
      />
      <Tile
        label="Confirmed"
        value={String(stats.byStatus.CONFIRMED ?? 0)}
        hint={`${stats.byStatus.RESERVED ?? 0} still reserved`}
      />
      <Tile
        label="Checked in"
        value={String(stats.checkedIn)}
        hint={`${stats.admissionRate}% of valid tickets`}
        accent
      />
      <Tile
        label="Revenue"
        value={formatMoney(stats.revenue.amount, stats.revenue.currency)}
        hint="Excludes cancelled tickets"
      />
    </div>
  );
}
