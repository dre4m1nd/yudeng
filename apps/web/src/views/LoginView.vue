<template>
  <el-card class="login-card" shadow="never">
    <template #header>
      <div class="login-title">
        <span class="brand-mark">余</span>
        <div>
          <strong>进入宿舍余额台账</strong>
          <small>余灯 · 照明 / 空调 / 水费</small>
        </div>
      </div>
    </template>
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="访问密码">
        <el-input
          v-model="password"
          name="password"
          type="password"
          autocomplete="current-password"
          show-password
          placeholder="请输入访问密码"
          @keyup.enter="submit"
        />
      </el-form-item>
      <el-button type="primary" class="login-submit" :loading="loading" @click="submit">
        进入
      </el-button>
    </el-form>
    <el-alert
      v-if="error"
      class="login-error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    />
    <div class="login-hint">密码由服务器环境变量 APP_PASSWORD 配置</div>
  </el-card>
</template>

<script setup lang="ts">
import { ElAlert, ElButton, ElCard, ElForm, ElFormItem, ElInput } from "element-plus";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const password = ref("");
const loading = ref(false);
const error = ref("");
const auth = useAuthStore();
const router = useRouter();

async function submit() {
  if (!password.value) {
    error.value = "请输入密码";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    await auth.login(password.value);
    await router.push("/");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "登录失败";
  } finally {
    loading.value = false;
  }
}
</script>
