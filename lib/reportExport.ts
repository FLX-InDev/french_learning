/**
 * 家长周报导出（Phase 6 T6-05，S4；PRD §7.12.6「P2 支持导出图片」）
 *
 * 自研 SVG → Canvas → PNG，**零新增依赖**（G-4：不使用 html2canvas / html-to-image）。
 * 导出图与页面**同源同值**：调用方把 WeeklyReport 的同一份 `ReportData` + 同一份
 * `ReportLabels`（由 t() 组装）传入 `buildReportSvg`，页面渲染与图片渲染读同一对象。
 *
 * 兼容性：`svgToPngBlob` 用 `Image` + `canvas.toBlob`，`downloadBlob` 用
 * `URL.createObjectURL` + `<a download>`（Safari / iPad 可用，不依赖 navigator.share）。
 */

import type { Subject } from "./levels";

export type ReportSubjectStat = { count: number; correct: number; total: number };

/** 与页面同源的周报数据（由 WeeklyReport 的 useMemo 产出，禁止在导出侧重算） */
export type ReportData = {
  days: number;
  totalMin: number;
  totalSessions: number;
  bySubject: Record<Subject, ReportSubjectStat>;
  mistakes: { fr: string; subject: string }[];
  level: string;
  levelName: string;
  passed: number;
};

/** 导出图与页面共用的文案（调用方从 i18n 组装，保证同源） */
export type ReportLabels = {
  title: string;
  days: string;
  time: string;
  sessions: string;
  subjectTitle: string;
  mistakesTitle: string;
  level: string;
  speakPassed: string;
  unitDay: string;
  unitMin: string;
  unitCount: string;
  unitTimes: string;
  /** 学科显示名（与页面同一来源，如 t("reportExport.subject.language")） */
  subjectNames: Record<Subject, string>;
};

/** 导出图内展示的学科顺序（与页面一致） */
export const REPORT_SUBJECT_ORDER: Subject[] = ["language", "math", "logic"];

/** XML 文本转义（SVG 内所有动态文本必须经过此函数） */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 学科正确率（与页面同一算法：total>0 才计算，否则 0） */
export function subjectAccuracy(d: ReportSubjectStat): number {
  return d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0;
}

/** 文件名：`weekly-report-YYYY-MM-DD.png`（本地日期，避免时区偏移） */
export function reportFileName(date: Date, prefix = "weekly-report"): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${prefix}-${y}-${m}-${d}.png`;
}

const FONT =
  "-apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'Segoe UI', Arial, sans-serif";

/**
 * 构建周报 SVG 字符串（640 宽，高度随错题数自适应）。
 * 纯函数：相同 data + labels → 相同字符串（可单测）。
 */
export function buildReportSvg(data: ReportData, labels: ReportLabels): string {
  const W = 640;
  const P = 28;
  const mistakes = data.mistakes.slice(0, 3);
  const H = 250 + REPORT_SUBJECT_ORDER.length * 34 + mistakes.length * 26 + 70;

  const parts: string[] = [];
  parts.push(
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    // 顶部色带
    `<rect x="0" y="0" width="${W}" height="8" fill="#9333ea"/>`,
    // 标题
    `<text x="${P}" y="48" font-family="${FONT}" font-size="24" font-weight="700" fill="#1f2937">${escapeXml(labels.title)}</text>`,
    `<text x="${P}" y="72" font-family="${FONT}" font-size="13" fill="#9ca3af">${escapeXml(labels.level)}：${escapeXml(data.levelName)}</text>`
  );

  // 三张统计卡
  const cardW = (W - P * 2 - 24) / 3;
  const cards: { label: string; value: string }[] = [
    { label: labels.days, value: `${data.days} ${labels.unitDay}` },
    { label: labels.time, value: `${data.totalMin} ${labels.unitMin}` },
    { label: labels.sessions, value: `${data.totalSessions} ${labels.unitCount}` },
  ];
  cards.forEach((c, i) => {
    const x = P + i * (cardW + 12);
    parts.push(
      `<rect x="${x.toFixed(1)}" y="92" width="${cardW.toFixed(1)}" height="66" rx="12" fill="#faf5ff"/>`,
      `<text x="${(x + cardW / 2).toFixed(1)}" y="124" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="800" fill="#9333ea">${escapeXml(c.value)}</text>`,
      `<text x="${(x + cardW / 2).toFixed(1)}" y="146" text-anchor="middle" font-family="${FONT}" font-size="12" fill="#6b7280">${escapeXml(c.label)}</text>`
    );
  });

  // 分学科正确率
  let y = 196;
  parts.push(
    `<text x="${P}" y="${y}" font-family="${FONT}" font-size="15" font-weight="700" fill="#374151">${escapeXml(labels.subjectTitle)}</text>`
  );
  y += 26;
  REPORT_SUBJECT_ORDER.forEach((sub) => {
    const acc = subjectAccuracy(data.bySubject[sub]);
    const barX = P + 72;
    const barW = W - P * 2 - 72 - 52;
    parts.push(
      `<text x="${P}" y="${y + 12}" font-family="${FONT}" font-size="13" fill="#6b7280">${escapeXml(labels.subjectNames[sub])}</text>`,
      `<rect x="${barX}" y="${y}" width="${barW}" height="12" rx="6" fill="#f3e8ff"/>`,
      `<rect x="${barX}" y="${y}" width="${((barW * acc) / 100).toFixed(1)}" height="12" rx="6" fill="#a855f7"/>`,
      `<text x="${W - P}" y="${y + 12}" text-anchor="end" font-family="${FONT}" font-size="13" font-weight="700" fill="#6b21a8">${acc}%</text>`
    );
    y += 34;
  });

  // 错题 Top3
  y += 8;
  parts.push(
    `<text x="${P}" y="${y}" font-family="${FONT}" font-size="15" font-weight="700" fill="#374151">${escapeXml(labels.mistakesTitle)}</text>`
  );
  y += 24;
  if (mistakes.length === 0) {
    parts.push(
      `<text x="${P}" y="${y}" font-family="${FONT}" font-size="13" fill="#9ca3af">—</text>`
    );
    y += 22;
  } else {
    mistakes.forEach((m) => {
      parts.push(
        `<text x="${P}" y="${y}" font-family="${FONT}" font-size="13" fill="#6b7280">« ${escapeXml(m.fr)} »</text>`
      );
      y += 26;
    });
  }

  // 页脚
  parts.push(
    `<text x="${P}" y="${H - 24}" font-family="${FONT}" font-size="12" fill="#9ca3af">${escapeXml(labels.speakPassed)}：${data.passed} ${escapeXml(labels.unitTimes)}</text>`
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

/**
 * SVG 字符串 → PNG Blob（浏览器环境）。
 * scale 控制清晰度（默认 2×）。非浏览器环境抛错（由调用方兜底提示）。
 */
export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    throw new Error("svgToPngBlob requires a browser environment");
  }
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG load failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((img.naturalWidth || 640) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || 400) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2d context unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
    if (!png) throw new Error("PNG encode failed");
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 触发下载（Safari / iPad 兼容：object URL + <a download>，不用 navigator.share） */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
