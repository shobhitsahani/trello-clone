"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconMail, IconLock, IconUser, IconBuilding, IconEye, IconEyeOff, IconFlowMark, IconArrowRight } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { cx } from "@/lib/utils";

export default function SignUpPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Real backend: POST /v1/auth/signup auto-provisions the org + owner.
      await signup(email, password, name, orgName);
      router.push("/app/work");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
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
          <p>Create your organization and account</p>
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
                onChange={e => setName(e.target.value)}
                placeholder="Jane Doe"
                required
                autoComplete="name"
                disabled={loading}
              />
            </div>
          </div>

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

          <div className="form-field">
            <label htmlFor="orgName">Organization name</label>
            <div className="input-with-icon">
              <IconBuilding size={18} />
              <input
                id="orgName"
                type="text"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="Acme Inc"
                required
                autoComplete="organization"
                disabled={loading}
              />
            </div>
            <p className="field-hint">This creates your organization workspace. You can invite teammates after.</p>
          </div>

          <button type="submit" className="btn btn-primary btn-block auth-submit" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
            <IconArrowRight size={16} />
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link href="/auth/sign-in">Sign in</Link>
        </p>
      </div>
    </div>
  );
}