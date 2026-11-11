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
