import { z } from 'zod';
import { ValidationError } from './errors.js';

/**
 * Accepts `?status=CONFIRMED`, `?status=CONFIRMED&status=RESERVED` and
 * `?status=CONFIRMED,RESERVED` alike, so the UI and hand-written curl calls
 * can use whichever is convenient.
 */
export function multiValue(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const values = (Array.isArray(raw) ? raw : [raw])
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

/** Turns a zod failure into the API's 400 shape instead of a 500. */
export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(
      'The request body is not valid.',
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    );
  }
  return result.data;
}
