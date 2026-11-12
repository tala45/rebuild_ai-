import Link from "next/link";
import { Brand } from "@/components/brand";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { isLocalDemoMode } from "@/lib/app-mode";

export default function ResetPasswordPage() {
  const localDemo = isLocalDemoMode();
  return <main className="auth-wrap">
    <aside className="auth-side"><Link href="/"><Brand /></Link><div className="auth-message"><div className="eyebrow" style={{ color: "#c8e58e" }}>Account access</div><h1>Choose a new password.</h1><p>{localDemo ? "Password changes are unavailable in the browser-only demo. Connect Supabase Auth to enable real accounts and recovery." : "Password changes are handled by Supabase Auth and require a valid reset link."}</p></div><div className="auth-quote">{localDemo ? "Use the local demo profiles to explore the app." : "Keep your account access private."}</div></aside>
    <section className="auth-main"><ResetPasswordForm /></section>
  </main>;
}
