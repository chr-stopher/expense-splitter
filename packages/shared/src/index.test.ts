import { describe, it, expect } from "vitest";
import { splitEqually, computeBalances, computeSettlements } from "./index";


// Tests for split equally

describe("splitEqually", () => {
    it("splits an evenly divisible amount equally", () => {
        expect(splitEqually(900, 3)).toEqual([300, 300, 300]);
    });

    it("distributes leftover cents to the first people", () => {
        // 1000 / 3 = 333.33...; remainder of 1 cent goes to the first person
        expect(splitEqually(1000, 3)).toEqual([334, 333, 333]);
    });

    it("distributes multiple leftover cents to the first people", () => {
        // 1001 / 3 = 333.67; remainder of 2 cents goes to the first two people
        expect(splitEqually(1001, 3)).toEqual([334, 334, 333]);
    });

    it("handles a split between two people with an odd total", () => {
        expect(splitEqually(1001, 2)).toEqual([501, 500]);
    });

    it("handles a single person getting the whole amount", () => {
        expect(splitEqually(1000, 1)).toEqual([1000]);
    });

    it("always produces shares that sum to the exact total", () => {
        const total = 1234;
        const shares = splitEqually(total, 7);
        const sum = shares.reduce((acc, n) => acc + n, 0);
        expect(sum).toBe(total);
    });

    it("throws when splitting among zero people", () => {
        expect(() => splitEqually(1000, 0)).toThrow();
    });
});

// Tests for compute balances

describe("computeBalances", () => {
  it("computes net balances for a simple two-expense group", () => {
    const balances = computeBalances([
      {
        paidByUserId: "alice",
        splits: [
          { userId: "alice", amountCents: 1000 },
          { userId: "bob", amountCents: 1000 },
          { userId: "carol", amountCents: 1000 },
        ],
      },
      {
        paidByUserId: "bob",
        splits: [
          { userId: "alice", amountCents: 500 },
          { userId: "bob", amountCents: 500 },
          { userId: "carol", amountCents: 500 },
        ],
      },
    ]);

    const byUser = Object.fromEntries(balances.map((b) => [b.userId, b.netCents]));
    expect(byUser.alice).toBe(1500);
    expect(byUser.bob).toBe(0);
    expect(byUser.carol).toBe(-1500);
  });

  it("always produces balances that sum to zero", () => {
    const balances = computeBalances([
      {
        paidByUserId: "x",
        splits: [
          { userId: "x", amountCents: 334 },
          { userId: "y", amountCents: 333 },
          { userId: "z", amountCents: 333 },
        ],
      },
    ]);
    const sum = balances.reduce((acc, b) => acc + b.netCents, 0);
    expect(sum).toBe(0);
  });

  it("returns an empty array when there are no expenses", () => {
    expect(computeBalances([])).toEqual([]);
  });
});

// Tests for settlements

describe("computeSettlements", () => {
  it("settles a simple one-debtor-one-creditor case", () => {
    const settlements = computeSettlements([
      { userId: "alice", netCents: 1500 },
      { userId: "bob", netCents: 0 },
      { userId: "carol", netCents: -1500 },
    ]);

    expect(settlements).toEqual([
      { fromUserId: "carol", toUserId: "alice", amountCents: 1500 },
    ]);
  });

  it("fully settles everyone (all balances reach zero)", () => {
    const balances = [
      { userId: "a", netCents: 2000 },
      { userId: "b", netCents: -500 },
      { userId: "c", netCents: -1500 },
    ];
    const settlements = computeSettlements(balances);

    // Apply the settlements back and confirm everyone nets to zero.
    const final = new Map(balances.map((b) => [b.userId, b.netCents]));
    for (const s of settlements) {
      final.set(s.fromUserId, final.get(s.fromUserId)! + s.amountCents);
      final.set(s.toUserId, final.get(s.toUserId)! - s.amountCents);
    }
    for (const net of final.values()) {
      expect(net).toBe(0);
    }
  });

  it("returns no settlements when everyone is already square", () => {
    expect(
      computeSettlements([
        { userId: "a", netCents: 0 },
        { userId: "b", netCents: 0 },
      ])
    ).toEqual([]);
  });
});
