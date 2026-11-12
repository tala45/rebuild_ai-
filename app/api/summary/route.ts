import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to view your dashboard." }, { status: 401 });
    const [materials, listings, actions, requests] = await Promise.all([
      supabase.from("materials").select("id", { count: "exact", head: true }),
      supabase.from("listings").select("id,status", { count: "exact" }).eq("seller_id", user.id),
      supabase.from("material_actions").select("action_type,status"),
      supabase.from("order_requests").select("id,status").eq("seller_id", user.id),
    ]);
    const error = materials.error ?? listings.error ?? actions.error ?? requests.error;
    if (error) throw error;
    const summary = {
      materials: materials.count ?? 0,
      activeListings: (listings.data ?? []).filter((item) => item.status === "active").length,
      completedSales: (listings.data ?? []).filter((item) => item.status === "sold").length,
      plannedReuse: (actions.data ?? []).filter((item) => item.action_type === "reuse" && item.status === "planned").length,
      completedReuse: (actions.data ?? []).filter((item) => item.action_type === "reuse" && item.status === "completed").length,
      plannedDisposal: (actions.data ?? []).filter((item) => item.action_type === "disposal" && item.status === "planned").length,
      completedDisposal: (actions.data ?? []).filter((item) => item.action_type === "disposal" && item.status === "completed").length,
      incomingRequests: (requests.data ?? []).filter((item) => item.status === "requested").length,
    };
    return NextResponse.json({
      ...summary,
      active_listings: summary.activeListings,
      open_requests: summary.incomingRequests,
      reuse_actions: summary.completedReuse,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load dashboard metrics." }, { status: 500 });
  }
}
