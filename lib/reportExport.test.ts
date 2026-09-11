import { describe, expect, it } from "vitest";
import {
  buildReportSvg,
  escapeXml,
  reportFileName,
  subjectAccuracy,
  type ReportData,
  type ReportLabels,
} from "./reportExport";

const data: ReportData = {
  days: 5,
  totalMin: 42,
  totalSessions: 7,
  bySubject: {
    language: { count: 3, correct: 12, total: 15 },
    math: { count: 2, correct: 8, total: 10 },
    logic: { count: 2, correct: 5, total: 10 },
    life: { count: 0, correct: 0, total: 0 },
  },
  mistakes: [
    { fr: "Arrête de me pousser", subject: "language" },
    { fr: "3 + 5 = ?", subject: "math" },
  ],
  level: "L3",
  levelName: "大班",
  passed: 4,
};

const labels: ReportLabels = {
  title: "本周学习报告",
  days: "学习天数",
  time: "总时长",
  sessions: "测验次数",
  subjectTitle: "分学科正确率",
  mistakesTitle: "错题 Top3",
  level: "当前学段",
  speakPassed: "跟读通过",
  unitDay: "天",
  unitMin: "分钟",
  unitCount: "次",
  unitTimes: "次",
  subjectNames: { language: "语言", math: "数学", logic: "逻辑", life: "生活" },
};

describe("escapeXml", () => {
  it("转义 XML 特殊字符", () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe(
      "a &amp; b &lt; c &gt; d &quot; e &apos; f"
    );
  });
});

describe("subjectAccuracy", () => {
  it("total>0 四舍五入百分比", () => {
    expect(subjectAccuracy({ count: 1, correct: 12, total: 15 })).toBe(80);
    expect(subjectAccuracy({ count: 1, correct: 5, total: 10 })).toBe(50);
  });
  it("total=0 → 0", () => {
    expect(subjectAccuracy({ count: 0, correct: 0, total: 0 })).toBe(0);
  });
});

describe("reportFileName", () => {
  it("本地日期格式 YYYY-MM-DD.png", () => {
    expect(reportFileName(new Date(2026, 8, 10))).toBe("weekly-report-2026-09-10.png");
  });
  it("自定义前缀", () => {
    expect(reportFileName(new Date(2026, 0, 2), "bao")).toBe("bao-2026-01-02.png");
  });
});

describe("buildReportSvg", () => {
  const svg = buildReportSvg(data, labels);

  it("是合法 SVG 根元素", () => {
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("包含全部验收字段（天数/时长/次数/学科/错题/学段/跟读通过）", () => {
    expect(svg).toContain("5 天");
    expect(svg).toContain("42 分钟");
    expect(svg).toContain("7 次");
    expect(svg).toContain("80%"); // language 正确率
    expect(svg).toContain("50%"); // logic 正确率
    expect(svg).toContain("Arrête de me pousser");
    expect(svg).toContain("大班");
    expect(svg).toContain("跟读通过");
  });

  it("错题文本被转义（防注入）", () => {
    const evil = buildReportSvg(
      { ...data, mistakes: [{ fr: `<script>alert(1)</script>`, subject: "language" }] },
      labels
    );
    expect(evil).not.toContain("<script>");
    expect(evil).toContain("&lt;script&gt;");
  });

  it("纯函数：同输入同输出（确定性）", () => {
    expect(buildReportSvg(data, labels)).toBe(svg);
  });

  it("高度随错题数自适应", () => {
    const h = (s: string) => Number(s.match(/height="(\d+)"/)?.[1] ?? 0);
    expect(h(buildReportSvg({ ...data, mistakes: [] }, labels))).toBeLessThan(h(svg));
  });
});
