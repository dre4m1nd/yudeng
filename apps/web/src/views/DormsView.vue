<template>
  <div>
    <div class="page-head">
      <div>
        <h1>宿舍台账</h1>
        <p>一本台账，看清每个宿舍的照明、空调、水费余额与抓取状态</p>
      </div>
      <div class="head-actions">
        <el-button plain :loading="dormStore.loading" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openAdd">添加宿舍</el-button>
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

    <div class="summary-grid summary-grid-3">
      <div class="summary-card">
        <span class="summary-label">在册宿舍</span>
        <strong>{{ dormStore.dorms.length }}</strong>
        <span class="summary-hint">已接入监控</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">OpenID 配置</span>
        <strong>{{ configuredOpenIds }}/{{ dormStore.dorms.length }}</strong>
        <span class="summary-hint">每个宿舍一个 OpenID</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">最近抓取</span>
        <strong class="summary-time">{{ latestRunText }}</strong>
        <span class="summary-hint">每小时自动执行</span>
      </div>
    </div>

    <div v-if="dormStore.dorms.length" class="dorm-grid">
      <div
        v-for="dorm in dormStore.dorms"
        :key="dorm.id"
        class="dorm-card"
        :class="{ selected: dorm.id === dormStore.selectedDormId }"
      >
        <div class="dorm-card-head">
          <div>
            <h3>{{ dorm.name }}</h3>
            <p>{{ dorm.building || "未填写楼栋" }} · {{ dorm.room || "未填写房间" }}</p>
          </div>
          <div class="dorm-card-actions">
            <el-tag
              v-if="dorm.id === dormStore.selectedDormId"
              size="small"
              effect="light"
              round
            >
              当前
            </el-tag>
            <el-button size="small" text type="danger" @click="removeDorm(dorm.id, dorm.name)">
              删除
            </el-button>
          </div>
        </div>

        <div class="dorm-balance-grid">
          <router-link
            v-for="type in utilityTypes"
            :key="type"
            class="dorm-balance-item clickable"
            :to="utilityPath(type)"
            @click="selectDorm(dorm.id)"
          >
            <span>{{ utilityLabel(type) }}</span>
            <strong>{{ moneyFor(dorm, type) }}</strong>
            <small>{{ volumeFor(dorm, type) }}</small>
          </router-link>
        </div>

        <div class="dorm-card-footer">
          <span v-if="dorm.openId">
            OpenID {{ dorm.openId.mask }} · {{ openIdStatusLabel(dorm.openId.status) }}
          </span>
          <span v-else class="danger-text">未配置 OpenID</span>
          <span v-if="dorm.lastRun">最近：{{ formatDateTime(dorm.lastRun.startedAt) }}</span>
          <span v-else>尚未抓取</span>
        </div>

        <div class="dorm-card-buttons">
          <el-button size="small" plain @click="openSettings(dorm.id)">设置</el-button>
          <el-button
            size="small"
            :disabled="dorm.id === dormStore.selectedDormId"
            @click="selectDorm(dorm.id)"
          >
            设为当前
          </el-button>
        </div>
      </div>
    </div>

    <div v-else class="panel">
      <div class="empty-state">还没有宿舍，点击右上角添加一个。</div>
    </div>

    <el-dialog v-model="showAdd" title="添加宿舍" width="480px">
      <el-form label-position="top">
        <el-form-item label="宿舍名称" required>
          <el-input
            v-model="form.name"
            name="dorm-name"
            autocomplete="off"
            placeholder="例如 木棉1栋219"
            @keyup.enter="createDorm"
          />
        </el-form-item>
        <el-form-item label="楼栋">
          <el-input
            v-model="form.building"
            name="dorm-building"
            autocomplete="off"
            placeholder="例如 木棉1栋"
          />
        </el-form-item>
        <el-form-item label="房间号">
          <el-input
            v-model="form.room"
            name="dorm-room"
            inputmode="numeric"
            autocomplete="off"
            placeholder="例如 219"
          />
        </el-form-item>
        <el-form-item label="OpenID" required>
          <el-input
            v-model="form.openId"
            name="dorm-openid"
            autocomplete="off"
            spellcheck="false"
            placeholder="粘贴该宿舍的 OpenID"
            @keyup.enter="createDorm"
          />
          <div class="form-tip">用于查询该宿舍的照明、空调和水费，每个宿舍必须不同。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="createDorm">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { Plus } from "@element-plus/icons-vue";
import {
  ElAlert,
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElTag,
} from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import {
  formatDateTime,
  formatVolume,
  formatYuan,
  openIdStatusLabel,
  utilityLabel,
  utilityPath,
} from "../format";
import { useDormStore } from "../stores/dorms";
import type { DormSummary, ScrapeRun, UtilityType } from "../types";

const dormStore = useDormStore();
const router = useRouter();
const saving = ref(false);
const error = ref("");
const showAdd = ref(false);
const form = reactive({ name: "", building: "", room: "", openId: "" });
const utilityTypes: UtilityType[] = ["LIGHTING", "AC", "WATER"];

const configuredOpenIds = computed(
  () => dormStore.dorms.filter((dorm) => Boolean(dorm.openId)).length,
);
const latestRunText = computed(() => {
  const runs = dormStore.dorms
    .map((dorm) => dorm.lastRun)
    .filter((run): run is ScrapeRun => Boolean(run));

  if (runs.length === 0) return "尚无记录";

  const latest = runs.reduce((current, run) =>
    new Date(run.startedAt) > new Date(current.startedAt) ? run : current,
  );
  return formatDateTime(latest.startedAt);
});

function moneyFor(dorm: DormSummary, type: UtilityType): string {
  const item = dorm.latest.find((latest) => latest.type === type);
  return item && item.moneyCents !== null ? formatYuan(item.moneyCents) : "—";
}

function volumeFor(dorm: DormSummary, type: UtilityType): string {
  const item = dorm.latest.find((latest) => latest.type === type);
  return item && item.volumeHundredths !== null
    ? formatVolume(item.volumeHundredths, item.unit)
    : "—";
}

function selectDorm(dormId: string) {
  dormStore.select(dormId);
}

function openSettings(dormId: string) {
  dormStore.select(dormId);
  void router.push("/settings");
}

function openAdd() {
  form.name = "";
  form.building = "";
  form.room = "";
  form.openId = "";
  showAdd.value = true;
}

async function load() {
  error.value = "";
  try {
    await dormStore.load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "加载失败";
  }
}

async function createDorm() {
  if (!form.name.trim() || !form.openId.trim()) {
    ElMessage.warning("请填写宿舍名称和 OpenID");
    return;
  }

  saving.value = true;

  try {
    const created = await api.post<{ id: string }>("/dorms", {
      name: form.name.trim(),
      building: form.building.trim() || undefined,
      room: form.room.trim() || undefined,
      openId: form.openId.trim(),
    });
    ElMessage.success("宿舍和 OpenID 已添加");
    showAdd.value = false;
    await dormStore.load();
    dormStore.select(created.id);
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : "添加失败");
  } finally {
    saving.value = false;
  }
}

async function removeDorm(dormId: string, name: string) {
  try {
    await ElMessageBox.confirm(
      `确定删除 ${name} 吗？该宿舍的 OpenID、成员、历史记录和告警都会一起删除。`,
      "删除宿舍",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
      },
    );
  } catch {
    return;
  }

  try {
    await api.delete(`/dorms/${dormId}`);
    ElMessage.success("宿舍已删除");
    await dormStore.load();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : "删除失败");
  }
}

onMounted(load);
</script>
