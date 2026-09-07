/**
 * 测试环境补齐 localStorage。
 *
 * 现象：较新的 Node 版本内置了实验性 localStorage，未传 --localstorage-file 时
 * globalThis.localStorage 为 undefined，且会遮蔽 jsdom 的实现，
 * 导致组件里的 localStorage 读写在测试中拿不到。
 *
 * 这里优先使用 jsdom 的实现，缺失时退化为内存实现，并同步挂到 globalThis。
 */
function ensureLocalStorage() {
  if (typeof window === "undefined") return;

  if (!window.localStorage) {
    const store = new Map<string, string>();
    const memory = {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
      key: (i: number) => {
        const keys = Array.from(store.keys());
        return i < keys.length ? keys[i] : null;
      },
      get length() {
        return store.size;
      },
    };
    Object.defineProperty(window, "localStorage", {
      value: memory,
      configurable: true,
      writable: true,
    });
  }

  if (
    typeof (globalThis as { localStorage?: unknown }).localStorage ===
    "undefined"
  ) {
    Object.defineProperty(globalThis, "localStorage", {
      value: window.localStorage,
      configurable: true,
      writable: true,
    });
  }
}

ensureLocalStorage();
