<template>
  <div>
    <div class="page-head">
      <div>
        <h1>设置</h1>
        <p>{{ dormStore.selectedDorm?.name ?? "请选择宿舍" }} · 告警阈值、通知邮箱和宿舍 OpenID</p>
      </div>
      <div class="head-actions">
        <el-button plain @click="router.push('/members')">成员总览</el-button>
        <el-button plain :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert
      v-if="error"
      class="page-alert"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    />

    <div v-if="!dormStore.selectedDormId" class="panel">
      <div class="empty-state">
        还没有宿舍。<router-link class="text-link" to="/dorms">去添加宿舍</router-link>
      </div>
    </div>

    <template v-else>
      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>告警规则</h2>
            <p>余额低于金额阈值，或按近 7 天消耗预计即将用完时发邮件</p>
          </div>
        </div>

        <div class="settings-grid">
          <div v-for="card in ruleCards" :key="card.account.id" class="metric-card settings-card">
            <h3>{{ card.account.displayName }}</h3>

            <div class="form-row">
              <label>金额阈值（元）</label>
              <el-input-number
                v-model="card.form.moneyThreshold"
                :min="0"
                :precision="2"
                :step="1"
                :controls="false"
                class="rule-input"
              />
            </div>
            <div class="form-row">
              <label>剩余量阈值（{{ card.account.unit }}）</label>
              <el-input-number
                v-model="card.form.volumeThreshold"
                :min="0"
                :precision="2"
                :step="1"
                :controls="false"
                class="rule-input"
              />
            </div>
            <div class="form-row">
              <label>预计可用天数</label>
              <el-input-number
                v-model="card.form.forecastDays"
                :min="1"
                :max="30"
                :controls="false"
                class="rule-input"
              />
            </div>
            <div class="form-row">
              <label>启用告警</label>
              <el-switch v-model="card.form.enabled" />
            </div>
            <div class="form-actions">
              <el-button size="small" type="primary" @click="saveRule(card.account.id)">
                保存
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>通知邮箱</h2>
            <p>不绑定成员，也可以作为宿舍级告警收件人</p>
          </div>
        </div>

        <div v-if="recipients.length" class="recipient-list">
          <div v-for="recipient in recipients" :key="recipient.id" class="student-row">
            <span>{{ recipient.name || "未命名" }}</span>
            <span class="muted">{{ recipient.email }}</span>
            <el-button size="small" text type="danger" @click="removeRecipient(recipient.id)">
              删除
            </el-button>
          </div>
        </div>
        <div v-else class="muted" style="margin-bottom: 12px">还没有额外的通知邮箱。</div>

        <div class="toolbar" style="margin-bottom: 0">
          <el-input v-model="newRecipientName" placeholder="备注" style="width: 130px" />
          <el-input v-model="newRecipientEmail" placeholder="邮箱" style="width: 220px" />
          <el-button :loading="addingRecipient" @click="addRecipient">添加邮箱</el-button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>宿舍 OpenID</h2>
            <p>每个宿舍一个 OpenID，用于抓取该宿舍的照明、空调和水费</p>
          </div>
        </div>

        <div v-if="openId" class="openid-list">
          <div class="openid-row">
            <span class="strong">当前 OpenID</span>
            <span class="mono muted">{{ openId.mask }}</span>
            <el-tag :type="openIdStatusType(openId.status)" size="small" effect="light">
              {{ openIdStatusLabel(openId.status) }}
            </el-tag>
            <span class="muted">最近成功：{{ formatDateTime(openId.lastSuccessAt) }}</span>
          </div>
        </div>
        <div v-else class="muted" style="margin-bottom: 12px">
          尚未配置 OpenID，当前宿舍无法自动抓取。
        </div>

        <div class="toolbar" style="margin-bottom: 0">
          <el-input
            v-model="newOpenId"
            placeholder="粘贴该宿舍的 OpenID"
            style="width: 320px"
            @keyup.enter="saveOpenId"
          />
          <el-button :loading="savingOpenId" @click="saveOpenId">
            {{ openId ? "更新 OpenID" : "保存 OpenID" }}
          </el-button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  ElAlert,
  ElButton,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElMessageBox,
  ElSwitch,
  ElTag,
} from "element-plus";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { formatDateTime, openIdStatusLabel, openIdStatusType } from "../format";
import { useDormStore } from "../stores/dorms";
import type { Account, Dashboard } from "../types";

