import Link from "next/link";

export const metadata = {
  title: "隐私声明 · 法语宝宝学",
  description: "法语宝宝学的儿童隐私保护说明：不采集、无广告、数据仅存本机",
};

/**
 * 隐私声明页（PRD §7.13.6 / §11 儿童隐私合规，Dev-Plan T4.4 / F51）：
 * 声明「不采集 / 无广告 / 无外链 / 数据仅本机」基线（GDPR-K / COPPA 本地化处理）。
 */
export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">
      <header className="text-center">
        <div className="text-5xl">🛡️</div>
        <h1 className="text-2xl font-bold text-gray-800 mt-2">隐私声明</h1>
        <p className="text-sm text-gray-400 mt-1">
          家长请放心 · 儿童隐私保护说明（2026-09 版）
        </p>
      </header>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4 text-sm text-gray-700 leading-relaxed">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-green-50 p-4 text-center">
            <div className="text-2xl">🚫</div>
            <div className="font-bold text-green-700 mt-1">不采集数据</div>
            <p className="text-xs text-green-700/80 mt-1">
              不收集任何个人信息，无埋点、无统计脚本
            </p>
          </div>
          <div className="rounded-xl bg-purple-50 p-4 text-center">
            <div className="text-2xl">💾</div>
            <div className="font-bold text-purple-700 mt-1">数据仅存本机</div>
            <p className="text-xs text-purple-700/80 mt-1">
              学习记录只保存在此浏览器的本地存储，不上传
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 p-4 text-center">
            <div className="text-2xl">📺</div>
            <div className="font-bold text-amber-700 mt-1">无广告</div>
            <p className="text-xs text-amber-700/80 mt-1">
              全站没有任何第三方广告或追踪组件
            </p>
          </div>
          <div className="rounded-xl bg-blue-50 p-4 text-center">
            <div className="text-2xl">🔗</div>
            <div className="font-bold text-blue-700 mt-1">无外链跳转</div>
            <p className="text-xs text-blue-700/80 mt-1">
              学习内容不包含跳转到外部网站的链接
            </p>
          </div>
        </div>

        <h2 className="font-bold text-gray-800 pt-2">1. 我们处理哪些数据？</h2>
        <p>
          本网站<strong>没有账号系统</strong>，不需要注册登录。孩子的学习进度（测验记录、打卡、积分、星星、学段设置等）
          全部保存在<strong>您设备上的浏览器本地存储（localStorage）</strong>中，不会发送到任何服务器。
          清除浏览器数据或使用「家长中心 → 清空全部数据」即可彻底删除。
        </p>

        <h2 className="font-bold text-gray-800 pt-2">2. 语音功能如何工作？</h2>
        <p>
          「听一听」朗读使用浏览器内置语音合成，或经服务器代理的公开语音服务（只发送被点击朗读的那句文本，不含任何身份信息）。
          「跟读打分」使用浏览器语音识别能力，识别过程由浏览器调用其语音服务完成，本网站<strong>不录制、不存储</strong>任何声音。
        </p>

        <h2 className="font-bold text-gray-800 pt-2">3. 儿童保护合规</h2>
        <p>
          本网站面向儿童设计：无广告、无外部链接、无用户生成内容输入框、无社交功能；
          家长相关的设置（学段、时长、内容开关）均位于「家长中心」，需通过家长验证才能进入。
          数据仅在本机处理的模式符合 GDPR-K 与 COPPA 对「离线本地处理」的基线要求。
        </p>

        <h2 className="font-bold text-gray-800 pt-2">4. 备份与迁移</h2>
        <p>
          您可以在家长中心导出学习数据备份文件（JSON），该文件保存在您的设备上，由您自行保管；导入也仅在本机完成。
        </p>

        <p className="text-xs text-gray-400 pt-2 border-t border-dashed">
          本政策更新后将在本页面公布。如有疑问，请通过仓库 Issues 联系维护者。
        </p>
      </section>

      <div className="text-center">
        <Link href="/" className="btn-secondary inline-block">
          ← 返回首页
        </Link>
      </div>
    </div>
  );
}
