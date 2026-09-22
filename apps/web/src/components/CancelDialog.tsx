import { useState } from 'react';
import type { Ticket } from '../lib/api';
import { Modal } from './Modal';

interface CancelDialogProps {
  ticket: Ticket;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function CancelDialog({ ticket, onClose, onConfirm }: CancelDialogProps) {
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setWorking(true);
    setError(null);
    try {
      await onConfirm(reason);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not cancel the ticket.');
      setWorking(false);
    }
  };

  return (
    <Modal
      size="md"
      title="Cancel this ticket?"
      description={`${ticket.ticketNumber} · ${ticket.fullName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={working}>
            Keep ticket
          </button>
          <button type="button" className="btn-danger" onClick={confirm} disabled={working}>
            {working ? 'Cancelling…' : 'Cancel ticket'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          The ticket stops being valid for admission. It stays in the system with status{' '}
          <span className="font-medium text-slate-800">Cancelled</span> so the record is auditable,
          and it can be reinstated later.
        </p>

        <div>
          <label className="label" htmlFor="cancel-reason">
            Reason (optional)
          </label>
          <input
            id="cancel-reason"
            className="field"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="Attendee requested a refund"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200 ring-inset">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
