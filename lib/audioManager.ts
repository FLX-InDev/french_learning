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

/**
 * 对话角色语音（Phase 5B T5B.1，PRD §7.9.2 / §10.3 双角色 TTS 音色区分）：
 * A = 老师/大人（首选神经语音），B = 孩子（换用另一音色，避免同一声音自问自答）。
 * 后端 read-aloud-sf 用第二套 Cloudflare 神经语音名；浏览器回退用次选偏好语音。
 */
export type VoiceRole = "A" | "B";

const ROLE_CF_VOICES: Record<VoiceRole, Record<Language, string>> = {
  A: {
    zh: "zh-CN-YunxiNeural",
    en: "en-US-JennyNeural",
    fr: "fr-FR-DeniseNeural",
  },
  B: {
    zh: "zh-CN-XiaoxiaoNeural",
    en: "en-US-GuyNeural",
    fr: "fr-FR-HenriNeural",
  },
};

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
  refreshBgmVolume(); // TTS 停止 → BGM 解除 duck（BGM 是独立通道，不会被误停）
}

/** 开启新的播放会话：停掉本管理器当前发声（不影响 PlayButton 的独立播放） */
export function cancelSpeech(): void {
  generation++;
  stopCurrentOnly();
}

/**
 * 朗读一段文本，Promise 在播放完成（或取消/出错）后 resolve。
 * 不改变 generation（编排循环的安全原语）。
 * voiceRole 用于对话双角色音色区分（缺省 A = 首选语音）。
 * 后端请求失败自动回退浏览器语音，不抛错（健壮性：TTS 失败不阻塞）。
 */
export async function speak(
  text: string,
  lang: Language,
  voiceRole: VoiceRole = "A"
): Promise<void> {
  stopCurrentOnly();
  const gen = generation;
  duckBgmForTts(); // TTS 即将开始：立即压低 BGM（覆盖后端请求的网络延迟窗口）

  const provider = await resolveProvider();
  if (gen !== generation) return; // 等待期间被取消

  if (provider === "backend") {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: ROLE_CF_VOICES[voiceRole][lang],
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
  await speakWebSpeech(text, lang, gen, voiceRole);
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
      refreshBgmVolume(); // 该段 TTS/音频结束 → 重估 duck 状态
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.onpause = done;
    audio.play().catch(done);
  });
}

