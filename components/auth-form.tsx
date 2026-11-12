"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

type AuthMode = "login" | "signup" | "forgot";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase is not configured yet. Add the project URL and publishable key in Replit Secrets, then refresh.");
      setBusy(false);
      return;
    }
    try {
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName.trim() || "REBUILD member" },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
          },
        });
        if (authError) throw authError;
        if (data.session) window.location.assign("/dashboard");
        else setMessage("Check your email for a verification link. Email delivery depends on your Supabase Auth settings.");
      } else if (mode === "forgot") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (authError) throw authError;
        setMessage("If this email has an account, a password reset link has been sent.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        window.location.assign("/dashboard");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back";
  const subtitle = mode === "signup"
    ? "Start keeping useful materials in circulation."
    : mode === "forgot"
      ? "We’ll send a reset link if the account exists."
      : "Sign in to manage materials and activity.";

  return (
    <div className="auth-card">
      <div className="eyebrow">{mode === "forgot" ? "Account recovery" : "Your REBUILD workspace"}</div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
      <form className="form" onSubmit={submit}>
        {mode === "signup" && <div className="field"><label htmlFor="displayName">Name</label><input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} autoComplete="name" placeholder="Your name" /></div>}
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" /></div>
        {mode !== "forgot" && <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder="At least 8 characters" /></div>}
        {error && <div role="alert" className="form-error">{error}</div>}
        {message && <div role="status" className="form-success">{message}</div>}
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</button>
      </form>
      <div className="form-foot">
        {mode === "login" && <>New to REBUILD? <Link href="/signup">Create an account</Link><br /><Link href="/forgot-password">Forgot your password?</Link></>}
        {mode === "signup" && <>Already registered? <Link href="/login">Sign in</Link></>}
        {mode === "forgot" && <>Remembered it? <Link href="/login">Back to sign in</Link></>}
      </div>
    </div>
  );
}
