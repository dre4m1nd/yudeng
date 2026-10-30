<template>
  <el-config-provider :locale="zhCn">
    <div v-if="isLogin" class="login-shell">
      <router-view />
    </div>
    <div v-else class="app-shell">
      <a class="skip-link" href="#main-content">跳到主内容</a>
      <aside class="sidebar" :class="{ open: sidebarOpen }" aria-label="主菜单">
        <div class="sidebar-brand">
          <span class="brand-mark">余</span>
          <div class="brand-text">
            <strong>余灯</strong>
            <small>宿舍水电台账</small>
          </div>
        </div>

        <div class="sidebar-dorm">
          <div class="sidebar-label">当前宿舍</div>
          <el-select
            v-model="selectedDormId"
            class="sidebar-dorm-select"
            size="small"
            :placeholder="dormStore.loading ? '加载宿舍中…' : '选择宿舍'"
            :loading="dormStore.loading"
            :disabled="dormOptions.length === 0"
          >
            <el-option
              v-for="dorm in dormOptions"
              :key="dorm.value"
              :label="dorm.label"
              :value="dorm.value"
            />
          </el-select>
        </div>

        <el-menu class="sidebar-menu" :default-active="activePath" router>
          <el-menu-item index="/dorms">
            <el-icon aria-hidden="true"><House /></el-icon>
            <span>宿舍台账</span>
          </el-menu-item>

          <el-menu-item-group title="能耗明细">
            <el-menu-item index="/utility/lighting">
              <el-icon aria-hidden="true"><Sunny /></el-icon>
              <span>照明</span>
              <span class="menu-badge">{{ balanceLabel("LIGHTING") }}</span>
            </el-menu-item>
            <el-menu-item index="/utility/ac">
              <el-icon aria-hidden="true"><WindPower /></el-icon>
              <span>空调</span>
              <span class="menu-badge">{{ balanceLabel("AC") }}</span>
            </el-menu-item>
            <el-menu-item index="/utility/water">
              <el-icon aria-hidden="true"><Pouring /></el-icon>
              <span>水费</span>
              <span class="menu-badge">{{ balanceLabel("WATER") }}</span>
            </el-menu-item>
          </el-menu-item-group>

          <el-menu-item-group title="管理">
            <el-menu-item index="/history">
              <el-icon aria-hidden="true"><Clock /></el-icon>
              <span>历史记录</span>
            </el-menu-item>
            <el-menu-item index="/members">
              <el-icon aria-hidden="true"><User /></el-icon>
              <span>成员总览</span>
            </el-menu-item>
            <el-menu-item index="/alerts">
              <el-icon aria-hidden="true"><Bell /></el-icon>
              <span>告警总览</span>
            </el-menu-item>
            <el-menu-item index="/settings">
              <el-icon aria-hidden="true"><Setting /></el-icon>
              <span>设置</span>
            </el-menu-item>
          </el-menu-item-group>
        </el-menu>

        <div class="sidebar-footer">
          <el-button text class="logout-button" @click="logout">
            <el-icon aria-hidden="true"><SwitchButton /></el-icon>
            <span>退出登录</span>
          </el-button>
        </div>
      </aside>

      <button
        v-if="sidebarOpen"
        type="button"
        class="sidebar-backdrop"
        aria-label="关闭菜单"
        @click="sidebarOpen = false"
      ></button>

      <div class="main-shell">
        <header class="mobile-header">
          <el-button text circle aria-label="打开菜单" @click="sidebarOpen = true">
            <el-icon :size="20" aria-hidden="true"><Menu /></el-icon>
          </el-button>
          <div class="mobile-brand">余灯</div>
          <span class="mobile-dorm">{{ dormStore.selectedDorm?.name ?? "" }}</span>
        </header>
        <main id="main-content" class="app-content" tabindex="-1">
          <router-view />
        </main>
      </div>
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import {
  Bell,
  Clock,
  House,
  Menu,
  Pouring,
  Setting,
  Sunny,
  SwitchButton,
  User,
  WindPower,
} from "@element-plus/icons-vue";
import {
  ElButton,
  ElConfigProvider,
  ElIcon,
  ElMenu,
  ElMenuItem,
  ElMenuItemGroup,
  ElMessage,
  ElOption,
  ElSelect,
} from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { formatYuan } from "./format";
import { useAuthStore } from "./stores/auth";
import { useDormStore } from "./stores/dorms";
import type { UtilityType } from "./types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const dormStore = useDormStore();
const sidebarOpen = ref(false);

const isLogin = computed(() => route.path === "/login");
const activePath = computed(() => route.path);
const dormOptions = computed(() =>
  dormStore.dorms.map((dorm) => ({ label: dorm.name, value: dorm.id })),
);
const selectedDormId = computed({
  get: () => dormStore.selectedDormId,
  set: (value: string) => dormStore.select(value),
});

function balanceLabel(type: UtilityType): string {
  const item = dormStore.selectedDorm?.latest.find((latest) => latest.type === type);
  return item && item.moneyCents !== null ? formatYuan(item.moneyCents) : "—";
}

async function logout() {
  await auth.logout();
  router.push("/login");
}

watch(
  () => route.path,
  () => {
    sidebarOpen.value = false;
  },
);

watch(
  () => auth.authenticated,
  async (authenticated) => {
    if (!authenticated) return;
    try {
      await dormStore.load();
    } catch {
      ElMessage.error("宿舍列表加载失败，请稍后刷新");
    }
  },
  { immediate: true },
);
</script>
