import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  status: z.enum(["active", "paused", "closed"]).optional(),
  askingPrice: z.number().min(0).max(100000000).optional(),
  fulfillment: z.array(z.enum(["pickup", "shipping"])).min(1).optional(),
}).refine((value) => Object.keys(value).length > 0, "Choose an update.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to update a listing." }, { status: 401 });
    const { id } = await context.params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the listing update." }, { status: 400 });
    const { data: listing, error: listingError } = await supabase.from("listings").select("id,seller_id,status").eq("id", id).single();
    if (listingError || !listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    if (listing.seller_id !== user.id) return NextResponse.json({ error: "You can only update your own listing." }, { status: 403 });
    if (listing.status === "sold") return NextResponse.json({ error: "A completed sale cannot be reopened or edited." }, { status: 409 });
    const { data, error } = await supabase.from("listings").update({
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.askingPrice !== undefined ? { asking_price: parsed.data.askingPrice } : {}),
      ...(parsed.data.fulfillment !== undefined ? { fulfillment: parsed.data.fulfillment } : {}),
    }).eq("id", id).select("id,status,asking_price,fulfillment").single();
    if (error) throw error;
    return NextResponse.json({ listing: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the listing." }, { status: 500 });
  }
}
