"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type Group = {
  id: string;
  name: string;
  createdById: string;
  createdAt: string;
};

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Group[]>("/groups")
      .then((data) => setGroups(data))
      .catch((err) => {
        // A 401 here means not logged in — send them to login
        if (err instanceof Error && err.message.includes("authenticated")) {
          router.push("/login");
        } else {
          setError(err instanceof Error ? err.message : "Failed to load groups");
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <p style={{ padding: "2rem" }}>Loading...</p>;
  if (error) return <p style={{ padding: "2rem", color: "crimson" }}>{error}</p>;

  async function handleLogout() {
    try {
        await api("/auth/logout", { method: "POST"});
    } catch {
        // If req fails, send to login
    }
    router.push("/login");
  }

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", padding: "0 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Your Groups</h1>
        <button onClick={handleLogout} style={{ padding: "8px 16px" }}>
          Log out
        </button>
      </div>
      {groups.length === 0 ? (
        <p>You are not in any groups yet.</p>
      ) : (
        <ul>
          {groups.map((group) => (
            <li key={group.id} style={{ marginBottom: 8 }}>
              {group.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
