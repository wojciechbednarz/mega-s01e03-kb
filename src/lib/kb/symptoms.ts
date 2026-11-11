// What a report says happened to its date, read from the body, not from the tenant or the subject.
// causes.ts files a report by WHO sent it; decision 0001 merges by SUBJECT. Neither reads the body.
// This file reads the body: it finds the dates the reporter wrote and compares them.
import type { Report } from '#lib/kb/causes';

export type Symptom = 'swap' | 'one-day' | 'no-date' | 'other';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];

export type DayMonth = { day: number; month: number };

// "7 April", "Tuesday 12 May" → { day, month }. Every date in the body, in order.
export function datesIn(body: string): DayMonth[] {
  const found: DayMonth[] = [];
  const re = /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;
  for (const m of body.matchAll(re)) {
    found.push({ day: Number(m[1]), month: MONTHS.indexOf(m[2].toLowerCase()) + 1 });
  }
  return found;
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// "Tuesday … showed as Monday" → 1: how many days apart the first two weekdays named are.
export function weekdayShift(body: string): number | null {
  const named = [...body.toLowerCase().matchAll(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g)]
    .map((m) => WEEKDAYS.indexOf(m[1]));
  if (named.length < 2) return null;
  const gap = Math.abs(named[0] - named[1]);
  return Math.min(gap, 7 - gap);
}

// swap:    the two dates are each other with day and month exchanged (7 April ↔ 4 July).
// one-day: the same month, one day apart (12 May ↔ 11 May), or the body says "one day off".
// no-date: the body names no date to compare.
// other:   dates that are neither.
export function symptomOf(r: Pick<Report, 'body'>): Symptom {
  const d = datesIn(r.body);
  if (d.length >= 2) {
    const [a, b] = d;
    if (a.day === b.month && a.month === b.day) return 'swap';
    if (a.month === b.month && Math.abs(a.day - b.day) === 1) return 'one-day';
    return 'other';
  }
  if (/\bone day off\b/i.test(r.body)) return 'one-day';
  // "Tuesday 6 October showed as Monday": one date, its weekday moved by one.
  if (d.length === 1 && weekdayShift(r.body) === 1) return 'one-day';
  // Anything else ("Our October bookings came through for January", "the wrong day") names no
  // pair of dates to compare. A test can't decide it; a person reads it.
  return 'no-date';
}

// ── Placing every report: strongest evidence first ─────────────────────────────────────────
// 1. text     the dates in the body (symptomOf): proof.
// 2. desk     the desk's own record (desk-notes.json): people read it that way.
// 3. inferred last resort, for reports 1 and 2 left open: what the reports from the same tenant
//             through the same channel show. It describes the customer, not the report, so it
//             runs last and says so. Needs MIN_SIBLINGS placed siblings, MIN_SHARE of them alike.
export const MIN_SIBLINGS = 5;
export const MIN_SHARE = 0.9;

export type Evidence = 'text' | 'desk' | 'inferred' | 'none';
export type Placed = { symptom: Symptom; evidence: Evidence; basis?: string };

export function place(
  reports: Report[],
  deskOneDay: readonly string[],
): Map<string, Placed> {
  const out = new Map<string, Placed>();
  for (const r of reports) {
    const s = symptomOf(r);
    if (s === 'swap' || s === 'one-day') out.set(r.id, { symptom: s, evidence: 'text' });
    else if (deskOneDay.includes(r.id)) out.set(r.id, { symptom: 'one-day', evidence: 'desk' });
  }
  for (const r of reports) {
    if (out.has(r.id)) continue;
    const siblings = reports.filter(
      // Only siblings placed by text or desk: an inference never feeds another inference.
      (o) => o.id !== r.id && o.tenant === r.tenant && o.channel === r.channel &&
        (out.get(o.id)?.evidence === 'text' || out.get(o.id)?.evidence === 'desk'),
    );
    const counts = new Map<Symptom, number>();
    for (const o of siblings) {
      const s = out.get(o.id)!.symptom;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['no-date', 0];
    if (siblings.length >= MIN_SIBLINGS && n / siblings.length >= MIN_SHARE) {
      out.set(r.id, {
        symptom: top,
        evidence: 'inferred',
        basis: `${n} of ${siblings.length} ${r.tenant} ${r.channel} reports are ${top}`,
      });
    } else {
      out.set(r.id, { symptom: 'no-date', evidence: 'none' });
    }
  }
  return out;
}
