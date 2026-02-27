import { createStore } from "zustand/vanilla";
import { useStore } from "zustand/react";

export interface BudgetStoreState {
  perRequestMaxAtomic: string | null;
  sessionBudgetAtomic: string | null;
  sessionSpentAtomic: string;
  setPerRequestMaxAtomic: (value: string | null) => void;
  setSessionBudgetAtomic: (value: string | null) => void;
  setSessionSpentAtomic: (value: string) => void;
  addSpentAtomic: (value: string) => void;
  resetSessionSpent: () => void;
}

export const budgetStore = createStore<BudgetStoreState>(set => ({
  perRequestMaxAtomic: "50000",
  sessionBudgetAtomic: "5000000",
  sessionSpentAtomic: "0",
  setPerRequestMaxAtomic: (value: string | null) =>
    set(state => ({ ...state, perRequestMaxAtomic: value })),
  setSessionBudgetAtomic: (value: string | null) =>
    set(state => ({ ...state, sessionBudgetAtomic: value })),
  setSessionSpentAtomic: (value: string) => set(state => ({ ...state, sessionSpentAtomic: value })),
  addSpentAtomic: (value: string) =>
    set(state => {
      const current = BigInt(state.sessionSpentAtomic || "0");
      const increment = BigInt(value);
      const updated = (current + increment).toString();
      return { ...state, sessionSpentAtomic: updated };
    }),
  resetSessionSpent: () => set(state => ({ ...state, sessionSpentAtomic: "0" })),
}));

export const useBudgetStore = <T>(selector: (state: BudgetStoreState) => T) =>
  useStore(budgetStore, selector);
