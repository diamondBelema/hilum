const KEY = "eh-attempt";

export type ActiveAttempt = { id: string; course: string };

export function readActiveAttempt(): ActiveAttempt | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ActiveAttempt> | null;
    if (!value || typeof value.id !== "string" || typeof value.course !== "string") return null;
    return { id: value.id, course: value.course };
  } catch {
    return null;
  }
}

export function setActiveAttempt(value: ActiveAttempt): void {
  localStorage.setItem(KEY, JSON.stringify(value));
}

export function clearActiveAttempt(): void {
  localStorage.removeItem(KEY);
}
