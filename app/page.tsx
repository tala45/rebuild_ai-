import Link from "next/link";
import { ArrowRight, Boxes, Recycle, ShieldCheck, Sparkles, Trash2, TrendingUp } from "lucide-react";
import { Brand } from "@/components/brand";

export default function HomePage() {
  return <>
    <header className="shell nav">
      <Link href="/"><Brand /></Link>
      <nav className="nav-links" aria-label="Main navigation">
        <a href="#pathways">What you can do</a><a href="#how-it-works">How it works</a>
      </nav>
      <div className="nav-actions"><Link className="button button-light button-small" href="/login">Sign in</Link><Link className="button button-primary button-small" href="/signup">Get started <ArrowRight size={14} /></Link></div>
    </header>
    <main>
      <section className="shell hero">
        <div>
          <div className="eyebrow">A better next step for surplus</div>
          <h1>Surplus is just a <span>resource</span> waiting.</h1>
          <p className="hero-copy">REBUILD AI helps you keep useful materials moving. Record what you have, explore a second use, list it for others, or find a more responsible way to let it go.</p>
          <div className="hero-cta"><Link className="button button-primary" href="/signup">Start with your materials <ArrowRight size={15} /></Link><a className="button button-quiet" href="#how-it-works">See how it works</a></div>
          <div className="hero-meta">Free to use · No payment processing · Rule-based guidance</div>
        </div>
        <div className="hero-art" aria-label="Illustration of a material card with reuse suggestions">
          <div className="orbit" />
          <div className="material-board"><div className="board-photo" /><div className="board-label"><strong>Timber offcuts</strong><span>REUSABLE</span></div><div className="board-sub">Recorded material · 12 pieces</div></div>
          <div className="floating-note note-one"><strong>Second-use idea</strong>Workshop shelving</div>
          <div className="floating-note note-two"><strong>Keep in circulation</strong>List · reuse · recycle</div>
        </div>
      </section>
      <section className="shell pathways" id="pathways">
        <div className="section-head"><div><div className="eyebrow">Three practical pathways</div><h2>Make the next step count.</h2></div><p>One material record, three ways forward.</p></div>
        <div className="pathway-grid">
          <article className="pathway"><div className="pathway-icon"><TrendingUp size={19} /></div><h3>Sell</h3><p>List available materials and respond to requests. Agree on pickup or shipping directly; the platform does not process payments.</p></article>
          <article className="pathway"><div className="pathway-icon"><Recycle size={19} /></div><h3>Reuse</h3><p>Explore practical project ideas, save a plan, and record the activity only when it actually happens.</p></article>
          <article className="pathway"><div className="pathway-icon"><Trash2 size={19} /></div><h3>Dispose responsibly</h3><p>Get basic material-specific guidance and keep planned disposal separate from completed actions.</p></article>
        </div>
      </section>
      <section className="how" id="how-it-works">
        <div className="shell how-grid">
          <div><div className="eyebrow">Straightforward by design</div><h2>Know what you have. Choose what happens next.</h2><p className="how-lead">Built for individuals, students, workshops, and teams who want a simple way to recover value from surplus materials.</p><Link className="button button-primary" href="/signup">Create your workspace <ArrowRight size={14} /></Link></div>
          <div className="steps">
            <div className="step"><div className="step-num">01</div><div><h3>Record the material</h3><p>Add a name, category, quantity, condition, and optional approximate location. Images stay in a private storage bucket.</p></div></div>
            <div className="step"><div className="step-num">02</div><div><h3>Review cautious suggestions</h3><p>Rule-based guidance uses your details. It is not image recognition, a safety inspection, or an engineering assessment.</p></div></div>
            <div className="step"><div className="step-num">03</div><div><h3>Track the real outcome</h3><p>Plan actions and record completion only when confirmed. Dashboard counts come from saved records, not estimates.</p></div></div>
            <div className="step"><div className="step-num"><ShieldCheck size={14} /></div><div><h3>Private by default</h3><p>Supabase authentication and row-level security protect each account’s materials and activities.</p></div></div>
          </div>
        </div>
      </section>
      <section className="shell" style={{ padding: "48px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
        <div><div className="eyebrow"><Sparkles size={13} /> Start with what you already have</div><h2 style={{ fontSize: 27, letterSpacing: "-1px", margin: "12px 0 0" }}>Give useful materials another route.</h2></div>
        <Link className="button button-primary" href="/signup">Open a free workspace <ArrowRight size={14} /></Link>
      </section>
    </main>
    <footer className="footer"><div className="shell footer-inner"><Brand /><span>Suggestions are estimates. Always verify material condition and local rules.</span></div></footer>
  </>;
}
