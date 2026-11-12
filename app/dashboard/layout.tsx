import { redirect } from "next/navigation";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { isLocalDemoMode } from "@/lib/app-mode";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (isLocalDemoMode()) return <div className="dashboard">{children}</div>;
  if (!getSupabaseConfig()) return <main className="shell" style={{ paddingTop: 70, maxWidth: 720 }}><div className="notice"><strong>Supabase mode is selected, but its public URL and key are missing.</strong><br />Set NEXT_PUBLIC_REBUILD_DATA_MODE to local or connect your Supabase project to continue.</div></main>;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <div className="dashboard">{children}</div>;
}
