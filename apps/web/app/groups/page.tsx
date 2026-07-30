"use client";

import { useState, useEffect, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Link from "next/link";
import { Button } from "@/Components/Button";

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
  const [newGroupName, setNewGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);

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

  async function handleCreateGroup(e: SyntheticEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreating(true);
    try {
      const created = await api<Group>("/groups", {
        method: "POST",
        body: { name: newGroupName },
      });
      // Add new group to the list immediately
      setGroups((prev) => [...prev, created]);
      setNewGroupName(""); // Clear input
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoinGroup(e: SyntheticEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setJoining(true);
    try {
      const result = await api<{ group: Group }>("/groups/join", {
        method: "POST",
        body: { inviteCode: inviteCode.trim() },
      });
      // Add the joined group to the list immediately
      setGroups((prev) => [...prev, result.group]);
      setInviteCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join group");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header row */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl">Your Groups</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => router.push("/profile")}>
            Profile
          </Button>
          <Button variant="ghost" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </div>

      {/* Create + join forms, side by side in cards */}
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <form
          onSubmit={handleCreateGroup}
          className="bg-surface rounded-2xl p-5 flex flex-col gap-3"
        >
          <h2 className="text-lg">Create a group</h2>
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Group name"
            className="rounded-full px-4 py-2 bg-background border border-primary/20 outline-none focus:border-primary"
          />
          <Button type="submit" variant="accent" disabled={creating}>
            {creating ? "Creating..." : "Create group"}
          </Button>
        </form>

        <form
          onSubmit={handleJoinGroup}
          className="bg-surface rounded-2xl p-5 flex flex-col gap-3"
        >
          <h2 className="text-lg">Join a group</h2>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Invite code"
            className="rounded-full px-4 py-2 bg-background border border-primary/20 outline-none focus:border-primary"
          />
          <Button type="submit" variant="accent" disabled={joining}>
            {joining ? "Joining..." : "Join group"}
          </Button>
        </form>
      </div>

      {error && <p className="text-error mb-4">{error}</p>}

      {/* Group list as cards */}
      {groups.length === 0 ? (
        <p className="text-text-muted">You are not in any groups yet. Create one or join with an invite code.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                className="block bg-surface rounded-2xl p-5 hover:shadow-md transition-shadow"
              >
                <span className="text-lg">{group.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
