import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mocks (hoisted before imports) ---
vi.mock("../db/client.js", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));
vi.mock("../redis.js", () => ({ deindexWatch: vi.fn() }));
vi.mock("../kafka.js", () => ({ publishTriggered: vi.fn() }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("../config.js", () => ({
  config: {
    schedulerCron: "* * * * *",
    kafkaTriggeredTopic: "bpollo.watches.triggered",
  },
}));

const { db } = await import("../db/client.js");
const { deindexWatch } = await import("../redis.js");
const { publishTriggered } = await import("../kafka.js");

// Import after mocks are registered
const { sweepExpiredForTest, sweepAbsenceForTest } =
  await import("../scheduler.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function buildSelectChain(rows: object[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function buildUpdateChain() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  mockDb.update.mockReturnValue(chain);
  return chain;
}

const past = new Date(Date.now() - 60_000).toISOString();
const future = new Date(Date.now() + 60_000).toISOString();

const baseWatch = {
  watchId: "watch-1",
  entityId: "entity-1",
  status: "waiting",
  expiresAt: new Date(future),
  triggerConditions: [{ type: "event_match", event_type: "action.created" }],
  expectedSignals: [],
  history: [],
};

// ---------------------------------------------------------------------------
// sweepExpired
// ---------------------------------------------------------------------------

describe("sweepExpired", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does nothing when no expired watches", async () => {
    buildSelectChain([]);
    await sweepExpiredForTest();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("marks expired watches and deindexes from Redis", async () => {
    const expiredWatch = { ...baseWatch, expiresAt: new Date(past) };
    buildSelectChain([expiredWatch]);
    buildUpdateChain();

    await sweepExpiredForTest();

    expect(mockDb.update).toHaveBeenCalled();
    expect(deindexWatch).toHaveBeenCalledWith("watch-1", ["action.created"]);
  });

  it("deindexes multiple event types", async () => {
    const expiredWatch = {
      ...baseWatch,
      expiresAt: new Date(past),
      triggerConditions: [
        { type: "event_match", event_type: "action.created" },
        { type: "event_match", event_type: "action.overdue" },
      ],
    };
    buildSelectChain([expiredWatch]);
    buildUpdateChain();

    await sweepExpiredForTest();

    expect(deindexWatch).toHaveBeenCalledWith("watch-1", [
      "action.created",
      "action.overdue",
    ]);
  });
});

// ---------------------------------------------------------------------------
// sweepAbsence
// ---------------------------------------------------------------------------

describe("sweepAbsence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does nothing when no waiting watches", async () => {
    buildSelectChain([]);
    await sweepAbsenceForTest();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("does nothing when required signal deadline is in the future", async () => {
    const watch = {
      ...baseWatch,
      expectedSignals: [
        {
          event_type: "action.created",
          deadline: future,
          required: true,
          received: false,
        },
      ],
    };
    buildSelectChain([watch]);
    await sweepAbsenceForTest();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("does nothing when required signal is already received", async () => {
    const watch = {
      ...baseWatch,
      expectedSignals: [
        {
          event_type: "action.created",
          deadline: past,
          required: true,
          received: true,
        },
      ],
    };
    buildSelectChain([watch]);
    await sweepAbsenceForTest();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("does nothing when overdue signal is optional (not required)", async () => {
    const watch = {
      ...baseWatch,
      expectedSignals: [
        {
          event_type: "action.created",
          deadline: past,
          required: false,
          received: false,
        },
      ],
    };
    buildSelectChain([watch]);
    await sweepAbsenceForTest();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("triggers watch and publishes to Kafka when required signal is overdue", async () => {
    const watch = {
      ...baseWatch,
      expectedSignals: [
        {
          event_type: "action.created",
          deadline: past,
          required: true,
          received: false,
        },
      ],
    };
    buildSelectChain([watch]);
    buildUpdateChain();

    await sweepAbsenceForTest();

    expect(mockDb.update).toHaveBeenCalled();
    expect(deindexWatch).toHaveBeenCalledWith("watch-1", ["action.created"]);
    expect(publishTriggered).toHaveBeenCalledWith(
      "watch-1",
      "entity-1",
      "absence",
    );
  });

  it("skips watches that are past their hard TTL (handled by sweepExpired)", async () => {
    const watch = {
      ...baseWatch,
      expiresAt: new Date(past),
      expectedSignals: [
        {
          event_type: "action.created",
          deadline: past,
          required: true,
          received: false,
        },
      ],
    };
    buildSelectChain([watch]);
    await sweepAbsenceForTest();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("triggers when at least one required signal is overdue (mixed signals)", async () => {
    const watch = {
      ...baseWatch,
      expectedSignals: [
        {
          event_type: "action.created",
          deadline: future,
          required: true,
          received: false,
        },
        {
          event_type: "action.overdue",
          deadline: past,
          required: true,
          received: false,
        },
      ],
    };
    buildSelectChain([watch]);
    buildUpdateChain();

    await sweepAbsenceForTest();

    expect(publishTriggered).toHaveBeenCalledWith(
      "watch-1",
      "entity-1",
      "absence",
    );
  });
});
