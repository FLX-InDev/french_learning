import { PrivacyView } from "@/components/PrivacyView";

export const metadata = {
  title: "隐私声明 · 法语宝宝学",
  description: "法语宝宝学的儿童隐私保护说明：不采集、无广告、数据仅存本机",
};

/**
 * 隐私声明页（PRD §7.13.6 / §11 儿童隐私合规，Dev-Plan T4.4 / F51）：
 * 声明「不采集 / 无广告 / 无外链 / 数据仅本机」基线（GDPR-K / COPPA 本地化处理）。
 *
 * 服务端组件保留 `metadata`；三语文案渲染在客户端组件 `PrivacyView`（Phase 6 T6-01）。
 */
export default function PrivacyPage() {
  return <PrivacyView />;
}
