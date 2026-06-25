import { describe, it, expect } from "vitest";
import { splitEqually } from "./index";

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
