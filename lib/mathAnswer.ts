import { translate } from "./i18nDict";
import type { Locale } from "./workspace";

/** Display only: keep stored answer tokens and option indices unchanged. */
export function formatMathAnswer(answer: string, locale: Locale): string {
  const token = answer.trim().replace(/\s+/g, "");
  if (token === "yes" || token === "是") {
    return translate("math.answer.yes", undefined, locale);
  }
  if (token === "no" || token === "不是") {
    return translate("math.answer.no", undefined, locale);
  }
  const remainder = token.match(/^(\d+)(?:r|余)(\d+)$/i);
  if (remainder) {
    return translate("math.answer.remainder", {
      quotient: remainder[1],
      remainder: remainder[2],
    }, locale);
  }
  return answer;
}
