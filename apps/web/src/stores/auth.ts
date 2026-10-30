import { defineStore } from "pinia";
import { api } from "../api";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    checked: false,
    authenticated: false,
  }),
  actions: {
    async check() {
      try {
        const response = await fetch("/api/auth/me", { credentials: "include" });
        this.authenticated = response.ok;
      } catch {
        this.authenticated = false;
      } finally {
        this.checked = true;
      }
    },
    async login(password: string) {
      await api.post("/auth/login", { password });
      this.authenticated = true;
    },
    async logout() {
      try {
        await api.post("/auth/logout", {});
      } finally {
        this.authenticated = false;
      }
    },
  },
});