"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { IconMail, IconLock, IconUser, IconEye, IconEyeOff, IconFlowMark, IconArrowRight, IconCheck, IconAlertCircle } from "@/components/icons";
import { api } from "@/lib/api";
import { cx } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

type Preview = { email: string; orgName: string; role: string; expiresAt: string };

function AcceptInviteForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.auth
      .previewInvite(token)
      .then((res) => {
        if (!cancelled) setPreview(res.invite);
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : "Invalid invitation link.");
      });
    return () => {
      cancelled = true;
    };
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

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-brand">
            <IconFlowMark size={32} />
            <h1>TeamFlow</h1>
            <p>This invitation link is missing its token.</p>
          </div>
          <div className="auth-error">
            <IconAlertCircle size={16} /> Ask the sender to copy the full invite link again.
          </div>
          <p className="auth-footer">
            <Link href="/auth/sign-in">Back to sign in</Link>
          </p>
        </div>
      </div>
    );
  }

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

  const expired = preview ? new Date(preview.expiresAt).getTime() < Date.now() : false;

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <IconFlowMark size={32} />
          <h1>TeamFlow</h1>
          <p>Accept your invitation</p>
        </div>

        {preview ? (
          <div className={cx("invite-preview", expired && "is-expired")}>
            <p>
              <strong>{preview.email}</strong> — invited to <strong>{preview.orgName}</strong> as{" "}
              <strong>{preview.role}</strong>
            </p>
            <p className="dim">
              {expired
                ? "This link has expired — ask for a fresh invite."
                : `Link expires ${new Date(preview.expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
            </p>
          </div>
        ) : previewError ? (
          <div className="auth-error">
            <IconAlertCircle size={16} /> {previewError}
          </div>
        ) : (
          <p className="dim">Checking invitation…</p>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Your name</FieldLabel>
            <div className="input-with-icon">
              <IconUser size={18} />
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                required
                autoComplete="name"
                disabled={loading || expired}
              />
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <div className="input-with-icon">
              <IconLock size={18} />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••••• (min 8 characters)"
                required
                autoComplete="new-password"
                disabled={loading || expired}
                minLength={8}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </Button>
            </div>
          </Field>

          <Button type="submit" className="btn-block auth-submit" disabled={loading || expired}>
            {loading ? "Accepting invite…" : "Accept invite"}
            <IconArrowRight size={16} />
          </Button>
          </FieldGroup>
        </form>

        <p className="auth-footer">
          Already have an account? <Link href="/auth/sign-in">Sign in instead</Link>
        </p>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="loading">Loading…</div>}>
      <AcceptInviteForm />
    </Suspense>
  );
}
