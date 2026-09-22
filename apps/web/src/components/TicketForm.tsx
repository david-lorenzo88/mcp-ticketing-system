import { useState, type FormEvent } from 'react';
import {
  ApiError,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  type Ticket,
  type TicketFormValues,
  type TicketStatus,
  type TicketType,
} from '../lib/api';
import { Modal } from './Modal';

const EMPTY: TicketFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  jobTitle: '',
  ticketType: 'CONFERENCE',
  status: 'RESERVED',
  priceAmount: 0,
  currency: 'PLN',
  dietaryRequirements: '',
  notes: '',
};

function toFormValues(ticket: Ticket): TicketFormValues {
  return {
    firstName: ticket.firstName,
    lastName: ticket.lastName,
    email: ticket.email,
    phone: ticket.phone ?? '',
    company: ticket.company ?? '',
    jobTitle: ticket.jobTitle ?? '',
    ticketType: ticket.ticketType,
    status: ticket.status,
    priceAmount: ticket.priceAmount,
    currency: ticket.currency,
    dietaryRequirements: ticket.dietaryRequirements ?? '',
    notes: ticket.notes ?? '',
  };
}

interface TicketFormProps {
  ticket: Ticket | null;
  onClose: () => void;
  onSubmit: (values: TicketFormValues) => Promise<void>;
}

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function TicketForm({ ticket, onClose, onSubmit }: TicketFormProps) {
  const [values, setValues] = useState<TicketFormValues>(ticket ? toFormValues(ticket) : EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof TicketFormValues>(key: K, value: TicketFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const { [key as string]: _removed, ...rest } = current;
      return rest;
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    try {
      await onSubmit(values);
    } catch (error) {
      // Surface the server's per-field messages next to the inputs they belong to.
      if (error instanceof ApiError && error.fields?.length) {
        setFieldErrors(Object.fromEntries(error.fields.map((f) => [f.field, f.message])));
        setFormError('Please correct the highlighted fields.');
      } else {
        setFormError(error instanceof Error ? error.message : 'Could not save the ticket.');
      }
      setSaving(false);
    }
  };

  return (
    <Modal
      title={ticket ? `Edit ticket ${ticket.ticketNumber}` : 'Issue a new ticket'}
      description={
        ticket
          ? `${ticket.fullName} · created ${new Date(ticket.createdAt).toLocaleDateString('en-GB')}`
          : 'Register an attendee for Baltic Summit.'
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="ticket-form" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : ticket ? 'Save changes' : 'Issue ticket'}
          </button>
        </>
      }
    >
      <form id="ticket-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        {formError && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200 ring-inset">
            {formError}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" error={fieldErrors.firstName} required>
            <input
              id="firstName"
              className="field"
              value={values.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              required
              maxLength={100}
              autoComplete="given-name"
            />
          </Field>

          <Field label="Last name" htmlFor="lastName" error={fieldErrors.lastName} required>
            <input
              id="lastName"
              className="field"
              value={values.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              required
              maxLength={100}
              autoComplete="family-name"
            />
          </Field>

          <Field label="Email" htmlFor="email" error={fieldErrors.email} required>
            <input
              id="email"
              type="email"
              className="field"
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
              required
              maxLength={255}
              autoComplete="email"
            />
          </Field>

          <Field label="Phone" htmlFor="phone" error={fieldErrors.phone}>
            <input
              id="phone"
              type="tel"
              className="field"
              value={values.phone}
              onChange={(e) => set('phone', e.target.value)}
              maxLength={50}
              placeholder="+48 …"
              autoComplete="tel"
            />
          </Field>

          <Field label="Company" htmlFor="company" error={fieldErrors.company}>
            <input
              id="company"
              className="field"
              value={values.company}
              onChange={(e) => set('company', e.target.value)}
              maxLength={150}
              autoComplete="organization"
            />
          </Field>

          <Field label="Job title" htmlFor="jobTitle" error={fieldErrors.jobTitle}>
            <input
              id="jobTitle"
              className="field"
              value={values.jobTitle}
              onChange={(e) => set('jobTitle', e.target.value)}
              maxLength={150}
              autoComplete="organization-title"
            />
          </Field>
        </section>

        <hr className="border-slate-200" />

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Ticket type" htmlFor="ticketType" error={fieldErrors.ticketType}>
            <select
              id="ticketType"
              className="field"
              value={values.ticketType}
              onChange={(e) => set('ticketType', e.target.value as TicketType)}
            >
              {TICKET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TICKET_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Status" htmlFor="status" error={fieldErrors.status}>
            <select
              id="status"
              className="field"
              value={values.status}
              onChange={(e) => set('status', e.target.value as TicketStatus)}
            >
              {TICKET_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {TICKET_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Price" htmlFor="priceAmount" error={fieldErrors.priceAmount}>
            <input
              id="priceAmount"
              type="number"
              min={0}
              step="0.01"
              className="field"
              value={values.priceAmount}
              onChange={(e) => set('priceAmount', e.target.valueAsNumber || 0)}
            />
          </Field>

          <Field label="Currency" htmlFor="currency" error={fieldErrors.currency}>
            <input
              id="currency"
              className="field uppercase"
              value={values.currency}
              onChange={(e) => set('currency', e.target.value.toUpperCase())}
              maxLength={3}
              placeholder="PLN"
            />
          </Field>
        </section>

        <hr className="border-slate-200" />

        <section className="space-y-4">
          <Field
            label="Dietary requirements"
            htmlFor="dietaryRequirements"
            error={fieldErrors.dietaryRequirements}
          >
            <input
              id="dietaryRequirements"
              className="field"
              value={values.dietaryRequirements}
              onChange={(e) => set('dietaryRequirements', e.target.value)}
              maxLength={500}
              placeholder="Vegetarian, gluten-free, …"
            />
          </Field>

          <Field label="Internal notes" htmlFor="notes" error={fieldErrors.notes}>
            <textarea
              id="notes"
              className="field min-h-20 resize-y"
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              maxLength={2000}
            />
          </Field>
        </section>
      </form>
    </Modal>
  );
}
