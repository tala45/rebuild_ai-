import Link from "next/link";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";

export default function ForgotPasswordPage() {
  return <main className="auth-wrap">
    <aside className="auth-side"><Link href="/"><Brand /></Link><div className="auth-message"><div className="eyebrow" style={{ color: "#c8e58e" }}>Account recovery</div><h1>Get back to your workspace.</h1><p>Request a password reset link using the email address on your account.</p></div><div className="auth-quote">Password recovery is handled by your Supabase Auth project.</div></aside>
    <section className="auth-main"><AuthForm mode="forgot" /></section>
  </main>;
}
