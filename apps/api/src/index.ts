import express from "express";
import type { Expense } from "@expense-splitter/shared";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
    res.json({status: "ok"});
});

/*Temporary to show the shared type works across packages
app.get("/demo-expense", (_req, res) => {
    const example: Expense = {
        id: "exp_1", // string
        description: "Dinner",  // string
        amountCents: 4250, // number
        paidByUserId: "user_1", // string
    };
    res.json(example);
});
*/

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => console.log('API running on :${PORT}'));
