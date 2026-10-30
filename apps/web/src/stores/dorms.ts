import { defineStore } from "pinia";
import { api } from "../api";
import type { DormSummary } from "../types";

const STORAGE_KEY = "yudeng.selectedDormId";
let loadPromise: Promise<void> | null = null;

async function fetchDorms(): Promise<{ dorms: DormSummary[] }> {
  try {
    return await api.get<{ dorms: DormSummary[] }>("/dorms");
  } catch (cause) {
    if (cause instanceof Error && cause.message === "未登录") {
      throw cause;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return api.get<{ dorms: DormSummary[] }>("/dorms");
  }
}

export const useDormStore = defineStore("dorms", {
  state: () => ({
    dorms: [] as DormSummary[],
    selectedDormId: localStorage.getItem(STORAGE_KEY) ?? "",
    loading: false,
  }),
  getters: {
    selectedDorm(state): DormSummary | null {
      return (
        state.dorms.find((dorm) => dorm.id === state.selectedDormId) ??
        state.dorms[0] ??
        null
      );
    },
  },
  actions: {
    async load() {
      if (loadPromise) return loadPromise;

      loadPromise = (async () => {
        this.loading = true;

        try {
          const response = await fetchDorms();
          this.dorms = response.dorms;

          if (!this.dorms.some((dorm) => dorm.id === this.selectedDormId)) {
            this.selectedDormId = this.dorms[0]?.id ?? "";
            this.persist();
          }
        } finally {
          this.loading = false;
        }
      })();

      try {
        await loadPromise;
      } finally {
        loadPromise = null;
      }
    },
    select(dormId: string) {
      this.selectedDormId = dormId;
      this.persist();
    },
    persist() {
      if (this.selectedDormId) {
        localStorage.setItem(STORAGE_KEY, this.selectedDormId);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    },
  },
});
