<template>
  <div>
    <div class="page-head">
      <div>
        <h1>告警总览</h1>
        <p>按宿舍汇总余额告警、抓取失败和 OpenID 失效</p>
      </div>
      <div class="head-actions">
        <el-button plain :loading="loading" @click="loadAll">刷新</el-button>
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

    <div class="summary-grid summary-grid-auto">
      <button
        type="button"
        class="summary-card summary-card-button"
        :class="{ active: !dormFilter }"
        @click="clearFilter"
      >
        <span class="summary-label">全部宿舍</span>
        <strong>{{ totalAlerts }}</strong>
        <span class="summary-hint">严重 {{ totalCritical }} 条</span>
      </button>
      <button
        v-for="item in summary"
        :key="item.dormId"
        type="button"
        class="summary-card summary-card-button"
        :class="{ active: dormFilter === item.dormId }"
        @click="setFilter(item.dormId)"
      >
        <span class="summary-label">{{ item.dormName }}</span>
        <strong :class="{ 'danger-text': item.criticalCount > 0 }">{{ item.total }}</strong>
        <span class="summary-hint">
          严重 {{ item.criticalCount }} 条 · 最近
          {{ item.lastAlertAt ? formatDateTime(item.lastAlertAt) : "无" }}
        </span>
      </button>
    </div>

    <div class="panel">
      <div class="toolbar">
        <el-select
          v-model="dormFilter"
          placeholder="全部宿舍"
          clearable
          style="width: 200px"
        >
          <el-option
            v-for="dorm in dormStore.dorms"
            :key="dorm.id"
            :label="dorm.name"
            :value="dorm.id"
          />
        </el-select>
        <span class="toolbar-spacer" />
        <span class="muted">共 {{ total }} 条告警</span>
      </div>

      <el-table :data="items" v-loading="loading" size="small" class="data-table">
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatFullDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="宿舍" width="150">
          <template #default="{ row }">{{ row.dormName ?? "—" }}</template>
        </el-table-column>
        <el-table-column label="级别" width="110">
          <template #default="{ row }">
            <el-tag :type="levelType(row.level)" size="small" effect="light">
              {{ levelLabel(row.level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="账户" min-width="120">
          <template #default="{ row }">{{ row.accountName ?? "系统" }}</template>
        </el-table-column>
        <el-table-column label="数值" width="100">
          <template #default="{ row }">
            <span v-if="row.valueCents !== null">{{ formatYuan(row.valueCents) }}</span>
            <span v-else-if="row.valueHundredths !== null">
              {{ (row.valueHundredths / 100).toFixed(2) }}
            </span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">{{ alertStatusLabel(row.status) }}</template>
        </el-table-column>
        <el-table-column prop="recipients" label="收件人" min-width="200" show-overflow-tooltip />
        <el-table-column label="错误" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.error ?? "—" }}</template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="pagination-row"
        :current-page="page"
        :page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="onPageChange"
        @size-change="onPageSizeChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ElAlert,
  ElButton,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import { useUrlState } from "../composables/useUrlState";
import { api } from "../api";
import {
  alertStatusLabel,
  formatDateTime,
  formatFullDateTime,
  formatYuan,
  levelLabel,
  levelType,
} from "../format";
import { useDormStore } from "../stores/dorms";
import type { AlertDormSummary, AlertEvent, Paginated } from "../types";

const dormStore = useDormStore();
const items = ref<AlertEvent[]>([]);
const summary = ref<AlertDormSummary[]>([]);
const loading = ref(false);
const error = ref("");
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const dormFilter = ref<string | undefined>(undefined);
const { read, write } = useUrlState();

const totalAlerts = computed(() =>
  summary.value.reduce((sum, item) => sum + item.total, 0),
);
const totalCritical = computed(() =>
  summary.value.reduce((sum, item) => sum + item.criticalCount, 0),
);

async function loadSummary() {
  const response = await api.get<{ items: AlertDormSummary[] }>("/alerts/summary");
  summary.value = response.items;
}

async function load() {
  loading.value = true;
  error.value = "";

  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize.value),
    });

    if (dormFilter.value) {
      params.set("dormId", dormFilter.value);
    }

    const response = await api.get<Paginated<AlertEvent>>(
      `/alerts?${params.toString()}`,
    );
    items.value = response.items;
    total.value = response.total;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function loadAll() {
  error.value = "";

  try {
    if (dormStore.dorms.length === 0) {
      await dormStore.load();
    }
    await Promise.all([loadSummary(), load()]);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "加载失败";
  }
}

function setFilter(dormId: string) {
  dormFilter.value = dormId;
}

function clearFilter() {
  dormFilter.value = undefined;
}

function onPageChange(value: number) {
  page.value = value;
  write({ page: String(value) });
  void load();
}

function onPageSizeChange(value: number) {
  pageSize.value = value;
  page.value = 1;
  write({ page: undefined, pageSize: String(value) });
  void load();
}

watch(dormFilter, () => {
  page.value = 1;
  write({ page: undefined, dorm: dormFilter.value });
  void load();
});

onMounted(() => {
  const urlPage = Number(read("page"));
  if (Number.isInteger(urlPage) && urlPage > 0) page.value = urlPage;
  const urlSize = Number(read("pageSize"));
  if (Number.isInteger(urlSize) && urlSize > 0) pageSize.value = urlSize;
  const urlDorm = read("dorm");
  if (urlDorm) dormFilter.value = urlDorm;
  void loadAll();
});
</script>
