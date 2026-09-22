import 'dotenv/config';
import { getPrisma, disconnectPrisma, TicketStatus, TicketType } from '../src/index.js';

/**
 * Seeds a small but representative set of Baltic Summit tickets so the UI and
 * the MCP tools have something to work with straight after `npm run db:migrate`.
 *
 * Safe to re-run: it does nothing when tickets already exist.
 */
const SAMPLE = [
  {
    firstName: 'Agnieszka', lastName: 'Kowalska', email: 'agnieszka.kowalska@example.com',
    company: 'Northwind Digital', jobTitle: 'Power Platform Architect',
    ticketType: TicketType.FULL_PASS, status: TicketStatus.CONFIRMED,
    priceAmount: '1299.00', phone: '+48 501 234 567',
  },
  {
    firstName: 'Tomasz', lastName: 'Nowak', email: 'tomasz.nowak@example.com',
    company: 'Baltic Logistics', jobTitle: 'Business Analyst',
    ticketType: TicketType.CONFERENCE, status: TicketStatus.CONFIRMED,
    priceAmount: '799.00',
  },
  {
    firstName: 'Marta', lastName: 'Wiśniewska', email: 'marta.wisniewska@example.com',
    company: 'Gdynia Software House', jobTitle: 'Dynamics 365 Consultant',
    ticketType: TicketType.WORKSHOP, status: TicketStatus.RESERVED,
    priceAmount: '549.00', dietaryRequirements: 'Vegetarian',
  },
  {
    firstName: 'Lars', lastName: 'Andersson', email: 'lars.andersson@example.com',
    company: 'Scandi Cloud AB', jobTitle: 'Principal Engineer',
    ticketType: TicketType.SPEAKER, status: TicketStatus.CONFIRMED,
    priceAmount: '0.00', notes: 'Session: Building agents with MCP on Azure.',
  },
  {
    firstName: 'Julia', lastName: 'Lewandowska', email: 'julia.lewandowska@example.com',
    company: 'Politechnika Gdańska', jobTitle: 'Student',
    ticketType: TicketType.STUDENT, status: TicketStatus.CHECKED_IN,
    priceAmount: '149.00',
  },
  {
    firstName: 'Piotr', lastName: 'Zieliński', email: 'piotr.zielinski@example.com',
    company: 'Contoso Poland', jobTitle: 'IT Manager',
    ticketType: TicketType.CONFERENCE, status: TicketStatus.CANCELLED,
    priceAmount: '799.00',
  },
  {
    firstName: 'Ewa', lastName: 'Dąbrowska', email: 'ewa.dabrowska@example.com',
    company: 'Baltic Power Platform Community', jobTitle: 'Community Lead',
    ticketType: TicketType.VOLUNTEER, status: TicketStatus.CONFIRMED,
    priceAmount: '0.00',
  },
  {
    firstName: 'Michał', lastName: 'Kamiński', email: 'michal.kaminski@example.com',
    company: 'Fabrikam Nordic', jobTitle: 'Head of Automation',
    ticketType: TicketType.SPONSOR, status: TicketStatus.CONFIRMED,
    priceAmount: '0.00', notes: 'Gold sponsor — booth 4.',
  },
] as const;

async function main(): Promise<void> {
  const prisma = getPrisma();
  const existing = await prisma.ticket.count();

  if (existing > 0) {
    console.log(`Database already has ${existing} ticket(s) — skipping seed.`);
    return;
  }

  for (const row of SAMPLE) {
    const ticket = await prisma.ticket.create({
      data: {
        ...row,
        checkedInAt: row.status === TicketStatus.CHECKED_IN ? new Date() : null,
        cancelledAt: row.status === TicketStatus.CANCELLED ? new Date() : null,
        cancellationReason:
          row.status === TicketStatus.CANCELLED ? 'Attendee requested a refund.' : null,
      },
    });
    console.log(`  + ${ticket.reference}  ${ticket.firstName} ${ticket.lastName} (${ticket.ticketType})`);
  }

  console.log(`\nSeeded ${SAMPLE.length} tickets.`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
