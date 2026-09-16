"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { useI18n } from "@/lib/i18n";
import { LOGIC_DOMAINS } from "@/lib/mathCurriculum";
import {
  checkLogicAnswer,
  generateLogicQuiz,
  logicQuestionFromFixedItem,
  toQuizQuestion,
  type ClassifyPayload,
  type LogicQuestion,
  type SortPayload,
} from "@/lib/logicEngine";
import { addPoints, todayStr, type StudySession } from "@/lib/workspace";
import type { LogicItem } from "@/lib/contentTypes";

/** 拖拽吸附容差（PRD P-2：≥ 32px） */
const SNAP_TOLERANCE = 32;

type Ghost = { id: string; x: number; y: number } | null;

/**
 * 逻辑推理中心（PRD §7.8，Dev-Plan T2.3）：
 * - 能力域地图（P0 四域可玩，spatial/number/deduce 为 P1 占位）；
 * - 拖拽用 Pointer Events 自研（吸附容差 32px），每处拖拽均有等价点选路径。
 */
export function LogicCenter({ fixedItems }: { fixedItems: LogicItem[] }) {
  const { state } = useAppState();
  const { t } = useI18n();
  const [activeDomain, setActiveDomain] = useState<string | null>(null);

  if (!state) {
    return <div className="py-20 text-center text-gray-400">{t('logic.loading')}</div>;
  }

  if (activeDomain) {
    const domain = LOGIC_DOMAINS.find((d) => d.id === activeDomain);
    if (domain) {
      return (
        <LogicQuizRunner
          domainId={domain.id}
          kinds={domain.kinds}
          fixedItems={fixedItems}
          onExit={() => setActiveDomain(null)}
        />
      );
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">
          <span className="text-teal-500">🧩</span> {t('logic.title')}
        </h1>
        <p className="text-gray-500 mt-2 text-sm">
          {t('logic.desc', { level: state.profile.level })}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {LOGIC_DOMAINS.map((d) => (
          <button
            key={d.id}
            disabled={!d.ready}
            onClick={() => setActiveDomain(d.id)}
            aria-label={`enter domain ${d.title.zh}`}
            className={
              "rounded-2xl border-2 p-5 text-center transition " +
              (d.ready
                ? "border-teal-100 bg-white hover:border-teal-400 hover:shadow-sm"
                : "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed")
            }
          >
            <div className="text-4xl">{d.emoji}</div>
            <div className="mt-2 font-bold text-gray-800">{d.title.zh}</div>
            <div className="text-xs text-gray-400">{d.title.fr}</div>
            {!d.ready && <div className="text-[11px] text-gray-400 mt-1">即将上线</div>}
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-gray-400 pb-4">
        {t('logic.groupHint')}
      </p>
    </div>
  );
}

// ─── 题组运行器 ──────────────────────────────────────────────────

function LogicQuizRunner({
  domainId,
  kinds,
  fixedItems,
  onExit,
}: {
  domainId: string;
  kinds: ("pattern" | "classify" | "sort" | "oddOne")[];
  fixedItems: LogicItem[];
  onExit: () => void;
}) {
  const { t } = useI18n();
  const { state, update } = useAppState();
  const level = state?.profile.level ?? "L3";

  const questions = useMemo<LogicQuestion[]>(() => {
    const domainFixed = fixedItems
      .filter((it) => it.domain === domainId)
      .map((it) => logicQuestionFromFixedItem(it, level));
    return generateLogicQuiz({
      level,
      kinds,
      count: 5,
      seed: `${domainId}_${todayStr()}`,
      fixedItems: domainFixed,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainId, level]);

  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [feedback, setFeedback] = useState<"none" | "right" | "wrong">("none");
  const [finished, setFinished] = useState<null | { acc: number }>(null);

  const q = questions[index];

  const answerAndNext = useCallback(
    (userAnswer: string) => {
      if (!q || feedback !== "none") return;
      const correct = checkLogicAnswer(q, userAnswer);
      const nextResults = [...results, correct];
      setResults(nextResults);
      setFeedback(correct ? "right" : "wrong");

      window.setTimeout(() => {
        setFeedback("none");
        if (index + 1 < questions.length) {
          setIndex(index + 1);
          return;
        }
        // ── 结算：session（subject: logic）+ 积分 ──
        const acc = Math.round(
          (nextResults.filter(Boolean).length / questions.length) * 100
        );
        const today = todayStr();
        const session: StudySession = {
          id: `s_logic_${domainId}_${today}`,
          date: today,
          durationMin: 8,
          contentRef: { type: "mixed", title: `逻辑 · ${domainId}` },
          quiz: {
            title: `逻辑 · ${domainId} · ${today}`,
            questions: questions.map((lq, i) =>
              toQuizQuestion(lq, nextResults[i])
            ),
          },
          reviewed: false,
          subject: "logic",
        };
        update((s) => ({
          ...s,
          points: addPoints(s.points, 5, "完成逻辑题组"),
          sessions: [...s.sessions.filter((x) => x.id !== session.id), session],
        }));
        setFinished({ acc });
      }, 900);
    },
    [q, feedback, results, index, questions, domainId, update]
  );

  if (!state) return null;

  if (finished) {
    return (
      <div className="max-w-xl mx-auto text-center py-10">
        <div className="text-6xl">🦊</div>
        <h1 className="text-2xl font-bold text-gray-800 mt-3">{t('logic.quizCompleted')}</h1>
        <p className="text-sm text-gray-500 mt-3">
          {t('logic.accuracy', { acc: String(finished.acc) })}
        </p>
        <div className="flex gap-3 justify-center mt-6">
          <button className="btn-secondary" onClick={onExit}>
            {t('logic.backToDomain')}
          </button>
        </div>
      </div>
    );
  }

  if (!q) {
    return <div className="py-20 text-center text-gray-400">出题中…</div>;
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <button className="text-sm text-purple-500" onClick={onExit}>
          {t('logic.backToDomainLink')}
        </button>
        <span className="text-sm text-gray-400">
          {index + 1} / {questions.length}
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-teal-50 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all"
          style={{ width: `${(index / questions.length) * 100}%` }}
        />
      </div>

      <div
        className={
          "rounded-2xl border p-5 transition " +
          (feedback === "right"
            ? "border-green-300 bg-green-50"
            : feedback === "wrong"
            ? "border-amber-300 bg-amber-50"
            : "border-gray-100 bg-white")
        }
      >
        <p className="text-center text-sm text-gray-500 mb-4">{q.stem.zh}</p>
        {q.stem.fr && (
          <p className="text-center text-xs text-gray-400 mb-4 italic">
            {q.stem.fr}
          </p>
        )}

        {q.payload.type === "pattern" && (
          <PatternBoard q={q} locked={feedback !== "none"} onAnswer={answerAndNext} />
        )}
        {q.payload.type === "oddOne" && (
          <OddOneBoard q={q} locked={feedback !== "none"} onAnswer={answerAndNext} />
        )}
        {q.payload.type === "classify" && (
          <ClassifyBoard
            q={q}
            locked={feedback !== "none"}
            onAnswer={answerAndNext}
          />
        )}
        {q.payload.type === "sort" && (
          <SortBoard q={q} locked={feedback !== "none"} onAnswer={answerAndNext} />
        )}

        {feedback === "right" && (
          <p className="text-center text-green-600 font-bold mt-3">
            {t('logic.correctAnswer')}
          </p>
        )}
        {feedback === "wrong" && (
          <p className="text-center text-amber-600 font-semibold mt-3">
            {t('logic.wrongHint')}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── pattern：点选接续项 ─────────────────────────────────────────

function PatternBoard({
  q,
  locked,
  onAnswer,
}: {
  q: LogicQuestion;
  locked: boolean;
  onAnswer: (a: string) => void;
}) {
  const { t } = useI18n();
  const p = q.payload as Extract<LogicQuestion["payload"], { type: "pattern" }>;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center gap-2 text-4xl flex-wrap">
        {p.items.map((it, i) => (
          <span
            key={i}
            className={
              it === "?"
                ? "text-purple-500 border-2 border-dashed border-purple-300 rounded-lg px-2"
                : ""
            }
          >
            {it}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        {p.options.map((opt) => (
          <button
            key={opt}
            disabled={locked}
            onClick={() => onAnswer(opt)}
            className={
              "text-4xl min-h-[64px] min-w-[64px] rounded-xl border-2 transition " +
              (locked && opt === q.answer
                ? "border-green-400 bg-green-50"
                : "border-gray-100 bg-white hover:border-purple-300 active:scale-95")
            }
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── oddOne：点选多余项 ──────────────────────────────────────────

function OddOneBoard({
  q,
  locked,
  onAnswer,
}: {
  q: LogicQuestion;
  locked: boolean;
  onAnswer: (a: string) => void;
}) {
  const { t } = useI18n();
  const p = q.payload as Extract<LogicQuestion["payload"], { type: "oddOne" }>;
  return (
    <div className="flex items-center justify-center gap-4 flex-wrap">
      {p.items.map((it, i) => (
        <button
          key={i}
          disabled={locked}
          onClick={() => onAnswer(it)}
          className={
            "text-5xl min-h-[80px] min-w-[80px] rounded-2xl border-2 transition " +
            (locked && i === p.answerIndex
              ? "border-green-400 bg-green-50"
              : locked
              ? "border-gray-100 opacity-60"
              : "border-gray-100 bg-white hover:border-purple-300 active:scale-95")
          }
        >
          {it}
        </button>
      ))}
    </div>
  );
}

// ─── classify：拖拽入篮 + 点选等价路径 ───────────────────────────

function ClassifyBoard({
  q,
  locked,
  onAnswer,
}: {
  q: LogicQuestion;
  locked: boolean;
  onAnswer: (a: string) => void;
}) {
  const { t } = useI18n();
  const p = q.payload as ClassifyPayload;
  const [assign, setAssign] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(p.items.map((it) => [it.id, null]))
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost>(null);
  const dragRef = useRef<{ id: string } | null>(null);

  const unassigned = p.items.filter((it) => !assign[it.id]);

  // 拖拽：Pointer Events + elementFromPoint 命中篮子（含 32px 吸附容差）
  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return;
    setGhost({ id: dragRef.current.id, x: e.clientX, y: e.clientY });
  }, []);

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      setGhost(null);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (!drag || locked) return;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest("[data-basket]") as HTMLElement | null;
      if (target) {
        const rect = target.getBoundingClientRect();
        const withinX =
          e.clientX >= rect.left - SNAP_TOLERANCE &&
          e.clientX <= rect.right + SNAP_TOLERANCE;
        const withinY =
          e.clientY >= rect.top - SNAP_TOLERANCE &&
          e.clientY <= rect.bottom + SNAP_TOLERANCE;
        if (withinX && withinY) {
          const basketId = target.getAttribute("data-basket") as string;
          setAssign((a) => ({ ...a, [drag.id]: basketId }));
          setSelected(null);
        }
      }
    },
    [locked, onPointerMove]
  );

  const startDrag = (id: string) => (e: React.PointerEvent) => {
    if (locked) return;
    dragRef.current = { id };
    setGhost({ id, x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  function allAssigned() {
    return p.items.every((it) => assign[it.id]);
  }

  function check() {
    onAnswer(JSON.stringify(assign));
  }

  return (
    <div className="space-y-4">
      {/* 待分类池（点选：先点物品，再点篮子） */}
      <div className="flex items-center justify-center gap-3 flex-wrap min-h-[80px] bg-gray-50 rounded-xl p-3">
        {unassigned.length === 0 && (
          <span className="text-xs text-gray-400">{t('logic.allAssigned')}</span>
        )}
        {unassigned.map((it) => (
          <button
            key={it.id}
            disabled={locked}
            onPointerDown={startDrag(it.id)}
            onClick={() => setSelected((s) => (s === it.id ? null : it.id))}
            className={
              "text-4xl min-h-[64px] min-w-[64px] rounded-xl border-2 transition touch-none " +
              (selected === it.id
                ? "border-purple-500 bg-purple-50 scale-105"
                : "border-gray-100 bg-white")
            }
            aria-label={`select item`}
          >
            {it.emoji}
          </button>
        ))}
      </div>

      {/* 篮子 */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${p.baskets.length}, minmax(0, 1fr))` }}>
        {p.baskets.map((b) => {
          const members = p.items.filter((it) => assign[it.id] === b.id);
          return (
            <div
              key={b.id}
              data-basket={b.id}
              onClick={() => {
                if (locked || !selected) return;
                setAssign((a) => ({ ...a, [selected]: b.id }));
                setSelected(null);
              }}
              className="min-h-[110px] rounded-xl border-2 border-dashed border-teal-200 bg-teal-50/50 p-2 text-center cursor-pointer"
            >
              <div className="text-2xl">{b.emoji}</div>
              <div className="text-xs font-semibold text-teal-700">
                {b.label.zh} / {b.label.fr}
              </div>
              <div className="flex flex-wrap justify-center gap-1 mt-1">
                {members.map((m) => (
                  <button
                    key={m.id}
                    disabled={locked}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssign((a) => ({ ...a, [m.id]: null }));
                    }}
                    className="text-2xl"
                    aria-label={`return item`}
                  >
                    {m.emoji}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button
        className="btn-primary w-full min-h-[48px]"
        disabled={locked || !allAssigned()}
        onClick={check}
      >
        {t('logic.check')}
      </button>
      {ghost && (
        <div
          className="fixed pointer-events-none text-4xl z-[500]"
          style={{ left: ghost.x - 24, top: ghost.y - 24 }}
        >
          {p.items.find((it) => it.id === ghost.id)?.emoji}
        </div>
      )}
    </div>
  );
}

// ─── sort：拖拽排序 + 按序点选等价路径 ───────────────────────────

function SortBoard({
  q,
  locked,
  onAnswer,
}: {
  q: LogicQuestion;
  locked: boolean;
  onAnswer: (a: string) => void;
}) {
  const { t } = useI18n();
  const p = q.payload as SortPayload;
  const max = Math.max(...p.items.map((it) => it.size));
  const [order, setOrder] = useState<string[]>(() => p.items.map((it) => it.id));
  const [tapOrder, setTapOrder] = useState<string[]>([]);
  const [mode, setMode] = useState<"drag" | "tap">("drag");
  const [ghost, setGhost] = useState<Ghost>(null);
  const dragRef = useRef<{ id: string; fromIndex: number } | null>(null);

  const byId = (id: string) => p.items.find((it) => it.id === id) as {
    id: string;
    emoji: string;
    size: number;
  };

  function startDrag(id: string) {
    return (e: React.PointerEvent) => {
      if (locked || mode !== "drag") return;
      dragRef.current = { id, fromIndex: order.indexOf(id) };
      setGhost({ id, x: e.clientX, y: e.clientY });
      const move = (ev: PointerEvent) => {
        setGhost({ id, x: ev.clientX, y: ev.clientY });
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        dragRef.current = null;
        setGhost(null);
        if (locked) return;
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const slot = el?.closest("[data-slot]") as HTMLElement | null;
        if (slot) {
          const toIndex = Number(slot.getAttribute("data-slot"));
          setOrder((cur) => {
            const arr = cur.filter((x) => x !== id);
            arr.splice(toIndex, 0, id);
            return arr;
          });
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
  }

  // 点选等价路径：按从小到大依次点选
  function tapItem(id: string) {
    if (locked || mode !== "tap") return;
    if (tapOrder.includes(id)) return;
    const next = [...tapOrder, id];
    setTapOrder(next);
    if (next.length === p.items.length) {
      setOrder(next);
    }
  }

  function check() {
    onAnswer(JSON.stringify(order));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-2 text-xs">
        <button
          onClick={() => setMode("drag")}
          aria-pressed={mode === "drag"}
          className={
            "px-3 py-1.5 rounded-full min-h-[40px] " +
            (mode === "drag" ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-500")
          }
        >
          {t('logic.dragSort')}
        </button>
        <button
          onClick={() => setMode("tap")}
          aria-pressed={mode === "tap"}
          className={
            "px-3 py-1.5 rounded-full min-h-[40px] " +
            (mode === "tap" ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-500")
          }
        >
          {t('logic.tapSort')}
        </button>
      </div>

      {/* 排序槽位 */}
      <div className="flex items-end justify-center gap-2 flex-wrap">
        {order.map((id, i) => {
          const it = byId(id);
          const scale = 0.6 + (it.size / max) * 0.8; // 尺寸可视化
          return (
            <div
              key={id}
              data-slot={i}
              className="rounded-xl border-2 border-gray-100 bg-white p-2 flex flex-col items-center"
            >
              <span
                onPointerDown={startDrag(id)}
                onClick={() => tapItem(id)}
                className="select-none touch-none cursor-grab active:cursor-grabbing"
                style={{ fontSize: `${scale * 3}rem`, lineHeight: 1 }}
                role="button"
                aria-label={`item ${i + 1}`}
              >
                {it.emoji}
              </span>
              <span className="text-[10px] text-gray-300">{i + 1}</span>
            </div>
          );
        })}
      </div>

      {mode === "tap" && (
        <p className="text-center text-xs text-gray-400">
          {t('logic.tappedCount', { n: String(tapOrder.length), total: String(p.items.length) })}
          {tapOrder.length > 0 && (
            <button
              className="ml-2 text-teal-600"
              onClick={() => setTapOrder([])}
            >
              {t('logic.reselect')}
            </button>
          )}
        </p>
      )}

      <button
        className="btn-primary w-full min-h-[48px]"
        disabled={locked}
        onClick={check}
      >
        {t('logic.check')}
      </button>

      {ghost && (
        <div
          className="fixed pointer-events-none z-[500]"
          style={{ left: ghost.x - 24, top: ghost.y - 24 }}
        >
          <span style={{ fontSize: `${(byId(ghost.id).size / max) * 3}rem` }}>
            {byId(ghost.id).emoji}
          </span>
        </div>
      )}
    </div>
  );
}

// 供 /logic 页面使用的固定题类型（避免页面直接依赖内部类型）
export type { LogicItem as LogicFixedItem };
