// 浏览器语音识别（Web Speech API）的轻量类型与能力检测。
//
// 注意：TypeScript 的 lib.dom.d.ts 只提供了 SpeechRecognitionAlternative /
// SpeechRecognitionResult / SpeechRecognitionResultList 三个结果类型，
// 并未提供 SpeechRecognition 本体及其事件类型。这里只补齐缺失的部分，
// 且不重复声明已存在的类型（否则会报 duplicate identifier）。
//
// 所有类型都在本模块内声明并导出，不做全局 Window 增强，避免与 lib.dom 冲突。

export interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message: string;
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** 获取浏览器提供的语音识别构造函数；不支持（如 Firefox）时返回 null。 */
export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** 是否支持浏览器语音识别（用于决定是否展示跟读题型）。 */
export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}
