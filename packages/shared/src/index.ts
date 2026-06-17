export type Expense = {
    id: string;
    description: string;
    amountCents: number; // using integer val for cents rather than float
    paidByUserId: string;
}
