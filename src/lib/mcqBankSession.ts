/**
 * mcqBankSession.ts — Persist and restore the full MCQ Bank UI position.
 *
 * Saved state survives page refresh so the user lands back exactly where they were:
 *  - Which department is open (fullScreenDept)
 *  - Which SOP is open (bankId + sopId + sopCode)
 *  - Which question was visible (questionIndex)
 *  - Current page, scroll position, search term, filter value, view modes
 */

const KEY = 'mcq-bank-session-v2';

export interface MCQBankSession {
  /** Department name */
  deptName?: string;
  /** Bank _id */
  bankId?: string;
  /** sopId (foreign key on SOP model) */
  sopId?: string;
  /** e.g. "QAIC-28-04" */
  sopCode?: string;
  sopName?: string;
  language?: string;
  /** 0-based index of the last visible question */
  questionIndex?: number;
  /** Pagination page inside the dept SOP table */
  currentPage?: number;
  /** Scroll Y position inside the MCQ question list */
  scrollY?: number;
  /** Search term typed in the main search box */
  searchTerm?: string;
  /** Filter value (all | checked | pending | similar | reviewed) */
  filter?: string;
  /** tree | grid */
  viewMode?: string;
  /** table | file — table view vs file view inside dept modal */
  sopViewMode?: string;
  /** Timestamp the session was saved */
  savedAt?: number;
}

export function saveSession(partial: Partial<MCQBankSession>): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadSession() ?? {};
    const merged: MCQBankSession = {
      ...existing,
      ...partial,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // Quota exceeded — non-fatal
  }
}

export function loadSession(): MCQBankSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: MCQBankSession = JSON.parse(raw);
    // Expire sessions older than 2 hours (user probably left the machine)
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    if (parsed.savedAt && Date.now() - parsed.savedAt > TWO_HOURS) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Non-fatal
  }
}

/** Create a debounced saver — delays write by `ms` ms to avoid thrashing localStorage on scroll. */
export function createDebouncedSave(ms = 500): (partial: Partial<MCQBankSession>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (partial) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => saveSession(partial), ms);
  };
}
