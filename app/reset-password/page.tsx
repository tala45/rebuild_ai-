import Link from "next/link";
import { Brand } from "@/components/brand";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default function ResetPasswordPage() {
  return <main className="auth-wrap">
    <aside className="auth-side"><Link href="/"><Brand /></Link><div className="auth-message"><div className="eyebrow" style={{ color: "#c8e58e" }}>Secure account access</div><h1>Choose a new password.</h1><p>Password changes are handled by Supabase Auth and require a valid reset link.</p></div><div className="auth-quote">Keep your account access private.</div></aside>
    <section className="auth-main"><ResetPasswordForm /></section>
  </main>;
}
