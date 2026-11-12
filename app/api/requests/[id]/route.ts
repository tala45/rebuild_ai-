import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  status: z.enum(["accepted", "declined", "completed"]).optional(),
  confirmComplete: z.boolean().optional(),
}).refine((value) => value.status !== undefined || value.confirmComplete === true, "Choose an update.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to update this request." }, { status: 401 });
    const { id } = await context.params;
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid update." }, { status: 400 });
    const { data: order, error: orderError } = await supabase.from("order_requests").select("id,listing_id,buyer_id,seller_id,status,buyer_completed_at,seller_completed_at").eq("id", id).single();
    if (orderError || !order) return NextResponse.json({ error: "Order request not found." }, { status: 404 });
    if (parsed.data.status && (order.seller_id !== user.id || !["accepted", "declined"].includes(parsed.data.status) || order.status !== "requested")) {
      return NextResponse.json({ error: "Only the seller can accept or decline a new request." }, { status: 403 });
    }
    if (parsed.data.confirmComplete && order.buyer_id !== user.id && order.seller_id !== user.id) {
      return NextResponse.json({ error: "Only the buyer or seller can confirm completion." }, { status: 403 });
    }
    if (parsed.data.confirmComplete && order.status !== "accepted" && order.status !== "completed") {
      return NextResponse.json({ error: "The seller must accept the request before completion can be confirmed." }, { status: 409 });
    }
    const updates: Record<string, string> = {};
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.confirmComplete) {
      updates[order.buyer_id === user.id ? "buyer_completed_at" : "seller_completed_at"] = new Date().toISOString();
    }
    const { data, error } = await supabase.from("order_requests").update(updates).eq("id", id).select("id,status,buyer_completed_at,seller_completed_at").single();
    if (error) throw error;
    return NextResponse.json({ request: data, message: data.status === "completed" ? "Both sides confirmed completion." : "Request updated." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the order request." }, { status: 500 });
  }
}
