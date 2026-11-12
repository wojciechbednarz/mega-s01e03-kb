// The one-day problem's reports: those the desk noted as a one-day move (desk-notes.json) whose own text
// shows one — two dates one day apart, "one day off", or two weekdays one day apart ("Client in Lisbon got
// Tuesday. Client in Toronto got Monday."). A note the text does not support stays with its cause: R-41236
// ("The invite arrived before I made the booking.") names no date and no day, so causes.ts keeps it.
// Hypothesis of claim 39: the desk's note is right about the problem, not about every id on it.
import { symptomOf, weekdayShift } from './symptoms';

export function oneDayMoves(reports: { id: string; body: string }[], deskNoted: readonly string[]): string[] {
  return reports
    .filter((r) => deskNoted.includes(r.id))
    .filter((r) => symptomOf(r) === 'one-day' || weekdayShift(r.body) === 1)
    .map((r) => r.id);
}
