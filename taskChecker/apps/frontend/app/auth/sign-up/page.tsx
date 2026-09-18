"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconMail, IconLock, IconUser, IconBuilding, IconEye, IconEyeOff, IconFlowMark, IconArrowRight } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatePresence, motion } from "@/components/motion";

function FieldIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
      {children}
    </span>
  );
}

export default function SignUpPage() {
  const router = useRouter();
  const { signup, loginAsDemo } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDemoAccess = () => {
    loginAsDemo();
    router.push("/app/board");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signup(email, password, name, orgName);
      router.push("/app/board");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/5 to-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
      <Card className="w-full max-w-md p-2">
        <CardHeader className="items-center text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <IconFlowMark size={22} />
          </span>
          <CardTitle className="text-2xl">TeamFlow</CardTitle>
          <CardDescription>Create your organization and account</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent>
            <FieldGroup>
            <AnimatePresence mode="wait">
              {error ? (
                <motion.p
                  key={error}
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                >
                  {error}
                </motion.p>
              ) : null}
            </AnimatePresence>

            <Field>
              <FieldLabel htmlFor="name">Your name</FieldLabel>
              <div className="relative">
                <FieldIcon><IconUser size={16} /></FieldIcon>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                  autoComplete="name"
                  disabled={loading}
                  className="pl-9"
                />
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <div className="relative">
                <FieldIcon><IconMail size={16} /></FieldIcon>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  disabled={loading}
                  className="pl-9"
                />
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <div className="relative">
                <FieldIcon><IconLock size={16} /></FieldIcon>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="•••••••• (min 8 characters)"
                  required
                  autoComplete="new-password"
                  disabled={loading}
                  minLength={8}
                  className="pr-10 pl-9"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                >
                  {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </Button>
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="orgName">Organization name</FieldLabel>
              <div className="relative">
                <FieldIcon><IconBuilding size={16} /></FieldIcon>
                <Input
                  id="orgName"
                  type="text"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="Acme Inc"
                  required
                  autoComplete="organization"
                  disabled={loading}
                  className="pl-9"
                />
              </div>
              <FieldDescription>This creates your organization workspace. You can invite teammates after.</FieldDescription>
            </Field>

            <Button type="submit" className="mt-1 w-full" disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
              <IconArrowRight size={16} />
            </Button>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or preview</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleDemoAccess}
            >
              Explore Demo Board (Instant Preview)
            </Button>
            </FieldGroup>
          </CardContent>
        </form>

        <CardFooter className="justify-center border-t py-4">
          <p className="text-[13px] text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/sign-in" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
      </motion.div>
    </div>
  );
}
