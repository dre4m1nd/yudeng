<template>
  <div>
    <div class="page-head">
      <div>
        <h1>成员总览</h1>
        <p>成员绑定宿舍后，余额告警会发送到成员邮箱</p>
      </div>
      <div class="head-actions">
        <el-button plain :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openAdd()">添加成员</el-button>
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

    <div v-if="dormCards.length" class="summary-grid summary-grid-auto">
      <button
        v-for="dorm in dormCards"
        :key="dorm.id"
        type="button"
        class="summary-card summary-card-button"
        :class="{ active: dormFilter === dorm.id }"
        @click="toggleDormFilter(dorm.id)"
      >
        <span class="summary-label">{{ dorm.name }}</span>
        <strong>{{ dorm.members.length }}<small> 人</small></strong>
        <span class="summary-hint">
          {{ dorm.openId ? `OpenID ${dorm.openId.mask}` : "未配置 OpenID" }}
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
        <el-input
          v-model="search"
          placeholder="搜索姓名或邮箱"
          clearable
          style="width: 240px"
        />
        <span class="toolbar-spacer" />
        <span class="muted">共 {{ filteredMembers.length }} 位成员</span>
      </div>

      <el-table :data="filteredMembers" v-loading="loading" size="small" class="data-table">
        <el-table-column label="宿舍" width="170">
          <template #default="{ row }">
            <span class="strong">{{ row.dormName }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="email" label="通知邮箱" min-width="220" />
        <el-table-column label="添加时间" width="170">
          <template #default="{ row }">{{ formatFullDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text @click="openMove(asMember(row))">调整宿舍</el-button>
            <el-button size="small" text type="danger" @click="removeMember(asMember(row))">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!loading && filteredMembers.length === 0" class="empty-inline">
        还没有成员。点击右上角添加，并为成员选择一个宿舍。
      </div>
    </div>

    <el-dialog v-model="showAdd" title="添加成员" width="480px">
      <el-form label-position="top">
        <el-form-item label="绑定宿舍" required>
          <el-select v-model="addForm.dormId" placeholder="选择宿舍" style="width: 100%">
            <el-option
              v-for="dorm in dormStore.dorms"
              :key="dorm.id"
              :label="dorm.name"
              :value="dorm.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="姓名" required>
          <el-input v-model="addForm.name" name="member-name" autocomplete="off" placeholder="例如 张三" />
        </el-form-item>
        <el-form-item label="通知邮箱" required>
          <el-input
            v-model="addForm.email"
            name="member-email"
            type="email"
            inputmode="email"
            autocomplete="email"
            spellcheck="false"
            placeholder="student@example.com"
            @keyup.enter="createMember"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="createMember">添加</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showMove" title="调整宿舍" width="420px">
      <p class="muted" style="margin-top: 0">
        把 {{ movingMember?.name ?? "该成员" }} 绑定到：
      </p>
      <el-select v-model="moveDormId" placeholder="选择宿舍" style="width: 100%">
        <el-option
          v-for="dorm in dormStore.dorms"
          :key="dorm.id"
          :label="dorm.name"
          :value="dorm.id"
        />
      </el-select>
      <template #footer>
        <el-button @click="showMove = false">取消</el-button>
        <el-button type="primary" :loading="moving" @click="moveMember">保存</el-button>
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
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
} from "element-plus";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useUrlState } from "../composables/useUrlState";
import { api } from "../api";
import { formatFullDateTime } from "../format";
import { useDormStore } from "../stores/dorms";
import type { MemberRecord } from "../types";

const dormStore = useDormStore();
const members = ref<MemberRecord[]>([]);
const loading = ref(false);
const error = ref("");
const dormFilter = ref<string | undefined>(undefined);
const search = ref("");
const { read, write } = useUrlState();
const showAdd = ref(false);
const saving = ref(false);
const addForm = reactive({ dormId: "", name: "", email: "" });
const showMove = ref(false);
const moving = ref(false);
const movingMember = ref<MemberRecord | null>(null);
const moveDormId = ref("");

const dormCards = computed(() =>
  dormStore.dorms.map((dorm) => ({
    id: dorm.id,
    name: dorm.name,
    openId: dorm.openId,
    members: members.value.filter((member) => member.dormId === dorm.id),
  })),
);

const filteredMembers = computed(() => {
  const keyword = search.value.trim().toLowerCase();

  return members.value.filter((member) => {
    if (dormFilter.value && member.dormId !== dormFilter.value) return false;
    if (!keyword) return true;
    return (
      member.name.toLowerCase().includes(keyword) ||
      member.email.toLowerCase().includes(keyword)
    );
  });
});

function toggleDormFilter(dormId: string) {
  dormFilter.value = dormFilter.value === dormId ? undefined : dormId;
}

watch([dormFilter, search], () => {
  write({ dorm: dormFilter.value, q: search.value || undefined });
});

function asMember(row: unknown): MemberRecord {
  return row as MemberRecord;
}

async function load() {
  loading.value = true;
  error.value = "";

  try {
    if (dormStore.dorms.length === 0) {
      await dormStore.load();
    }

    const response = await api.get<{ items: MemberRecord[] }>("/students");
    members.value = response.items;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

function openAdd(dormId?: string) {
  addForm.dormId = dormId || dormFilter.value || dormStore.selectedDormId || dormStore.dorms[0]?.id || "";
  addForm.name = "";
  addForm.email = "";
  showAdd.value = true;
}

async function createMember() {
  if (!addForm.dormId || !addForm.name.trim() || !addForm.email.trim()) {
    ElMessage.warning("请填写宿舍、姓名和邮箱");
    return;
  }

  saving.value = true;

  try {
    await api.post(`/dorms/${addForm.dormId}/students`, {
      name: addForm.name.trim(),
      email: addForm.email.trim(),
    });
    ElMessage.success("成员已添加并绑定宿舍");
    showAdd.value = false;
    await load();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : "添加失败");
  } finally {
    saving.value = false;
  }
}

function openMove(member: MemberRecord) {
  movingMember.value = member;
  moveDormId.value = member.dormId;
  showMove.value = true;
}

async function moveMember() {
  const member = movingMember.value;

  if (!member || !moveDormId.value) return;

  moving.value = true;

  try {
    await api.patch(`/students/${member.id}`, { dormId: moveDormId.value });
    ElMessage.success("成员宿舍已更新");
    showMove.value = false;
    await load();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : "调整失败");
  } finally {
    moving.value = false;
  }
}

async function removeMember(member: MemberRecord) {
  try {
    await ElMessageBox.confirm(
      `确定删除成员 ${member.name} 吗？删除后不会再收到该宿舍的告警邮件。`,
      "删除成员",
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
    await api.delete(`/students/${member.id}`);
    ElMessage.success("成员已删除");
    await load();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : "删除失败");
  }
}

onMounted(() => {
  const urlDorm = read("dorm");
  if (urlDorm) dormFilter.value = urlDorm;
  const urlSearch = read("q");
  if (urlSearch) search.value = urlSearch;
  void load();
});
</script>
