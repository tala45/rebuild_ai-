import Link from "next/link";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return <main className="auth-wrap">
    <aside className="auth-side">
      <Link href="/"><Brand /></Link>
      <div className="auth-message"><div className="eyebrow" style={{ color: "#c8e58e" }}>Materials have another life</div><h1>Keep good things moving.</h1><p>Bring surplus materials into one clear place. Decide whether to sell, reuse, or dispose of them responsibly.</p></div>
      <div className="auth-quote">A practical workspace for a more circular use of materials.</div>
    </aside>
    <section className="auth-main"><AuthForm mode="login" /></section>
  </main>;
}
