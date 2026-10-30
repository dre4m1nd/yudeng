<template>
  <div>
    <div class="page-head">
      <div>
        <h1>{{ title }}</h1>
        <p v-if="dashboard?.dorm">
          {{ dashboard.dorm.name }}
          <span v-if="dashboard.lastRun">
            · 上次抓取 {{ formatFullDateTime(dashboard.lastRun.startedAt) }} ·
            {{ runStatusLabel(dashboard.lastRun.status) }}
          </span>
        </p>
        <p v-else>{{ dormStore.selectedDorm?.name ?? "请选择宿舍" }}</p>
      </div>
      <div class="head-actions">
        <el-button plain :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" :loading="scraping" @click="scrapeNow">立即抓取</el-button>
        <el-button plain @click="router.push('/settings')">告警设置</el-button>
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
      <div class="utility-stat-grid">
        <div class="stat-card">
          <span class="stat-label">当前余额</span>
          <strong class="stat-value">
            {{ account?.latest ? formatYuan(account.latest.moneyCents) : "—" }}
          </strong>
          <span class="stat-hint">
            学校更新 {{ account?.latest ? formatFullDateTime(account.latest.schoolUpdatedAt) : "—" }}
          </span>
        </div>
        <div class="stat-card">
          <span class="stat-label">剩余量</span>
          <strong class="stat-value">
            {{ account?.latest ? formatVolume(account.latest.volumeHundredths, account.unit) : "—" }}
          </strong>
          <span class="stat-hint">账户类型 {{ account?.unit ?? "—" }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">告警阈值</span>
          <strong class="stat-value">
            {{ account?.alertRule ? formatYuan(account.alertRule.moneyThresholdCents) : "未设置" }}
          </strong>
          <span class="stat-hint">
            预计可用 {{ account?.alertRule?.forecastDays ?? "—" }} 天
          </span>
        </div>
        <div class="stat-card">
          <span class="stat-label">运行状态</span>
          <strong class="stat-value stat-tag">
            <el-tag :type="statusInfo.type" effect="light" round>{{ statusInfo.label }}</el-tag>
          </strong>
          <span class="stat-hint">
            <template v-if="openId">
              OpenID {{ openId.mask }} · {{ openIdStatusLabel(openId.status) }}
            </template>
            <template v-else>未配置 OpenID</template>
          </span>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>余额趋势</h2>
            <p>{{ rangeDescription }}</p>
          </div>
          <el-radio-group v-model="range" size="small" @change="loadSeries">
            <el-radio-button value="24h">24 小时</el-radio-button>
            <el-radio-button value="7d">7 天</el-radio-button>
            <el-radio-button value="30d">30 天</el-radio-button>
          </el-radio-group>
        </div>
        <div ref="chartRef" class="chart-box"></div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>最近告警</h2>
            <p>仅显示当前 {{ title }} 账户</p>
          </div>
          <router-link class="text-link" to="/alerts">查看全部</router-link>
        </div>
        <div v-if="recentAlerts.length" class="alert-list">
          <div v-for="alert in recentAlerts" :key="alert.id" class="alert-row alert-row-wide">
            <span class="muted">{{ formatDateTime(alert.createdAt) }}</span>
            <el-tag :type="levelType(alert.level)" size="small" effect="light">
              {{ levelLabel(alert.level) }}
            </el-tag>
            <span class="muted">{{ alertStatusLabel(alert.status) }}</span>
            <span class="muted ellipsis">{{ alert.recipients || "—" }}</span>
          </div>
        </div>
        <div v-else class="muted">当前账户还没有告警记录。</div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>历史明细</h2>
            <p>当前账户的余额快照，可按日期筛选</p>
          </div>
          <div class="toolbar-inline">
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              clearable
              style="width: 270px"
            />
            <el-button text @click="clearDateRange">清空日期</el-button>
          </div>
        </div>

        <el-table :data="snapshots" v-loading="snapshotLoading" size="small" class="data-table">
          <el-table-column label="抓取时间" width="170">
            <template #default="{ row }">{{ formatFullDateTime(row.capturedAt) }}</template>
          </el-table-column>
          <el-table-column label="余额" width="120">
            <template #default="{ row }">{{ formatYuan(row.moneyCents) }}</template>
          </el-table-column>
          <el-table-column label="剩余量" width="140">
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
import * as echarts from "echarts";
import {
  ElAlert,
  ElButton,
  ElDatePicker,
  ElMessage,
  ElPagination,
  ElRadioButton,
  ElRadioGroup,
  ElTable,
  ElTableColumn,
  ElTag,
} from "element-plus";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { useUrlState } from "../composables/useUrlState";
import {
  accountStatus,
  alertStatusLabel,
  formatDateTime,
  formatFullDateTime,
  formatVolume,
  formatYuan,
  levelLabel,
  levelType,
  openIdStatusLabel,
  runStatusLabel,
  utilityLabel,
} from "../format";
import { useDormStore } from "../stores/dorms";
import type {
  Account,
  Dashboard,
  Paginated,
  SnapshotRecord,
  TimeSeries,
  UtilityType,
} from "../types";

const props = defineProps<{ type: UtilityType }>();

const router = useRouter();
const dormStore = useDormStore();
const dashboard = ref<Dashboard | null>(null);
const series = ref<TimeSeries | null>(null);
const range = ref<"24h" | "7d" | "30d">("24h");
const loading = ref(false);
const scraping = ref(false);
const snapshotLoading = ref(false);
const error = ref("");
const chartRef = ref<HTMLDivElement | null>(null);
const snapshots = ref<SnapshotRecord[]>([]);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const dateRange = ref<[Date, Date] | null>(null);
const { read, write } = useUrlState();

let chart: echarts.ECharts | null = null;

const title = computed(() => utilityLabel(props.type));
const account = computed<Account | null>(
  () => dashboard.value?.accounts.find((item) => item.type === props.type) ?? null,
);
const seriesAccount = computed(
  () => series.value?.accounts.find((item) => item.type === props.type) ?? null,
);
const statusInfo = computed(() =>
  account.value ? accountStatus(account.value) : { label: "无数据", type: "info" as const },
);
const openId = computed(() => dashboard.value?.openId ?? null);
const recentAlerts = computed(() =>
  (dashboard.value?.alerts ?? [])
    .filter((alert) => alert.accountId === account.value?.id)
    .slice(0, 5),
);
const rangeDescription = computed(() => {
  switch (range.value) {
    case "24h":
      return "最近 24 小时，单位：元";
    case "30d":
      return "最近 30 天，单位：元";
    default:
      return "最近 7 天，单位：元";
  }
});

function renderChart() {
  if (!chartRef.value) return;

  if (!chart) {
    chart = echarts.init(chartRef.value);
  }

  const points = seriesAccount.value?.points ?? [];
  const color =
    props.type === "LIGHTING"
        ? "#b4622a"
        : props.type === "AC"
          ? "#2f6b7a"
          : "#2f6b4f";

  chart.setOption(
    {
      color: [color],
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: unknown) => `${Number(value).toFixed(2)} 元`,
      },
      grid: { left: 48, right: 20, top: 28, bottom: 30 },
      xAxis: {
        type: "time",
        axisLabel: { color: "#5d6961" },
        axisLine: { lineStyle: { color: "#c8beaa" } },
      },
      yAxis: {
        type: "value",
        name: "元",
        axisLabel: { color: "#5d6961" },
        axisLine: { lineStyle: { color: "#c8beaa" } },
        splitLine: { lineStyle: { color: "#ded6c6" } },
      },
      series: [
        {
          name: title.value,
          type: "line",
          smooth: true,
          showSymbol: points.length <= 10,
          symbolSize: 5,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.08 },
          data: points.map((point) => [point.capturedAt, point.moneyCents / 100]),
        },
      ],
    },
    true,
  );
}

