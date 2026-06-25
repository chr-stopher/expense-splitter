export type Expense = {
    id: string;
    description: string;
    amountCents: number; // using integer val for cents rather than float
    paidByUserId: string;
}

/**
 * Splits a total (in integer cents) as evenly as possiible among 'numPeople',
 * distributing any leftover cents so the shares always sum to the total
 */

export function splitEqually(totalCents: number, numPeople: number): number[] {
    if (numPeople <= 0) throw new Error("Cannot split among zero people");

    const base = Math.floor(totalCents / numPeople);
    const remainder = totalCents - base * numPeople; // leftover cents

    // Divide remainder among the first people (one cent each)
    return Array.from({ length: numPeople }, (_, i) =>
     i < remainder ? base + 1: base
    );
}
