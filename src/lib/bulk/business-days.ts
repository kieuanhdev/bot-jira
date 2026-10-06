/**
 * Business Days & Due Date Calculation for Bulk Task Creation.
 * Implements section 18.6 of docs/AI_BULK_TASK_GENERATION_PLAN.md.
 */

export type ProjectCalendar = {
  /** Array of ISO dates 'YYYY-MM-DD' that are non-working holidays */
  holidays?: string[];
  /** Days of the week considered weekend: 0 = Sunday, 1 = Monday, ..., 6 = Saturday. Default: [0, 6] */
  weekendDays?: number[];
};

export type DueDateRounding = "ceil" | "floor" | "exact";

export type AddBusinessDaysOptions = {
  rounding?: DueDateRounding;
};

export type DueDateEvaluationInput = {
  plannedStartDate?: string | null;
  points?: number | null;
  cycleTimeUpperDays?: number | null;
  businessDeadline?: string | null;
  businessDeadlineReason?: string | null;
  calendar?: ProjectCalendar;
};

export type DueDateEvaluationResult = {
  dueDate: string | null;
  isOverridden: boolean;
  warnings: string[];
  errors: string[];
  calculatedBaselineDate: string | null;
};

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates whether a string is a valid ISO date YYYY-MM-DD.
 */
export function isValidDateString(dateStr: string | null | undefined): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  if (!ISO_DATE_REGEX.test(dateStr)) return false;
  const [year, month, day] = dateStr.split("-").map((v) => parseInt(v, 10));
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Formats a Date object to YYYY-MM-DD in UTC.
 */
export function formatIsoDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parses YYYY-MM-DD string into a UTC Date object at midnight.
 */
export function parseIsoDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map((v) => parseInt(v, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Checks if a given date is a non-working business day (weekend or holiday).
 */
export function isBusinessDay(date: Date | string, calendar?: ProjectCalendar): boolean {
  const d = typeof date === "string" ? parseIsoDate(date) : date;
  const weekendDays = calendar?.weekendDays ?? [0, 6]; // 0=Sunday, 6=Saturday
  const dayOfWeek = d.getUTCDay();

  if (weekendDays.includes(dayOfWeek)) {
    return false;
  }

  if (calendar?.holidays && calendar.holidays.length > 0) {
    const iso = formatIsoDate(d);
    if (calendar.holidays.includes(iso)) {
      return false;
    }
  }

  return true;
}

/**
 * Finds the nearest next business day. If date is already a business day, returns it.
 */
export function ensureBusinessDay(date: Date | string, calendar?: ProjectCalendar): Date {
  const curr = typeof date === "string" ? parseIsoDate(date) : new Date(date.getTime());
  while (!isBusinessDay(curr, calendar)) {
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return curr;
}

/**
 * Adds business days to a planned start date according to project calendar rules.
 *
 * Rules:
 * - If start date is on weekend/holiday, it first shifts forward to the next business day.
 * - businessDays is rounded up to the nearest integer by default (e.g. 1.5 -> 2 days, 2.5 -> 3 days).
 * - If businessDays is 1, due date is the end of the same business day (or next day depending on cycle definition;
 *   per section 18.5/18.6: 1 point = 1 day cycle time -> due date is the start date itself if start date is day 1).
 *   Specifically: add (days - 1) full business days to reach completion date.
 *   E.g., Start Monday with 1 day work -> Due Monday.
 *   Start Monday with 2 days work -> Due Tuesday.
 *   Start Friday with 2 days work -> Due Monday.
 */
export function addBusinessDays(
  startDateStr: string,
  businessDays: number,
  calendar?: ProjectCalendar,
  options?: AddBusinessDaysOptions
): string {
  if (!isValidDateString(startDateStr)) {
    throw new Error(`Invalid planned start date: ${startDateStr}`);
  }

  if (businessDays <= 0) {
    const start = ensureBusinessDay(startDateStr, calendar);
    return formatIsoDate(start);
  }

  const rounding = options?.rounding ?? "ceil";
  let targetDays: number;
  if (rounding === "ceil") {
    targetDays = Math.ceil(businessDays);
  } else if (rounding === "floor") {
    targetDays = Math.max(1, Math.floor(businessDays));
  } else {
    targetDays = Math.round(businessDays);
  }

  const curr = ensureBusinessDay(startDateStr, calendar);

  // targetDays = 1 means task finishes on the initial business day itself.
  // targetDays = 2 means task takes 2 business days (initial day + 1 more business day).
  let daysToAdd = targetDays - 1;

  while (daysToAdd > 0) {
    curr.setUTCDate(curr.getUTCDate() + 1);
    if (isBusinessDay(curr, calendar)) {
      daysToAdd--;
    }
  }

  return formatIsoDate(curr);
}

/**
 * Evaluates Due Date considering planned start date, cycle time, and business deadline override.
 *
 * Rules:
 * - If plannedStartDate is missing: dueDate cannot be computed; returns warning/error.
 * - If businessDeadline is earlier than baseline dueDate:
 *     Requires businessDeadlineReason. If missing, registers warning/error.
 *     If reason provided, overrides dueDate with businessDeadline.
 * - Does not automatically shift due date when late.
 */
export function evaluateDueDateWithDeadline(input: DueDateEvaluationInput): DueDateEvaluationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  let calculatedBaselineDate: string | null = null;

  if (input.plannedStartDate) {
    if (!isValidDateString(input.plannedStartDate)) {
      errors.push(`Ngày bắt đầu kế hoạch không hợp lệ (định dạng YYYY-MM-DD): "${input.plannedStartDate}"`);
    } else {
      const days = input.cycleTimeUpperDays ?? 1;
      try {
        calculatedBaselineDate = addBusinessDays(input.plannedStartDate, days, input.calendar);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Lỗi tính toán Due Date");
      }
    }
  } else {
    warnings.push("Chưa cung cấp ngày bắt đầu kế hoạch, không thể tự động tính Due Date theo baseline");
  }

  let finalDueDate: string | null = calculatedBaselineDate;
  let isOverridden = false;

  if (input.businessDeadline) {
    if (!isValidDateString(input.businessDeadline)) {
      errors.push(`Deadline nghiệp vụ không hợp lệ (định dạng YYYY-MM-DD): "${input.businessDeadline}"`);
    } else {
      const deadline = input.businessDeadline;

      if (calculatedBaselineDate) {
        if (deadline < calculatedBaselineDate) {
          // Deadline is earlier than cycle time baseline
          const hasReason = Boolean(input.businessDeadlineReason && input.businessDeadlineReason.trim().length > 0);
          if (!hasReason) {
            errors.push(
              `Deadline nghiệp vụ (${deadline}) sớm hơn baseline (${calculatedBaselineDate}) nhưng thiếu lý do bắt buộc (businessDeadlineReason)`
            );
          } else {
            finalDueDate = deadline;
            isOverridden = true;
          }
        } else {
          // Deadline is on or later than baseline
          finalDueDate = deadline;
          isOverridden = true;
        }
      } else {
        // No baseline, but deadline exists
        finalDueDate = deadline;
        isOverridden = true;
      }
    }
  }

  return {
    dueDate: finalDueDate,
    isOverridden,
    warnings,
    errors,
    calculatedBaselineDate,
  };
}
