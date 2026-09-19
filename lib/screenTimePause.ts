/**
 * 使用时长累计的「暂停开关」。
 *
 * 时长记账统一在 `AppStateProvider`（每 5 秒一次），而休息遮罩由
 * `ScreenTimeGuard` 控制——两者是兄弟组件，用 Context 传递会引入
 * 额外的渲染耦合。这里用一个模块级标志位做最小通道：
 * 遮罩期间置为 true，记账循环跳过累加（`last` 仍照常推进，
 * 因此恢复后不会把暂停的这段时间补记进去）。
 */
let paused = false;

/** 置位：true = 暂停累计（休息遮罩期间） */
export function setScreenTimePaused(next: boolean): void {
  paused = next;
}

/** 读取：记账循环据此跳过本轮累加 */
export function isScreenTimePaused(): boolean {
  return paused;
}
