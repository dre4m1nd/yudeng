import { useRoute, useRouter } from "vue-router";

/**
 * 把页面筛选状态同步进 URL query，使刷新/分享/前进后退都能复原。
 * 用法：const { read, write } = useUrlState(); write({ page: String(page.value) })
 */
export function useUrlState() {
  const route = useRoute();
  const router = useRouter();

  function read(key: string): string | undefined {
    const value = route.query[key];
    if (typeof value === "string" && value.length > 0) return value;
    return undefined;
  }

  function write(patch: Record<string, string | undefined>) {
    const query: Record<string, string> = {};

    // 保留当前其它 query，再覆盖本次变更
    for (const [key, value] of Object.entries(route.query)) {
      if (typeof value === "string" && value.length > 0) query[key] = value;
    }

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") delete query[key];
      else query[key] = value;
    }

    void router.replace({ query });
  }

  return { read, write };
}
