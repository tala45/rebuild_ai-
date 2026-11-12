import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const requestInput = z.object({
  listingId: z.string().uuid(),
  message: z.string().trim().min(5).max(800),
  fulfillment: z.enum(["pickup", "shipping"]),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to view order requests." }, { status: 401 });
    const { data, error } = await supabase.from("order_requests").select("id,listing_id,buyer_id,seller_id,message,fulfillment,status,buyer_completed_at,seller_completed_at,created_at,buyer:profiles!order_requests_buyer_id_fkey(display_name),seller:profiles!order_requests_seller_id_fkey(display_name),listings(material_id,asking_price,materials(name,category,quantity,unit))").order("created_at", { ascending: false });
    if (error) throw error;
    const requests = (data ?? []).map((item) => {
      const listing = Array.isArray(item.listings) ? item.listings[0] : item.listings;
      const material = listing && (Array.isArray(listing.materials) ? listing.materials[0] : listing.materials);
      return {
        ...item,
        buyer_completed: Boolean(item.buyer_completed_at),
        seller_completed: Boolean(item.seller_completed_at),
        completion_confirmed: item.buyer_id === user.id ? Boolean(item.buyer_completed_at) : Boolean(item.seller_completed_at),
        listing: listing ? { ...listing, material } : null,
      };
    });
    return NextResponse.json({ requests, userId: user.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load order requests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to contact a seller." }, { status: 401 });
    const parsed = requestInput.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your request." }, { status: 400 });
    const { data: listing, error: listingError } = await supabase.from("listings").select("id,seller_id,status,fulfillment").eq("id", parsed.data.listingId).single();
    if (listingError || listing.status !== "active") return NextResponse.json({ error: "This listing is no longer available." }, { status: 404 });
    if (listing.seller_id === user.id) return NextResponse.json({ error: "You cannot request your own listing." }, { status: 400 });
    if (!listing.fulfillment.includes(parsed.data.fulfillment)) return NextResponse.json({ error: "That fulfillment option is not available." }, { status: 400 });
    const { data, error } = await supabase.from("order_requests").insert({
      listing_id: listing.id,
      buyer_id: user.id,
      seller_id: listing.seller_id,
      message: parsed.data.message,
      fulfillment: parsed.data.fulfillment,
    }).select("id,status").single();
    if (error) throw error;
    return NextResponse.json({ request: data, message: "Request sent. The listing remains active until a transaction is confirmed." }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send the request." }, { status: 500 });
  }
}
