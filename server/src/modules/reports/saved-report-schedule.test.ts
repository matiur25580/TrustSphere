import test from "node:test";
import assert from "node:assert/strict";
import { scheduleToCron } from "./saved-report-schedule.js";

test("manual saved reports do not create recurring schedules", () => {
  assert.equal(scheduleToCron({ frequency: "manual", dayOfWeek: null, dayOfMonth: null, localTime: "09:00", timeZone: "UTC" }), null);
});

test("weekly schedules map weekday and local time to cron fields", () => {
  assert.equal(scheduleToCron({ frequency: "weekly", dayOfWeek: 1, dayOfMonth: null, localTime: "08:30", timeZone: "Asia/Kolkata" }), "30 8 * * 1");
});

test("monthly schedules map day and local time to cron fields", () => {
  assert.equal(scheduleToCron({ frequency: "monthly", dayOfWeek: null, dayOfMonth: 15, localTime: "17:05", timeZone: "UTC" }), "5 17 15 * *");
});

test("invalid recurring schedule values are rejected", () => {
  assert.throws(() => scheduleToCron({ frequency: "weekly", dayOfWeek: null, dayOfMonth: null, localTime: "08:30", timeZone: "UTC" }));
  assert.throws(() => scheduleToCron({ frequency: "monthly", dayOfWeek: null, dayOfMonth: 31, localTime: "08:30", timeZone: "UTC" }));
});
