"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      setBusy(false);
      return;
    }
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("Password updated. You can sign in with your new password.");
      await supabase.auth.signOut();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the password. Open the latest reset link and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth-card">
    <div className="eyebrow">Account recovery</div>
    <h2>Choose a new password</h2>
    <p>Use the link sent to your email, then set a new password here.</p>
    <form className="form" onSubmit={submit}>
      <div className="field"><label htmlFor="newPassword">New password</label><input id="newPassword" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {message && <div className="form-success" role="status">{message}</div>}
      <button className="button button-primary" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
    </form>
    <div className="form-foot"><Link href="/login">Back to sign in</Link></div>
  </div>;
}
