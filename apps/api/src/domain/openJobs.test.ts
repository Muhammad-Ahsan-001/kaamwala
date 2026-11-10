import type { WorkerProfile } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  workerProfile: { findMany: vi.fn() },
  crew: { count: vi.fn(), findMany: vi.fn() },
}));
vi.mock("../db", () => ({ prisma: db }));
vi.mock("../env", () => ({ env: { OPEN_JOB_RADIUS_KM: 15 } }));

import { openJobRecipients, workerMatchesOpenJob } from "./openJobs";

const G9 = { lat: 33.6885, lng: 73.0345 };
const KARACHI = { lat: 24.82, lng: 67.03 };
const electricJob = { mode: "open" as const, categoryId: "electrician", ...G9 };

const profile = (over: Partial<WorkerProfile>) => ({ id: "w1", approved: true, categoryIds: ["plumber"], feedCategoryIds: [], ...G9, ...over }) as WorkerProfile;

const candidate = (userId: string, over: Record<string, unknown>) => ({
  userId,
  status: "available",
  approved: true,
  categoryIds: ["plumber"],
  feedCategoryIds: [],
  user: { role: "worker", suspended: false },
  ...G9,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("workerMatchesOpenJob", () => {
  it("shows a worker who chose nothing only their own trades", async () => {
    expect(await workerMatchesOpenJob(profile({}), { ...electricJob, categoryId: "plumber" })).toBe(true);
    expect(await workerMatchesOpenJob(profile({}), electricJob)).toBe(false);
  });

  it("shows a chosen trade outside the worker's own", async () => {
    expect(await workerMatchesOpenJob(profile({ feedCategoryIds: ["electrician"] }), electricJob)).toBe(true);
  });

  it("does not show an own trade the worker left out", async () => {
    const worker = profile({ feedCategoryIds: ["electrician"] });
    expect(await workerMatchesOpenJob(worker, { ...electricJob, categoryId: "plumber" })).toBe(false);
  });

  it("keeps the radius and approval rules for a chosen trade", async () => {
    expect(await workerMatchesOpenJob(profile({ feedCategoryIds: ["electrician"], ...KARACHI }), electricJob)).toBe(false);
    expect(await workerMatchesOpenJob(profile({ feedCategoryIds: ["electrician"], approved: false }), electricJob)).toBe(false);
  });

  it("leaves crew jobs to the crew's trades", async () => {
    db.crew.count.mockResolvedValue(0);
    const crewJob = { ...electricJob, mode: "crew" as const };
    expect(await workerMatchesOpenJob(profile({ feedCategoryIds: ["electrician"] }), crewJob)).toBe(false);
    db.crew.count.mockResolvedValue(1);
    expect(await workerMatchesOpenJob(profile({}), crewJob)).toBe(true);
  });
});

describe("openJobRecipients", () => {
  it("reaches who chose the trade and who has it by default, and nobody else", async () => {
    db.workerProfile.findMany.mockResolvedValue([
      candidate("chose-it", { feedCategoryIds: ["electrician"] }),
      candidate("default-own", { categoryIds: ["electrician"] }),
      candidate("left-it-out", { categoryIds: ["electrician"], feedCategoryIds: ["painter"] }),
      candidate("other-trade", {}),
    ]);
    const recipients = await openJobRecipients(electricJob);
    expect(recipients.map((r) => r.userId)).toEqual(["chose-it", "default-own"]);
  });

  it("asks the database for both ways of wanting the trade", async () => {
    db.workerProfile.findMany.mockResolvedValue([]);
    await openJobRecipients(electricJob);
    expect(db.workerProfile.findMany.mock.calls[0]?.[0].where).toEqual({
      OR: [{ categoryIds: { has: "electrician" } }, { feedCategoryIds: { has: "electrician" } }],
    });
  });

  it("keeps the radius, approval, suspension and readiness rules", async () => {
    const chose = { feedCategoryIds: ["electrician"] };
    db.workerProfile.findMany.mockResolvedValue([
      candidate("far", { ...chose, ...KARACHI }),
      candidate("unapproved", { ...chose, approved: false }),
      candidate("suspended", { ...chose, user: { role: "worker", suspended: true } }),
      candidate("busy", { ...chose, status: "offline" }),
      candidate("free", chose),
    ]);
    const recipients = await openJobRecipients(electricJob);
    expect(recipients).toEqual([
      { userId: "busy", role: "worker", ready: false },
      { userId: "free", role: "worker", ready: true },
    ]);
  });

  it("leaves crew jobs to the crew's trades", async () => {
    db.crew.findMany.mockResolvedValue([]);
    await openJobRecipients({ ...electricJob, mode: "crew" });
    expect(db.workerProfile.findMany).not.toHaveBeenCalled();
    expect(db.crew.findMany.mock.calls[0]?.[0].where).toEqual({ categoryIds: { has: "electrician" } });
  });
});
