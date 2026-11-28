export type SavedReportSchedule = {
  frequency: "manual" | "weekly" | "monthly";
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  localTime: string;
  timeZone: string;
};

export function scheduleToCron(schedule: SavedReportSchedule): string | null {
  if (schedule.frequency === "manual") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(schedule.localTime);
  if (!match) throw new Error("Saved report schedule contains an invalid local time.");
  const [, hour, minute] = match;
  if (schedule.frequency === "weekly") {
    if (schedule.dayOfWeek === null || schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6) {
      throw new Error("A weekday is required for weekly report schedules.");
    }
    return `${Number(minute)} ${Number(hour)} * * ${schedule.dayOfWeek}`;
  }
  if (schedule.dayOfMonth === null || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 28) {
    throw new Error("A day from 1 to 28 is required for monthly report schedules.");
  }
  return `${Number(minute)} ${Number(hour)} ${schedule.dayOfMonth} * *`;
}
