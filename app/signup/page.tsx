import Link from "next/link";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";

export default function SignupPage() {
  return <main className="auth-wrap">
    <aside className="auth-side">
      <Link href="/"><Brand /></Link>
      <div className="auth-message"><div className="eyebrow" style={{ color: "#c8e58e" }}>Put surplus to work</div><h1>Make room for what’s next.</h1><p>Track materials, explore practical second uses, and make informed choices about what to recover.</p></div>
      <div className="auth-quote">No payments, no paid AI calls. Just a useful place to start.</div>
    </aside>
    <section className="auth-main"><AuthForm mode="signup" /></section>
  </main>;
}
