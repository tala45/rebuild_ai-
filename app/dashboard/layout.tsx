import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!getSupabaseConfig()) {
    return <main className="shell" style={{ paddingTop: 70, maxWidth: 720 }}><Link href="/"><Brand /></Link><div className="notice" style={{ marginTop: 35 }}><strong>Connect the existing Supabase project to continue.</strong><br />Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Replit Secrets. Then run the SQL migration from supabase/migrations in the Supabase SQL Editor. No service-role key is needed.</div><Link className="button button-primary" href="/">Back to home</Link></main>;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <div className="dashboard">{children}</div>;
}
