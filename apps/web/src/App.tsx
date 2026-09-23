import { LogoLockup } from './components/Logo';
import { usePath } from './lib/router';
import { SessionsPage } from './pages/SessionsPage';
import { TicketsPage } from './pages/TicketsPage';

const SECTIONS = [
  { path: '/', label: 'Tickets' },
  { path: '/sessions', label: 'Sessions' },
] as const;

const isSessions = (path: string) => path === '/sessions' || path.startsWith('/sessions/');

export default function App() {
  const [path, navigate] = usePath();
  const active = isSessions(path) ? '/sessions' : '/';

  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-baltic-950">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <LogoLockup />

            <nav aria-label="Sections" className="flex items-center gap-1">
              {SECTIONS.map((section) => {
                const current = active === section.path;
                return (
                  <a
                    key={section.path}
                    href={section.path}
                    aria-current={current ? 'page' : undefined}
                    onClick={(event) => {
                      // Let modified clicks open a new tab as usual.
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                      event.preventDefault();
                      navigate(section.path);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      current
                        ? 'bg-white/10 text-white'
                        : 'text-baltic-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {section.label}
                  </a>
                );
              })}
            </nav>
          </div>

          <div className="hidden text-right text-xs leading-tight text-baltic-300 sm:block">
            <div className="font-medium text-baltic-100">24–26 September 2026</div>
            <div>Pomeranian Science &amp; Technology Park, Gdynia</div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {active === '/sessions' ? (
          <SessionsPage path={path} navigate={navigate} />
        ) : (
          <TicketsPage />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-slate-500 sm:px-6 lg:px-8">
          Baltic Summit ticketing · Agents can manage tickets and browse the agenda through the MCP
          endpoint at{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-700">/mcp</code>.
        </div>
      </footer>
    </div>
  );
}
