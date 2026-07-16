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

  const [inviteCode, setInviteCode] = useState("");

  const [currentUserId, setCurrentUserId] = useState("");

  const [leaveError, setLeaveError] = useState("");

  const [showExpenseForm, setShowExpenseForm] = useState(false);

  const [payAmounts, setPayAmounts] = useState<Record<number, string>>({});

  const [notice, setNotice] = useState("");

  const loadData = useCallback(() => {
    Promise.all([
      api<Expense[]>(`/groups/${groupId}/expenses`),
      api<{ balances: Balance[]; settlements: Settlement[] }>(
        `/groups/${groupId}/balances`
      ),
      api<Member[]>(`/groups/${groupId}/members`),
      api<{ inviteCode: string }>(`/groups/${groupId}`),
      api<{ user: { id: string } }>(`/me`),
    ])
      .then(([expenseData, balanceData, memberData, groupData, meData]) => {
        setExpenses(expenseData);
        setSettlements(balanceData.settlements);
        setMembers(memberData);
        setInviteCode(groupData.inviteCode);
        setCurrentUserId(meData.user.id);
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

  async function handleLeave() {
    const confirmed = window.confirm(
      "Are you sure you want to leave this group?"
    );
    if (!confirmed) return;
    setLeaveError("");
    try {
      await api(`/groups/${groupId}/leave`, { method: "POST" });
      router.push("/groups"); // back to dashboard after leaving
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : "Failed to leave group");
    }
  }

  async function handleSettle(
    toUserId: string,
    requestedCents: number,
    owedCents: number
  ) {
    if (!Number.isFinite(requestedCents) || requestedCents <= 0) {
      setNotice("Enter a valid amount.");
      return;
    }

    const amountCents = Math.min(requestedCents, owedCents);
    const wasClamped = requestedCents > owedCents;

    try {
      await api(`/groups/${groupId}/payments`, {
        method: "POST",
        body: { toUserId, amountCents },
      });
      loadData();
      if (wasClamped) {
        setNotice(
          `Only $${(amountCents / 100).toFixed(2)} was paid to avoid overpaying.`
        );
        // Clear the message after 5 seconds
        setTimeout(() => setNotice(""), 5000);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to settle up");
    }
  }

  const nameFor = (userId:string) =>
    members.find((m) => m.id === userId)?.name ?? "Unknown";

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", padding: "0 1rem" }}>
      <button onClick={() => router.push("/groups")} style={{ marginBottom: 16 }}>
        ← Back to groups
      </button>
      {inviteCode && (
        <div style={{ margin: "1rem 0", padding: 12, background: "#000000", borderRadius: 4 }}>
          <strong>Invite code:</strong> {inviteCode}{" "}
          <button
            onClick={() => navigator.clipboard.writeText(inviteCode)}
            style={{ marginLeft: 8, padding: "4px 8px" }}
          >
            Copy
          </button>
        </div>
      )}

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
      {!showExpenseForm ? (
        <div style={{ textAlign: "center", margin: "1rem 0"}}>
          <button
            onClick={() => setShowExpenseForm(true)}
            style={{ padding: "8px 16px" }}
          >
            Add expense
          </button>
        </div>
      ) : (
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
          <button
            type="button"
            onClick={() => setShowExpenseForm(false)}
            style={{ padding: "8px 16px" }}
          >
            Hide
          </button>
        </form>
      )}
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
      {notice && (
        <p style={{ color: "#888", marginBottom: 8 }}>{notice}</p>
      )}
      {settlements.length === 0 ? (
        <p>Everyone is settled up.</p>
      ) : (
        <ul>
          {settlements.map((s, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              {nameFor(s.fromUserId)} owes {nameFor(s.toUserId)}: $
              {(s.amountCents / 100).toFixed(2)}
              {s.fromUserId === currentUserId && (
                <span style={{ marginLeft: 12 }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={(s.amountCents / 100).toFixed(2)}
                    placeholder="Amount"
                    value={payAmounts[i] ?? ""}
                    onChange={(e) =>
                      setPayAmounts((prev) => ({ ...prev, [i]: e.target.value }))
                    }
                    style={{ width: 90, padding: 4, marginRight: 8 }}
                  />
                  <button
                    onClick={() =>
                      handleSettle(
                        s.toUserId,
                        Math.round(parseFloat(payAmounts[i] ?? "0") * 100),
                        s.amountCents
                      )
                    }
                  >
                    Pay

                  </button>
                  <button
                  onClick={() => handleSettle(s.toUserId, s.amountCents, s.amountCents)}
                  style={{ padding: "4px 32px"}}
                  >

                    Pay in full
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div style={{ textAlign: "center", marginTop: 48 }}>
        <button
          onClick={handleLeave}
          style={{ color: "crimson", padding: "8px 16px" }}
        >
          Leave group
        </button>
        {leaveError && (
          <p style={{ color: "crimson", marginTop: 8 }}>{leaveError}</p>
        )}
      </div>
    </div>
  );
}
