import { daysBetween, type IsoDate } from "./dates";
import { createTranslator, type Translate } from "./messages";

export interface RelativeOptions {
  locale?: string;
  translate?: Translate;
}

/**
 * Plain words for how far a due date is from today (both passed in):
 * "today", "tomorrow", "in 3 days", "1 day overdue", "2 days overdue".
 */
export function formatRelativeDue(
  dueOn: IsoDate,
  today: IsoDate,
  options: RelativeOptions = {},
): string {
  const tr =
    options.translate ?? createTranslator(options.locale ? { locale: options.locale } : {});
  const days = daysBetween(today, dueOn);
  if (days === 0) return tr("relative.today");
  if (days === 1) return tr("relative.tomorrow");
  if (days > 1) return tr("relative.inDays", { count: days });
  return tr("relative.overdue", { count: -days });
}
