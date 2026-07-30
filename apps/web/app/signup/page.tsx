"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Link from "next/link";
import { Button } from "@/Components/Button";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Create the account
      await api("/auth/signup", {
        method: "POST",
        body: { email, name, password },
      });
      // Then log them straight in, so they land authenticated
      await api("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      router.push("/groups");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl p-8 shadow-sm">
        <h1 className="text-3xl mb-1">Get started</h1>
        <p className="text-text-muted mb-6">Create an account to start splitting expenses.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded-full px-4 py-2 bg-background border border-primary/20 outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-full px-4 py-2 bg-background border border-primary/20 outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="rounded-full px-4 py-2 bg-background border border-primary/20 outline-none focus:border-primary"
            />
          </label>

          {error && <p className="text-error text-sm">{error}</p>}

          <Button type="submit" variant="accent" disabled={loading}>
            {loading ? "Creating account..." : "Sign up"}
          </Button>
        </form>

        <p className="text-sm text-text-muted mt-6 text-center">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
