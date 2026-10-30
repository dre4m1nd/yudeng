<template>
  <div>
    <div class="page-head">
      <div>
        <h1>历史记录</h1>
        <p>{{ dormStore.selectedDorm?.name ?? "请选择宿舍" }} · 分页查询往期余额快照</p>
      </div>
      <div class="head-actions">
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
        <div class="toolbar">
          <el-select
            v-model="accountId"
            placeholder="全部账户"
            clearable
            style="width: 180px"
          >
            <el-option
              v-for="account in accounts"
              :key="account.id"
              :label="account.displayName"
              :value="account.id"
            />
          </el-select>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            clearable
            style="width: 280px"
          />
          <el-button text @click="clearFilters">清空筛选</el-button>
          <span class="toolbar-spacer" />
          <span class="muted">共 {{ total }} 条记录</span>
        </div>

        <el-table :data="items" v-loading="loading" size="small" class="data-table">
          <el-table-column label="抓取时间" width="170">
            <template #default="{ row }">{{ formatFullDateTime(row.capturedAt) }}</template>
          </el-table-column>
          <el-table-column prop="accountName" label="账户" width="110" />
          <el-table-column label="余额" width="110">
            <template #default="{ row }">{{ formatYuan(row.moneyCents) }}</template>
          </el-table-column>
          <el-table-column label="剩余量" width="120">
            <template #default="{ row }">
              {{ formatVolume(row.volumeHundredths, row.accountUnit) }}
            </template>
          </el-table-column>
          <el-table-column label="学校更新时间" width="170">
            <template #default="{ row }">{{ formatFullDateTime(row.schoolUpdatedAt) }}</template>
          </el-table-column>
        </el-table>

        <el-pagination
          class="pagination-row"
          :current-page="page"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  ElAlert,
  ElButton,
  ElDatePicker,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
} from "element-plus";
import { onMounted, ref, watch } from "vue";
import { api } from "../api";
import { useUrlState } from "../composables/useUrlState";
import { formatFullDateTime, formatVolume, formatYuan } from "../format";
import { useDormStore } from "../stores/dorms";
import type {
  Account,
  Dashboard,
  Paginated,
  SnapshotRecord,
} from "../types";

const dormStore = useDormStore();
const accounts = ref<Account[]>([]);
const accountId = ref<string | undefined>(undefined);
const dateRange = ref<[Date, Date] | null>(null);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const { read, write } = useUrlState();
const items = ref<SnapshotRecord[]>([]);
const loading = ref(false);
const error = ref("");

async function loadAccounts() {
  const dormId = dormStore.selectedDormId;
  if (!dormId) {
    accounts.value = [];
    return;
  }

  const dashboard = await api.get<Dashboard>(`/dorms/${dormId}/dashboard`);
  accounts.value = dashboard.accounts;
}

async function load() {
  const dormId = dormStore.selectedDormId;
  if (!dormId) return;

  loading.value = true;
  error.value = "";

  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize.value),
    });

    if (accountId.value) {
      params.set("accountId", accountId.value);
    }

    if (dateRange.value) {
      const [from, to] = dateRange.value;
      params.set("from", from.toISOString());
      params.set(
        "to",
        new Date(
          to.getFullYear(),
          to.getMonth(),
          to.getDate(),
          23,
          59,
          59,
          999,
        ).toISOString(),
      );
    }

    const response = await api.get<Paginated<SnapshotRecord>>(
      `/dorms/${dormId}/snapshots?${params.toString()}`,
    );
    items.value = response.items;
    total.value = response.total;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "加载失败";
  } finally {
    loading.value = false;
  }
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

function clearFilters() {
  accountId.value = undefined;
  dateRange.value = null;
}

watch(
  () => dormStore.selectedDormId,
  async () => {
    page.value = 1;

    if (!dormStore.selectedDormId) {
      accounts.value = [];
      items.value = [];
      total.value = 0;
      return;
    }

    try {
      await loadAccounts();
      await load();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "加载失败";
    }
  },
);

watch([accountId, dateRange], () => {
  page.value = 1;
  write({
    page: undefined,
    account: accountId.value,
    from: dateRange.value ? dateRange.value[0].toISOString() : undefined,
    to: dateRange.value ? dateRange.value[1].toISOString() : undefined,
  });
  void load();
});

onMounted(async () => {
  const urlPage = Number(read("page"));
  if (Number.isInteger(urlPage) && urlPage > 0) page.value = urlPage;
  const urlSize = Number(read("pageSize"));
  if (Number.isInteger(urlSize) && urlSize > 0) pageSize.value = urlSize;
  const urlAccount = read("account");
  if (urlAccount) accountId.value = urlAccount;
  const urlFrom = read("from");
  const urlTo = read("to");
  if (urlFrom && urlTo) {
    const from = new Date(urlFrom);
    const to = new Date(urlTo);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      dateRange.value = [from, to];
    }
  }

  if (dormStore.dorms.length === 0) {
    try {
      await dormStore.load();
    } catch {
      // The empty state below handles the failure.
    }
  }

  if (dormStore.selectedDormId) {
    await loadAccounts();
    await load();
  }
});
</script>
