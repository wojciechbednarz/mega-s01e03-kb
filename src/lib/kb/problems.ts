// The problems in a big ticket: the desk's causes (causes.ts) plus what the desk itself found while
// working (desk-notes.json). A report the desk noted as a one-day move is that problem, not its cause's:
// the date moves by a day (time zones), it is not swapped, so the parser fix does not stop it.
// One rule for the page, the tickets and the checks.
import { CAUSES, causeOf, type Cause, type Report, type Tenant } from './causes';

export type Problem = Cause | 'one-day-move';
export const PROBLEMS: readonly Problem[] = [...CAUSES, 'one-day-move'];

export function problemOf(r: Pick<Report, 'id' | 'channel'>, t: Tenant | undefined, oneDayMove: readonly string[]): Problem | null {
  if (oneDayMove.includes(r.id)) return 'one-day-move';
  return causeOf(r, t);
}
