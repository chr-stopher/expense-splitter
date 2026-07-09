"use client";

import { useState, useEffect, useCallback, type SyntheticEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";

type Balance = { userId: string; netCents: number };
type Settlement = { fromUserId: string; toUserId: string; amountCents: number };

type Split = { userId: string; amountCents: number };
type Expense = {
  id: string;
  description: string;
  amountCents: number;
  paidById: string;
  createdAt: string;
  splits: Split[];
  paidBy: { id: string; name: string };
};

type Member = { id: string; name: string, role: string };

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.groupId as string;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [settlements, setSettlements] = useState<Settlement[]>([]);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);

  const loadData = useCallback(() => {
    Promise.all([
      api<Expense[]>(`/groups/${groupId}/expenses`),
      api<{ balances: Balance[]; settlements: Settlement[] }>(
        `/groups/${groupId}/balances`
      ),
      api<Member[]>(`/groups/${groupId}/members`),
    ])
      .then(([expenseData, balanceData, memberData]) => {
        setExpenses(expenseData);
        setSettlements(balanceData.settlements);
        setMembers(memberData);
      })
      .catch((err) => {
        if (err instanceof Error && err.message.includes("authenticated")) {
          router.push("/login");
        } else {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      })
      .finally(() => setLoading(false));
  }, [groupId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <p style={{ padding: "2rem" }}>Loading...</p>;
  if (error) return <p style={{ padding: "2rem", color: "crimson" }}>{error}</p>;

  async function handleAddExpense(e: SyntheticEvent) {
    e.preventDefault();
    // Convert the dollar input to integer cents for the API
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!description.trim() || !Number.isFinite(amountCents) || amountCents <= 0) {
      return;
    }
    setSubmitting(true);
    try {
      await api(`/groups/${groupId}/expenses`, {
        method: "POST",
        body: { description, amountCents },
      });
      setDescription("");
      setAmount("");
      loadData(); // refresh expenses AND balances after adding
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add expense");
    } finally {
      setSubmitting(false);
    }
  }

  const nameFor = (userId:string) =>
    members.find((m) => m.id === userId)?.name ?? "Unknown";

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", padding: "0 1rem" }}>
      <button onClick={() => router.push("/groups")} style={{ marginBottom: 16 }}>
        ← Back to groups
      </button>

      <h1>Expenses</h1>
      <h2 style={{ marginTop: 24 }}>Members ({members.length})</h2>
      {members.length === 0 ? (
        <p>No members yet.</p>
      ) : (
        <ul>
          {members.map((member) => (
            <li key={member.id} style={{ marginBottom: 4 }}>
              {member.name}
              {member.role === "owner" && (
                <span style={{ color: "#666", marginLeft: 6 }}>(owner)</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAddExpense} style={{ margin: "1rem 0", display: "flex", gap: 8 }}>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          style={{ flex: 2, padding: 8 }}
        />
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount ($)"
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
          {submitting ? "Adding..." : "Add"}
        </button>
      </form>
      {expenses.length === 0 ? (
        <p>No expenses yet.</p>
      ) : (
        <ul>
          {expenses.map((expense) => (
            <li key={expense.id} style={{ marginBottom: 8 }}>
              <strong>{expense.description}</strong> —{" "}
              ${(expense.amountCents / 100).toFixed(2)}{" "}
              <span style={{ color: "#666" }}>paid by {expense.paidBy.name}</span>
            </li>
          ))}
        </ul>
      )}
      <h2 style={{ marginTop: 32 }}>Balances</h2>
      {settlements.length === 0 ? (
        <p>Everyone is settled up.</p>
      ) : (
        <ul>
          {settlements.map((s, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              {nameFor(s.fromUserId)} owes {nameFor(s.toUserId)}: $
              {(s.amountCents / 100).toFixed(2)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
