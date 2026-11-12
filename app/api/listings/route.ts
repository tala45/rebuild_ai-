import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createListing = z.object({
  materialId: z.string().uuid(),
  askingPrice: z.number().min(0).max(100000000).default(0),
  fulfillment: z.array(z.enum(["pickup", "shipping"])).min(1),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim().slice(0, 80);
    const category = url.searchParams.get("category");
    const mine = url.searchParams.get("mine") === "1";
    let query = supabase.from("listings").select("id,seller_id,asking_price,fulfillment,created_at,materials!inner(id,name,category,description,quantity,unit,condition,approximate_location,material_images(storage_path)),profiles!listings_seller_id_fkey(display_name)").order("created_at", { ascending: false });
    if (mine) {
      if (!user) return NextResponse.json({ error: "Sign in to view your listings." }, { status: 401 });
      query = query.eq("seller_id", user.id);
    } else {
      query = query.eq("status", "active");
    }
    if (q) query = query.ilike("materials.name", `%${q}%`);
    if (category && category !== "all") query = query.eq("materials.category", category);
    const { data, error } = await query;
    if (error) throw error;
    const listings = await Promise.all((data ?? []).map(async (item) => {
      const material = Array.isArray(item.materials) ? item.materials[0] : item.materials;
      const images = material && (Array.isArray(material.material_images) ? material.material_images : []);
      const firstPath = images?.[0]?.storage_path;
      const signed = firstPath ? await supabase.storage.from("material-uploads").createSignedUrl(firstPath, 3600) : null;
      const { seller_id, ...publicItem } = item;
      return {
        ...publicItem,
        isOwn: Boolean(user && seller_id === user.id),
        material: material ? { ...material, imageUrl: signed?.data?.signedUrl ?? null } : material,
        seller: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
        fulfillment: Array.isArray(item.fulfillment) ? item.fulfillment.join(", ") : item.fulfillment,
      };
    }));
    return NextResponse.json({ listings, userId: user?.id ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load listings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to create a listing." }, { status: 401 });
    const parsed = createListing.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the listing details." }, { status: 400 });
    const { data: material, error: materialError } = await supabase.from("materials").select("id,owner_id").eq("id", parsed.data.materialId).single();
    if (materialError || material.owner_id !== user.id) return NextResponse.json({ error: "You can only list your own material." }, { status: 403 });
    const { data, error } = await supabase.from("listings").insert({
      material_id: material.id,
      seller_id: user.id,
      asking_price: parsed.data.askingPrice,
      fulfillment: parsed.data.fulfillment,
    }).select("id,status").single();
    if (error) throw error;
    return NextResponse.json({ listing: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create listing." }, { status: 500 });
  }
}
