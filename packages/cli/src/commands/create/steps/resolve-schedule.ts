import type { Ora } from "ora";
import type { CreateContext } from "../types.js";

interface ResolvedSchedule {
  cron: string;
  timezone: string;
}

const DAY_MAP: Record<string, string> = {
  monday: "MON",
  tuesday: "TUE",
  wednesday: "WED",
  thursday: "THU",
  friday: "FRI",
  saturday: "SAT",
  sunday: "SUN",
  mon: "MON",
  tue: "TUE",
  wed: "WED",
  thu: "THU",
  fri: "FRI",
  sat: "SAT",
  sun: "SUN",
};

/**
 * Resolve schedule from intent to cron expression.
 * Pure function — no LLM call needed.
 */
export function resolveSchedule(
  ctx: CreateContext,
  spinner: Ora
): ResolvedSchedule {
  spinner.start("Resolving schedule...");

  const schedule = ctx.intent?.schedule;
  const timezone = schedule?.timezone ?? "America/New_York";

  // Parse time (default 9:00 for daily, 10:00 for weekly)
  let hour = 9;
  let minute = 0;

  if (schedule?.time) {
    const timeMatch = schedule.time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
      minute = parseInt(timeMatch[2] ?? "0", 10);
      if (timeMatch[3]?.toLowerCase() === "pm" && hour < 12) hour += 12;
      if (timeMatch[3]?.toLowerCase() === "am" && hour === 12) hour = 0;
    }
  }

  let cron: string;
  const frequency = schedule?.frequency ?? "weekly";

  switch (frequency) {
    case "daily":
      cron = `${minute} ${hour} * * *`;
      break;
    case "weekly": {
      const day = schedule?.dayOfWeek
        ? DAY_MAP[schedule.dayOfWeek.toLowerCase()] ?? "SAT"
        : "SAT";
      hour = schedule?.time ? hour : 10; // Default to 10am for weekly
      cron = `${minute} ${hour} * * ${day}`;
      break;
    }
    case "biweekly": {
      // Approximate: run on 1st and 15th
      hour = schedule?.time ? hour : 10;
      cron = `${minute} ${hour} 1,15 * *`;
      break;
    }
    case "monthly": {
      hour = schedule?.time ? hour : 10;
      cron = `${minute} ${hour} 1 * *`;
      break;
    }
    default:
      cron = `${minute} ${hour} * * SAT`;
  }

  spinner.succeed(`Schedule: ${cron} (${timezone})`);

  return { cron, timezone };
}
