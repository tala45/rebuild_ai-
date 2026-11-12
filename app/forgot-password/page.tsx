import Link from "next/link";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";
import { isLocalDemoMode } from "@/lib/app-mode";

export default function ForgotPasswordPage() {
  const localDemo = isLocalDemoMode();
  return <main className="auth-wrap">
    <aside className="auth-side"><Link href="/"><Brand /></Link><div className="auth-message"><div className="eyebrow" style={{ color: "#c8e58e" }}>Account recovery</div><h1>Get back to your workspace.</h1><p>{localDemo ? "Local demo profiles do not have passwords. Open one of the sample workspaces or create a new local profile." : "Request a password reset link using the email address on your account."}</p></div><div className="auth-quote">{localDemo ? "Real password recovery requires a connected Supabase Auth project." : "Password recovery is handled by your Supabase Auth project."}</div></aside>
    <section className="auth-main"><AuthForm mode="forgot" /></section>
  </main>;
}
