/**
 * 统一音频管理器（PRD §7.2.3 / §7.4.2，Dev-Plan T3.6）
 *
 * 单例 TTS 引擎：儿歌卡拉OK、句子/故事连播、字母卡与拼词点读共用。
 * - 双轨：优先 read-aloud-sf 后端（/api/tts），失败回退浏览器 speechSynthesis；
 * - 取消语义：generation 计数器。cancelSpeech() 使代数 +1 并停掉当前发声；
 *   编排循环（连播/卡拉OK）在 start 时捕获代数，每次 await 后对比——
 *   speak() 自身**不**改变代数，因此循环内多次 speak 不会自我打断；
 * - 全局语速：configureSpeech(settings.speechRate) 由消费组件传入（家长中心设置）。
 */

import {
  NORMAL_SPEECH_RATE,
  VOICE_CONFIG,
  playbackRate,
  utteranceRate,
  type Language,
} from "./voiceConfig";
import { loadVoicesReady, pickBestVoice } from "./webSpeechVoice";

type Provider = "webspeech" | "backend";

let providerCache: Provider | null = null;
let providerFetching: Promise<Provider> | null = null;
let speechRate: number = NORMAL_SPEECH_RATE;
let generation = 0;
let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

/** 传入家长中心的全局语速（0.75 慢速 / 0.9 正常） */
export function configureSpeech(rate: number): void {
  speechRate = rate;
}

/** 当前语音代数：编排方在 await 后对比，不一致则说明被取消 */
export function speechGeneration(): number {
  return generation;
}

async function resolveProvider(): Promise<Provider> {
  if (providerCache) return providerCache;
  if (!providerFetching) {
    providerFetching = fetch("/api/tts/config")
      .then((r) => r.json())
      .then((d) => {
        providerCache =
          d.provider !== "webspeech" && !!d.available ? "backend" : "webspeech";
        return providerCache;
      })
      .catch(() => {
        providerCache = "webspeech";
        return providerCache;
      });
  }
  return providerFetching;
}

function stopCurrentOnly(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel(); // 触发当前 utterance 的 onerror(canceled)，旧 Promise 安静结束
  }
  if (currentAudio) {
    currentAudio.pause(); // 触发 onpause → playAudioUrl 的 Promise resolve
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

/** 开启新的播放会话：停掉本管理器当前发声（不影响 PlayButton 的独立播放） */
export function cancelSpeech(): void {
  generation++;
  stopCurrentOnly();
}

/**
 * 朗读一段文本，Promise 在播放完成（或取消/出错）后 resolve。
 * 不改变 generation（编排循环的安全原语）。
 * 后端请求失败自动回退浏览器语音，不抛错（健壮性：TTS 失败不阻塞）。
 */
export async function speak(text: string, lang: Language): Promise<void> {
  stopCurrentOnly();
  const gen = generation;

  const provider = await resolveProvider();
  if (gen !== generation) return; // 等待期间被取消

  if (provider === "backend") {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: VOICE_CONFIG[lang].cfVoice,
          rate: speechRate,
        }),
      });
      if (res.ok && gen === generation) {
        const blob = await res.blob();
        if (gen !== generation) return;
        await playAudioUrl(URL.createObjectURL(blob), gen);
        return;
      }
      console.warn("[audioManager] 后端 TTS 请求失败，回退浏览器语音:", res.status);
    } catch (err) {
      console.warn("[audioManager] 后端 TTS 出错，回退浏览器语音:", err);
    }
  }
  if (gen !== generation) return;
  await speakWebSpeech(text, lang, gen);
}

/** 播放一段音频 URL（卡拉OK audio 字段预留路径也走这里）；end/error/pause 均视为结束 */
export function playAudioUrl(url: string, gen: number = generation): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.playbackRate = playbackRate(speechRate);
    currentAudio = audio;
    currentUrl = url;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      if (currentAudio === audio) {
        currentAudio = null;
      }
      URL.revokeObjectURL(url);
      if (currentUrl === url) currentUrl = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.onpause = done;
    audio.play().catch(done);
  });
}

function speakWebSpeech(text: string, lang: Language, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    loadVoicesReady().then((voices) => {
      if (gen !== generation) {
        resolve();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = VOICE_CONFIG[lang].lang;
      u.rate = utteranceRate(lang, speechRate);
      const best = pickBestVoice(voices, VOICE_CONFIG[lang].lang, lang);
      if (best) u.voice = best;
      const done = () => resolve();
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    });
  });
}

/** 句间停顿 */
export function pause(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

/**
 * 播放列表顺序朗读：内部先 cancelSpeech() 建立会话，再逐项 speak；
 * 返回实际完整播完的最后一条索引（-1 = 未播完任何一条即被取消/停止）。
 */
export async function speakSequence(
  items: { text: string; lang: Language }[],
  opts: { gapMs?: number; onStart?: (index: number) => void } = {}
): Promise<number> {
  cancelSpeech();
  const gen = generation;
  let last = -1;
  for (let i = 0; i < items.length; i++) {
    if (speechGeneration() !== gen) return last;
    opts.onStart?.(i);
    await speak(items[i].text, items[i].lang);
    if (speechGeneration() !== gen) return i;
    last = i;
    if (opts.gapMs && i < items.length - 1) await pause(opts.gapMs);
  }
  return last;
}

// ─── 音效通道（Phase 4 / PRD §7.3 音效触发矩阵）──────────────────

export type SfxName = "correct" | "encourage" | "star" | "levelup" | "tap";

/** 音效资产（public/audio/sfx，由 scripts/gen-sfx.cjs 生成，时长符合触发矩阵上限） */
export const SFX_FILES: Record<SfxName, string> = {
  correct: "/audio/sfx/correct.wav", // 0.45s（矩阵上限 0.5s）
  encourage: "/audio/sfx/encourage.wav", // 0.7s（上限 0.8s）
  star: "/audio/sfx/star.wav", // 0.5s（上限 0.6s/颗）
  levelup: "/audio/sfx/levelup.wav", // 1.4s（上限 1.5s，与撒花同步）
  tap: "/audio/sfx/tap.wav", // 0.15s（上限 0.2s，默认关）
};

let sfxEnabled = true;
let tapSfxEnabled = false;

/** 传入家长中心设置：音效总开关 + 点按音效开关（默认关） */
export function configureSfx(on: boolean, tapOn: boolean): void {
  sfxEnabled = on;
  tapSfxEnabled = tapOn;
}

/** duck 规则：TTS 播放中音效自动压低（纯函数，可单测） */
export function computeSfxVolume(ttsActive: boolean): number {
  return ttsActive ? 0.25 : 0.9;
}

function isTtsActive(): boolean {
  if (currentAudio) return true;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    return window.speechSynthesis.speaking;
  }
  return false;
}

/**
 * 播放一枚音效（独立于 TTS 通道）：
 * - 静音开关（sfxOn）只关音效、不关 TTS（PRD §7.3）；
 * - tap 默认关，家长中心「点按音效」单独开启；
 * - 与 TTS 并发时按 duck 规则压低音量；播放失败静默（不阻塞交互）。
 */
export function playSfx(name: SfxName): void {
  if (typeof window === "undefined") return;
  if (!sfxEnabled) return;
  if (name === "tap" && !tapSfxEnabled) return;
  try {
    const audio = new Audio(SFX_FILES[name]);
    audio.volume = computeSfxVolume(isTtsActive());
    void audio.play().catch(() => {
      /* 自动播放策略拦截时静默放弃 */
    });
  } catch {
    /* 忽略 */
  }
}