type RuleForm = {
  moneyThreshold: number | undefined;
  volumeThreshold: number | undefined;
  forecastDays: number | undefined;
  enabled: boolean;
};

type RuleCard = {
  account: Account;
  form: RuleForm;
};

const dormStore = useDormStore();
const router = useRouter();
const dashboard = ref<Dashboard | null>(null);
const loading = ref(false);
const error = ref("");
const forms = reactive<Record<string, RuleForm>>({});
const newRecipientName = ref("");
const newRecipientEmail = ref("");
const addingRecipient = ref(false);
const newOpenId = ref("");
const savingOpenId = ref(false);

const accounts = computed(() => dashboard.value?.accounts ?? []);
const recipients = computed(() => dashboard.value?.recipients ?? []);
const openId = computed(() => dashboard.value?.openId ?? null);
const ruleCards = computed<RuleCard[]>(() =>
  accounts.value.flatMap((account) => {
    const form = forms[account.id];
    return form ? [{ account, form }] : [];
  }),
);

async function load() {
  const dormId = dormStore.selectedDormId;

  if (!dormId) {
    dashboard.value = null;
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    dashboard.value = await api.get<Dashboard>(`/dorms/${dormId}/dashboard`);

    for (const key of Object.keys(forms)) {
      delete forms[key];
    }

    for (const account of dashboard.value.accounts) {
      forms[account.id] = {
        moneyThreshold: (account.alertRule?.moneyThresholdCents ?? 1000) / 100,
        volumeThreshold: account.alertRule?.volumeThresholdHundredths
          ? account.alertRule.volumeThresholdHundredths / 100
          : undefined,
        forecastDays: account.alertRule?.forecastDays ?? 3,
        enabled: account.alertRule?.enabled ?? true,
      };
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function saveRule(accountId: string) {
  const form = forms[accountId];

  if (!form) return;

  try {
    await api.put(`/alert-rules/${accountId}`, {
      moneyThresholdCents: Math.round((form.moneyThreshold ?? 0) * 100),
      volumeThresholdHundredths:
        form.volumeThreshold && form.volumeThreshold > 0
          ? Math.round(form.volumeThreshold * 100)
          : null,
      forecastDays: form.forecastDays ?? 3,
      enabled: form.enabled,
    });
    ElMessage.success("告警规则已保存");
    await load();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : "保存失败");
  }
}

async function addRecipient() {
  const dormId = dormStore.selectedDormId;
  if (!dormId) return;

  if (!newRecipientEmail.value.trim()) {
    ElMessage.warning("请填写邮箱");
    return;
  }

  addingRecipient.value = true;

  try {
    await api.post(`/dorms/${dormId}/recipients`, {
      name: newRecipientName.value.trim() || undefined,
      email: newRecipientEmail.value.trim(),
    });
    ElMessage.success("通知邮箱已添加");
    newRecipientName.value = "";
    newRecipientEmail.value = "";
    await load();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : "添加失败");
  } finally {
    addingRecipient.value = false;
  }
}

async function removeRecipient(id: string) {
  try {
    await ElMessageBox.confirm("确定删除这个通知邮箱吗？", "删除通知邮箱", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });
  } catch {
    return;
  }

  try {
    await api.delete(`/recipients/${id}`);
    await load();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : "删除失败");
  }
}

async function saveOpenId() {
  const dormId = dormStore.selectedDormId;
  if (!dormId) return;

  if (!newOpenId.value.trim()) {
    ElMessage.warning("请粘贴 OpenID");
    return;
  }

  savingOpenId.value = true;

  try {
    await api.put(`/dorms/${dormId}/openid`, {
      openId: newOpenId.value.trim(),
    });
    ElMessage.success("OpenID 已保存");
    newOpenId.value = "";
    await load();
    await dormStore.load();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : "保存失败");
  } finally {
    savingOpenId.value = false;
  }
}

watch(
  () => dormStore.selectedDormId,
  () => {
    void load();
  },
);

onMounted(async () => {
  if (dormStore.dorms.length === 0) {
    try {
      await dormStore.load();
    } catch {
      // The empty state below handles the failure.
    }
  }

  await load();
});
</script>
