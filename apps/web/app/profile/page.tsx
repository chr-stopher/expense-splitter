"use client";

import { useState, useEffect, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

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
    <div style={{ maxWidth: 400, margin: "2rem auto", padding: "0 1rem" }}>
      <button onClick={() => router.push("/groups")} style={{ marginBottom: 16 }}>
        ← Back to groups
      </button>
      <h1>Payment Methods</h1>
      <p style={{ color: "#888" }}>
        Set how you'd like to be paid. Others in your groups will see these when
        they owe you.
      </p>
      <form onSubmit={handleSave}>
        <label style={{ display: "block", marginBottom: 12 }}>
          Venmo handle
          <input
            type="text"
            value={venmoHandle}
            onChange={(e) => setVenmoHandle(e.target.value)}
            placeholder="@your-venmo"
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          CashApp tag
          <input
            type="text"
            value={cashappTag}
            onChange={(e) => setCashappTag(e.target.value)}
            placeholder="$your-cashtag"
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          Zelle phone
          <input
            type="text"
            value={zellePhone}
            onChange={(e) => setZellePhone(e.target.value)}
            placeholder="555-123-4567"
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={acceptsCash}
            onChange={(e) => setAcceptsCash(e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Accept cash
        </label>
        <button type="submit" disabled={saving} style={{ padding: "8px 16px" }}>
          {saving ? "Saving..." : "Save"}
        </button>
        {message && <p style={{ marginTop: 12, color: "#888" }}>{message}</p>}
      </form>
    </div>
  );
}
