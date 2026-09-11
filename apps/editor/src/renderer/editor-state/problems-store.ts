import { create } from 'zustand';

export interface EditorProblem {
  readonly id: number;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}
let nextId = 1;
export const useProblemsStore = create<{
  readonly problems: readonly EditorProblem[];
  dismiss(id: number): void;
}>((set) => ({
  problems: [],
  dismiss: (id) =>
    set((state) => ({ problems: state.problems.filter((problem) => problem.id !== id) })),
}));

export function reportProblem(
  message: string,
  severity: EditorProblem['severity'] = 'error',
): void {
  useProblemsStore.setState((state) => ({
    problems: state.problems.some((problem) => problem.message === message)
      ? state.problems
      : [...state.problems.slice(-49), { id: nextId++, message, severity }],
  }));
}
