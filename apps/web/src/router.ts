import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "./stores/auth";
import AlertsView from "./views/AlertsView.vue";
import DormsView from "./views/DormsView.vue";
import HistoryView from "./views/HistoryView.vue";
import LoginView from "./views/LoginView.vue";
import MembersView from "./views/MembersView.vue";
import SettingsView from "./views/SettingsView.vue";
import UtilityView from "./views/UtilityView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: LoginView, meta: { public: true } },
    { path: "/", redirect: "/dorms" },
    { path: "/dorms", component: DormsView },
    {
      path: "/utility/lighting",
      component: UtilityView,
      props: { type: "LIGHTING" as const },
    },
    {
      path: "/utility/ac",
      component: UtilityView,
      props: { type: "AC" as const },
    },
    {
      path: "/utility/water",
      component: UtilityView,
      props: { type: "WATER" as const },
    },
    { path: "/history", component: HistoryView },
    { path: "/members", component: MembersView },
    { path: "/alerts", component: AlertsView },
    { path: "/settings", component: SettingsView },
    { path: "/dashboard", redirect: "/dorms" },
    { path: "/students", redirect: "/members" },
    { path: "/tokens", redirect: "/settings" },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();

  if (to.meta.public) {
    if (to.path === "/login" && auth.authenticated) return "/";
    return true;
  }

  if (!auth.authenticated) return "/login";
  return true;
});

export default router;
