"use client";

import { useState, useEffect, useCallback, type SyntheticEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/Components/Button";

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

type Payment = {
  id: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  status: string;
};

type Member = {
  id: string;
  name: string;
  role: string;
  venmoHandle: string | null;
  cashappTag: string | null;
  zellePhone: string | null;
  acceptsCash: boolean;
};

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

  const [payments, setPayments] = useState<Payment[]>([]);

  const loadData = useCallback(() => {
    Promise.all([
      api<Expense[]>(`/groups/${groupId}/expenses`),
      api<{ balances: Balance[]; settlements: Settlement[] }>(
        `/groups/${groupId}/balances`
      ),
      api<Member[]>(`/groups/${groupId}/members`),
      api<{ inviteCode: string }>(`/groups/${groupId}`),
      api<{ user: { id: string } }>(`/me`),
      api<Payment[]>(`/groups/${groupId}/payments`)
    ])
      .then(([expenseData, balanceData, memberData, groupData, meData, paymentData]) => {
        setExpenses(expenseData);
        setSettlements(balanceData.settlements);
        setMembers(memberData);
        setInviteCode(groupData.inviteCode);
        setCurrentUserId(meData.user.id);
        setPayments(paymentData);
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

  async function handleConfirmPayment(paymentId: string) {
    try {
      await api(`/payments/${paymentId}/confirm`, { method: "POST" });
      loadData(); // refresh — the confirmed payment now clears the debt
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to confirm payment");
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

  const paymentMethodsFor = (userId: string) => {
    const member = members.find((m) => m.id === userId);
    if (!member) return [];
    const methods: { icon: string; label: string }[] = [];
    if (member.venmoHandle) methods.push({ icon: "💸", label: `Venmo ${member.venmoHandle}` });
    if (member.cashappTag) methods.push({ icon: "💵", label: `CashApp ${member.cashappTag}` });
    if (member.zellePhone) methods.push({ icon: "🏦", label: `Zelle ${member.zellePhone}` });
    if (member.acceptsCash) methods.push({ icon: "💰", label: "Cash" });
    return methods;
  };

  const nameFor = (userId:string) =>
    members.find((m) => m.id === userId)?.name ?? "Unknown";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => router.push("/groups")}
        className="text-text-muted hover:text-text transition-colors mb-6"
      >
        ← Back to groups
      </button>

      {inviteCode && (
        <div className="bg-surface rounded-2xl p-4 mb-6 flex items-center justify-between gap-3">
          <div>
            <span className="text-sm text-text-muted">Invite code</span>
            <p className="font-mono text-lg">{inviteCode}</p>
          </div>
          <Button variant="ghost" onClick={() => navigator.clipboard.writeText(inviteCode)}>
            Copy
          </Button>
        </div>
      )}

      <div className="bg-surface rounded-2xl p-5 mb-6">
        <h2 className="text-lg mb-3">Members ({members.length})</h2>
        {members.length === 0 ? (
          <p className="text-text-muted">No members yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((member) => (
              <li key={member.id} className="flex items-center gap-2">
                <span>{member.name}</span>
                {member.role === "owner" && (
                  <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
                    owner
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-surface rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg">Expenses</h2>
          {!showExpenseForm && (
            <Button variant="accent" onClick={() => setShowExpenseForm(true)}>
              Add expense
            </Button>
          )}
        </div>

        {showExpenseForm && (
          <form onSubmit={handleAddExpense} className="flex flex-col sm:flex-row gap-2 mb-4">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              className="flex-1 rounded-full px-4 py-2 bg-background border border-primary/20 outline-none focus:border-primary"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount ($)"
              className="sm:w-32 rounded-full px-4 py-2 bg-background border border-primary/20 outline-none focus:border-primary"
            />
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Adding..." : "Add"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowExpenseForm(false)}>
              Cancel
            </Button>
          </form>
        )}

        {expenses.length === 0 ? (
          <p className="text-text-muted">No expenses yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {expenses.map((expense) => (
              <li key={expense.id} className="flex justify-between items-center py-2 border-b border-primary/10 last:border-0">
                <span className="font-medium">{expense.description}</span>
                <span className="flex items-center gap-3">
                  <span className="text-text-muted text-sm">paid by {expense.paidBy.name}</span>
                  <span className="font-semibold">${(expense.amountCents / 100).toFixed(2)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>


      <div className="bg-surface rounded-2xl p-5 mb-6">
        <h2 className="text-lg mb-3">Balances</h2>
        {notice && <p className="text-text-muted text-sm mb-3">{notice}</p>}

        {settlements.length === 0 ? (
          <p className="text-text-muted">Everyone is settled up. 🎉</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {settlements.map((s, i) => (
              <li key={i} className="bg-background rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <span>
                    <span className="font-medium">{nameFor(s.fromUserId)}</span>
                    <span className="text-text-muted"> owes </span>
                    <span className="font-medium">{nameFor(s.toUserId)}</span>
                  </span>
                  <span className="font-semibold text-accent">
                    ${(s.amountCents / 100).toFixed(2)}
                  </span>
                </div>

                {paymentMethodsFor(s.toUserId).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {paymentMethodsFor(s.toUserId).map((m, j) => (
                      <span key={j} className="text-xs bg-surface rounded-full px-2 py-1">
                        {m.icon} {m.label}
                      </span>
                    ))}
                  </div>
                )}

                {s.fromUserId === currentUserId && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
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
                      className="w-28 rounded-full px-3 py-1.5 bg-surface border border-primary/20 outline-none focus:border-primary text-sm"
                    />
                    <Button
                      variant="primary"
                      onClick={() =>
                        handleSettle(
                          s.toUserId,
                          Math.round(parseFloat(payAmounts[i] ?? "0") * 100),
                          s.amountCents
                        )
                      }
                    >
                      Pay
                    </Button>
                    <Button
                      variant="accent"
                      onClick={() => handleSettle(s.toUserId, s.amountCents, s.amountCents)}
                    >
                      Pay in full
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-surface rounded-2xl p-5 mb-6">
        <h2 className="text-lg mb-3">Pending payments</h2>
        {payments.filter((p) => p.status === "pending").length === 0 ? (
          <p className="text-text-muted">No pending payments.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {payments
              .filter((p) => p.status === "pending")
              .map((p) => (
                <li key={p.id} className="flex justify-between items-center py-2 border-b border-primary/10 last:border-0">
                  <span>
                    {nameFor(p.fromUserId)} paid {nameFor(p.toUserId)}:{" "}
                    <span className="font-semibold">${(p.amountCents / 100).toFixed(2)}</span>
                  </span>
                  {p.toUserId === currentUserId ? (
                    <Button variant="primary" onClick={() => handleConfirmPayment(p.id)}>
                      Confirm receipt
                    </Button>
                  ) : (
                    <span className="text-text-muted text-sm">awaiting confirmation</span>
                  )}
                </li>
              ))}
          </ul>
        )}
      </div>

      <div className="text-center mt-8">
        <button
          onClick={handleLeave}
          className="text-error hover:underline transition-colors"
        >
          Leave group
        </button>
        {leaveError && <p className="text-error text-sm mt-2">{leaveError}</p>}
      </div>
    </div>
  );
}
