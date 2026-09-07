"use client";

/** 学习统计卡片（从 WorkspaceView 拆分，逻辑未改动） */
export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-100 rounded-xl p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-extrabold text-purple-600 mt-0.5">
        {value}
      </div>
    </div>
  );
}
