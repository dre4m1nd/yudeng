import { createPinia } from "pinia";
import { createApp } from "vue";
import "element-plus/dist/index.css";
import App from "./App.vue";
import router from "./router";
import { useAuthStore } from "./stores/auth";
import "./style.css";

async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);

  const auth = useAuthStore(pinia);
  await auth.check();

  app.use(router);
  await router.isReady();

  app.mount("#app");
}

bootstrap();
