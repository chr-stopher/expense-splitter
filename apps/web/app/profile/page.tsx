"use client";

import { useState, useEffect, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/Components/Button";

type Profile = {
  id: string;
  name: string;
  email: string;
  venmoHandle: string | null;
  cashappTag: string | null;
  zellePhone: string | null;
  acceptsCash: boolean;
};

export default function ProfilePage() {
  const router = useRouter();
  const [venmoHandle, setVenmoHandle] = useState("");
  const [cashappTag, setCashappTag] = useState("");
  const [zellePhone, setZellePhone] = useState("");
  const [acceptsCash, setAcceptsCash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<{ user: Profile }>("/me")
      .then(({ user }) => {
        setVenmoHandle(user.venmoHandle ?? "");
        setCashappTag(user.cashappTag ?? "");
        setZellePhone(user.zellePhone ?? "");
        setAcceptsCash(user.acceptsCash);
      })
      .catch((err) => {
        if (err instanceof Error && err.message.includes("authenticated")) {
          router.push("/login");
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSave(e: SyntheticEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api("/me", {
        method: "PATCH",
        body: { venmoHandle, cashappTag, zellePhone, acceptsCash },
      });
      setMessage("Saved!");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={{ padding: "2rem" }}>Loading...</p>;

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <button
        onClick={() => router.push("/groups")}
        className="text-text-muted hover:text-text transition-colors mb-6"
      >
        ← Back to groups
      </button>

      <div className="bg-surface rounded-2xl p-8">
        <h1 className="text-3xl mb-1">Payment methods</h1>
        <p className="text-text-muted mb-6">
          Set how you'd like to be paid. People who owe you will see these when they settle up.
        </p>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">💸 Venmo handle</span>
            <input
              type="text"
              value={venmoHandle}
              onChange={(e) => setVenmoHandle(e.target.value)}
              placeholder="@your-venmo"
              className="rounded-full px-4 py-2 bg-background border border-primary/20 outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">💵 CashApp tag</span>
            <input
              type="text"
              value={cashappTag}
              onChange={(e) => setCashappTag(e.target.value)}
              placeholder="$your-cashtag"
              className="rounded-full px-4 py-2 bg-background border border-primary/20 outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">🏦 Zelle phone</span>
            <input
              type="text"
              value={zellePhone}
              onChange={(e) => setZellePhone(e.target.value)}
              placeholder="555-123-4567"
              className="rounded-full px-4 py-2 bg-background border border-primary/20 outline-none focus:border-primary"
            />
          </label>

          <label className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={acceptsCash}
              onChange={(e) => setAcceptsCash(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span>💰 Accept cash</span>
          </label>

          <Button type="submit" variant="accent" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>

          {message && <p className="text-text-muted text-sm">{message}</p>}
        </form>
      </div>
    </div>
  );
}