function speakWebSpeech(
  text: string,
  lang: Language,
  gen: number,
  voiceRole: VoiceRole = "A"
): Promise<void> {
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
      let best = pickBestVoice(voices, VOICE_CONFIG[lang].lang, lang);
      if (voiceRole === "B" && best) {
        // 孩子角色：避开 A 选中的音色，取同语言下一个候选
        const others = voices.filter(
          (v) =>
            (lang === "fr" ? v.lang === "fr-FR" : v.lang.startsWith(VOICE_CONFIG[lang].lang)) &&
            v.name !== best!.name
        );
        const alt = pickBestVoice(others, VOICE_CONFIG[lang].lang, lang);
        if (alt) best = alt;
      }
      if (best) u.voice = best;
      const done = () => {
        refreshBgmVolume(); // 该条语音结束 → 重估 duck 状态
        resolve();
      };
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

// ─── BGM 通道（Phase 6 T6-02，PRD §7.4.5 / §10.2）──────────────────
//
// 独立于 TTS / SFX 的第三条通道：轻音乐循环（loop）。
// - 常量冻结于契约 E（CONTEXT.md §2.5）：BGM_FILE / BGM_DEFAULT_VOLUME / BGM_DUCK_VOLUME；
// - 开关与音量真源 = AppState.settings.bgmOn / settings.bgmVolume（S0 已写入，本流只读写值）；
// - 默认关；audio.play() 被自动播放策略拦截时静默降级，保持「想要播放」，
//   由 UI 层（BgmToggle）在下次用户交互时重试；
// - duck 规则：TTS 播放中压低至 min(用户音量, BGM_DUCK_VOLUME)——纯函数
//   computeBgmVolume 可单测；cancelSpeech() 只作用于 TTS 通道，不会停 BGM。

/** BGM 音频资产（public/audio/bgm/loop.mp3，≤200KB，首尾可无缝循环） */
export const BGM_FILE = "/audio/bgm/loop.mp3";
/** 默认音量（用户未调整时） */
export const BGM_DEFAULT_VOLUME = 0.2;
/** duck 目标：TTS 播放时 BGM 压低的音量上限 */
export const BGM_DUCK_VOLUME = 0.08;

/**
 * BGM 音量 duck 规则（纯函数，可单测）：
 * - 关闭 → 0（默认关）；
 * - 开启且 TTS 播放中 → min(clamp(用户音量), BGM_DUCK_VOLUME)——用户音量本就
 *   低于 duck 目标时不抬高；
 * - 开启且无 TTS → clamp(用户音量)。
 */
export function computeBgmVolume(
  bgmOn: boolean,
  bgmVolume: number,
  ttsActive: boolean
): number {
  if (!bgmOn) return 0;
  const vol = Math.min(1, Math.max(0, bgmVolume));
  return ttsActive ? Math.min(vol, BGM_DUCK_VOLUME) : vol;
}

let bgmAudio: HTMLAudioElement | null = null;
let bgmOn = false;
let bgmVolume = BGM_DEFAULT_VOLUME;

/** 依据当前开关 / 音量 / TTS 状态重设 BGM 实际音量（所有 duck 转换点统一走这里） */
function refreshBgmVolume(): void {
  if (!bgmAudio) return;
  bgmAudio.volume = computeBgmVolume(bgmOn, bgmVolume, isTtsActive());
}

/** TTS 即将开始：不等 isTtsActive 翻转，立即按 duck 规则压低（覆盖网络延迟窗口） */
function duckBgmForTts(): void {
  if (!bgmAudio) return;
  bgmAudio.volume = computeBgmVolume(bgmOn, bgmVolume, true);
}

/** 懒加载 BGM 音频元素（首次开启才创建 Audio，不占首屏资源） */
export function loadBgm(): HTMLAudioElement {
  if (typeof window === "undefined") {
    throw new Error("[audioManager] loadBgm 仅可在浏览器环境调用");
  }
  if (!bgmAudio) {
    bgmAudio = new Audio(BGM_FILE);
    bgmAudio.loop = true;
    bgmAudio.preload = "auto";
  }
  return bgmAudio;
}

/**
 * 播放 BGM（loop）。遵守浏览器自动播放策略：play() 被拦截时静默降级，
 * 内部状态仍为「开」，等下一次用户手势（configureBgm / playBgm）重试。
 * 已在播放时调用为幂等无副作用。
 */
export function playBgm(): void {
  if (typeof window === "undefined") return;
  const audio = loadBgm();
  refreshBgmVolume();
  void audio.play().catch(() => {
    /* 自动播放策略拦截：静默降级 */
  });
}

/** 停止 BGM（保留已缓冲音频与元素，重开时立即续播；绝不触碰 TTS 通道） */
export function stopBgm(): void {
  if (!bgmAudio) return;
  bgmAudio.pause();
}

/** 仅调整 BGM 音量（0–1，内部 clamp），实时生效 */
export function setBgmVolume(volume: number): void {
  bgmVolume = volume;
  refreshBgmVolume();
}

/**
 * UI 同步入口（BgmToggle / 家长中心设置）：开关 + 音量一次传入。
 * - on=true → 尝试播放（处于用户手势链路内通常可成功）；
 * - on=false → 仅停 BGM；TTS / SFX 不受影响。
 */
export function configureBgm(on: boolean, volume: number): void {
  bgmOn = on;
  bgmVolume = volume;
  refreshBgmVolume();
  if (on) playBgm();
  else stopBgm();
}
