"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { IconMail, IconLock, IconUser, IconEye, IconEyeOff, IconFlowMark, IconArrowRight, IconCheck, IconAlertCircle } from "@/components/icons";
import { api } from "@/lib/api";
import { cx } from "@/lib/utils";

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ email: string; orgName: string; role: string } | null>(null);

  useEffect(() => {
    // We can't fetch invite info without accepting (token is hashed on backend)
    // But we could add a public endpoint to preview the invite
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.auth.acceptInvite(token, { name, password });
      setSuccess(true);
      // Redirect after short delay
      setTimeout(() => {
        router.push("/app/work");
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-brand">
            <IconFlowMark size={32} />
            <h1>TeamFlow</h1>
            <p>Welcome to your new organization!</p>
          </div>
          <div className="auth-success">
            <div className="success-icon">
              <IconCheck size={48} />
            </div>
            <h2>Invite accepted</h2>
            <p>Redirecting to your workspace…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <IconFlowMark size={32} />
          <h1>TeamFlow</h1>
          <p>Accept your invitation</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-field">
            <label htmlFor="name">Your name</label>
            <div className="input-with-icon">
              <IconUser size={18} />
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                required
                autoComplete="name"
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon">
              <IconLock size={18} />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••••• (min 8 characters)"
                required
                autoComplete="new-password"
                disabled={loading}
                minLength={8}
              />
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block auth-submit" disabled={loading}>
            {loading ? "Accepting invite…" : "Accept invite"}
            <IconArrowRight size={16} />
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link href="/auth/sign-in">Sign in instead</Link>
        </p>
      </div>
    </div>
  );
}