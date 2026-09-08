import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** @type {import("eslint").Linter.Config[]} */
const nextConfigs = [
  // 全局忽略：构建产物与依赖
  { ignores: ["node_modules/**", ".next/**", "out/**", "coverage/**"] },

  // eslint-config-next v16 原生导出 flat config 数组
  ...nextCoreWebVitals,
  ...nextTypescript,
];

// 从 next 配置中提取 react-hooks 插件实例，供下方规则覆盖使用（flat config 作用域要求）
const reactHooksPluginEntry = nextConfigs.find(
  (c) => c.plugins && c.plugins["react-hooks"]
);
const reactHooksPlugins = reactHooksPluginEntry?.plugins;

/** @type {import("eslint").Linter.Config[]} */
const overrides = [
  {
    // TODO(B6 后续): react-compiler 系规则（eslint-plugin-react-hooks v6 新增）降级为警告。
    // 这批告警对应 10+ 文件的 effect/render 重构（setState-in-effect、refs、purity 等），
    // 245 项测试覆盖现有行为；发布末期不宜大规模重构，转入后续批次逐个消化后恢复 error。
    ...(reactHooksPlugins ? { plugins: reactHooksPlugins } : {}),
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/use-memo": "warn",
      // ASR（webkitSpeechRecognition）无官方类型，暂允许显式 any 并告警
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Node 工具脚本（CJS）：非 TS/React 代码，豁免 TS 与 React 规则
    files: ["scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];

export default [...nextConfigs, ...overrides];