async function loadSeries() {
  const dormId = dormStore.selectedDormId;
  if (!dormId) return;

  try {
    series.value = await api.get<TimeSeries>(
      `/dorms/${dormId}/timeseries?range=${range.value}`,
    );
    await nextTick();
    renderChart();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "加载曲线失败";
  }
}

async function loadSnapshots() {
  const dormId = dormStore.selectedDormId;
  const currentAccount = account.value;

  if (!dormId || !currentAccount) {
    snapshots.value = [];
    total.value = 0;
    return;
  }

  snapshotLoading.value = true;

  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize.value),
      accountId: currentAccount.id,
    });

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
    snapshots.value = response.items;
    total.value = response.total;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "加载历史记录失败";
  } finally {
    snapshotLoading.value = false;
  }
}

async function load() {
  const dormId = dormStore.selectedDormId;

  if (!dormId) {
    dashboard.value = null;
    series.value = null;
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    const [dashboardData, seriesData] = await Promise.all([
      api.get<Dashboard>(`/dorms/${dormId}/dashboard`),
      api.get<TimeSeries>(`/dorms/${dormId}/timeseries?range=${range.value}`),
    ]);
    dashboard.value = dashboardData;
    series.value = seriesData;
    await nextTick();
    renderChart();
    await loadSnapshots();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function scrapeNow() {
  const dormId = dormStore.selectedDormId;
  if (!dormId) return;

  scraping.value = true;
  error.value = "";

  try {
    const result = await api.post<{ skipped?: boolean; reason?: string }>("/scrape/run", {
      dormId,
    });
    ElMessage.success(result.skipped ? result.reason ?? "已有任务在运行" : "抓取完成");
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "抓取失败";
    ElMessage.error(error.value);
  } finally {
    scraping.value = false;
  }
}

function onPageChange(value: number) {
  page.value = value;
  write({ page: String(value) });
  void loadSnapshots();
}

function onPageSizeChange(value: number) {
  pageSize.value = value;
  page.value = 1;
  write({ page: undefined, pageSize: String(value) });
  void loadSnapshots();
}

function clearDateRange() {
  dateRange.value = null;
}

function handleResize() {
  chart?.resize();
}

watch(
  () => dormStore.selectedDormId,
  async () => {
    page.value = 1;
    dateRange.value = null;
    await load();
  },
);

watch(
  () => props.type,
  async () => {
    page.value = 1;
    dateRange.value = null;
    await load();
  },
);

watch(dateRange, () => {
  page.value = 1;
  write({
    page: undefined,
    from: dateRange.value ? dateRange.value[0].toISOString() : undefined,
    to: dateRange.value ? dateRange.value[1].toISOString() : undefined,
  });
  void loadSnapshots();
});

watch(range, () => {
  write({ range: range.value });
});

onMounted(async () => {
  const urlRange = read("range");
  if (urlRange === "24h" || urlRange === "7d" || urlRange === "30d") {
    range.value = urlRange;
  }
  const urlPage = Number(read("page"));
  if (Number.isInteger(urlPage) && urlPage > 0) page.value = urlPage;
  const urlSize = Number(read("pageSize"));
  if (Number.isInteger(urlSize) && urlSize > 0) pageSize.value = urlSize;
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
    await load();
  }

  window.addEventListener("resize", handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  chart?.dispose();
  chart = null;
});
</script>
