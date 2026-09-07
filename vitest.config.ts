import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig 的 jsx 为 "preserve"（Next 要求），vitest 需要显式开启自动 JSX 运行时
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "./") },
  },
  test: {
    // 纯逻辑默认 node 环境；组件测试（.tsx）自动切 jsdom
    environment: "node",
    environmentMatchGlobs: [["{components,app}/**/*.{test,spec}.tsx", "jsdom"]],
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["{lib,components,app}/**/*.{test,spec}.{ts,tsx}"],
  },
});
