"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconMail, IconLock, IconEye, IconEyeOff, IconFlowMark, IconArrowRight } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { cx } from "@/lib/utils";

export default function SignInPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Real backend: POST /v1/auth/login via the shared API client.
      // Stores the token bundle + active tenant id, then hydrates /v1/me.
      await login(email, password);
      router.push("/app/work");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <IconFlowMark size={32} />
          <h1>TeamFlow</h1>
          <p>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-field">
            <label htmlFor="email">Email</label>
            <div className="input-with-icon">
              <IconMail size={18} />
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
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
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                disabled={loading}
              />
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block auth-submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
            <IconArrowRight size={16} />
          </button>
        </form>

        <p className="auth-footer">
          Don't have an account? <Link href="/auth/sign-up">Sign up</Link>
        </p>
      </div>
    </div>
  );
}