import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export { Prisma, PrismaClient } from './generated/prisma/client.js';
export type { Session, SessionSpeaker, Speaker, Ticket } from './generated/prisma/client.js';
export { SessionFormat, TicketStatus, TicketType } from './generated/prisma/enums.js';

/**
 * Builds a Prisma client backed by the `pg` driver adapter.
 *
 * Prisma 7 no longer ships a query engine binary, so the connection is owned by
 * a driver adapter. That also keeps the production container image small.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and point it at your PostgreSQL instance.',
    );
  }

  const adapter = new PrismaPg({
    connectionString,
    // Azure Database for PostgreSQL terminates idle connections fairly
    // aggressively; keep the pool small and recycle it.
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });

  return new PrismaClient({ adapter });
}

let cached: PrismaClient | undefined;

/**
 * Process-wide singleton. Re-using one client (and therefore one pool) matters
 * under `tsx watch` in development and under Container Apps replicas in Azure.
 */
export function getPrisma(): PrismaClient {
  cached ??= createPrismaClient(process.env.DATABASE_URL ?? '');
  return cached;
}

export async function disconnectPrisma(): Promise<void> {
  if (cached) {
    await cached.$disconnect();
    cached = undefined;
  }
}

export { localToUtc, utcToLocalTime } from './event-time.js';
