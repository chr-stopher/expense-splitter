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


export type ExpenseInput = {
    paidByUserId: string;
    splits: { userId: string; amountCents: number }[];
};

export type Balance = {
    userId: string;
    netCents: number; // (+) = owed | (-) = owes
};

/**
 * Computes each person's net balance (paid minus owed) across all expenses.
 * The returned balances always sum to zero (0)
 */

export function computeBalances(expenses: ExpenseInput[]): Balance[] {
    const net = new Map<string, number>();
    const bump = (userId: string, delta: number) =>
        net.set(userId, (net.get(userId) ?? 0) + delta);

    for (const expense of expenses) {
        // The payer fronted the full amount, so credit them with everything paid.
        const total = expense.splits.reduce((sum, s) => sum + s.amountCents, 0);
        bump(expense.paidByUserId, total);

        // Each person is debited their own share.
        for (const split of expense.splits) {
            bump(split.userId, -split.amountCents);
        }
    }

    return Array.from(net, ([userId, netCents]) => ({ userId, netCents }));
}


export type Settlement = {
    fromUserId: string; // debtor (pays)
    toUserId: string; // creditor (receives)
    amountCents: number;
};

/**
 * Given net balances, produces a small set of payments that settle everyone to zero
 * Uses greedy approach (Largest debtor matches with largest creditor).
 * Assumes balances sum to zero
 */
export function computeSettlements(balances: Balance[]): Settlement[] {
    // Work on copies so user data is unaffected
    const debtors = balances
        .filter((b) => b.netCents < 0)
        .map((b) => ({ ...b }));
    const creditors = balances
        .filter((b) => b.netCents > 0)
        .map((b) => ({ ...b }));

    const settlements: Settlement[] = [];

    while (debtors.length > 0 && creditors.length > 0) {
        // Largest debtor and largest creditor
        debtors.sort((a, b) => a.netCents - b.netCents);
        creditors.sort((a, b) => b.netCents - a.netCents);

        const debtor = debtors[0];
        const creditor = creditors[0];

        // Settle the smaller of the two values
        const amount = Math.min(-debtor.netCents, creditor.netCents);

        settlements.push({
            fromUserId: debtor.userId,
            toUserId: creditor.userId,
            amountCents: amount,
        });

        debtor.netCents += amount;
        creditor.netCents -= amount;

        // Drop anyone who has reached zero
        if (debtor.netCents === 0) debtors.shift();
        if (creditor.netCents === 0) creditors.shift();
    }

    return settlements;
}
