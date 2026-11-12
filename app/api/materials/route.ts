import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeMaterial } from "@/lib/analysis";
import { createClient } from "@/lib/supabase/server";

const materialInput = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.enum(["construction", "wood", "metal", "plastics", "electrical", "electronics", "mechanical", "chemicals", "other"]),
  description: z.string().trim().max(1000).default(""),
  quantity: z.number().positive().max(1000000),
  unit: z.string().trim().min(1).max(24),
  condition: z.enum(["new", "good", "fair", "poor", "unknown"]),
  location: z.string().trim().max(120).default(""),
  imagePath: z.string().trim().max(500).optional(),
  imageType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
}).refine((data) => Boolean(data.imagePath) === Boolean(data.imageType), "Include both image path and image type.");

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to view your materials." }, { status: 401 });
    const { data, error } = await supabase.from("materials").select("id,name,category,description,quantity,unit,condition,approximate_location,status,created_at").eq("owner_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ materials: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load materials." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to add a material." }, { status: 401 });
    const parsed = materialInput.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the material details." }, { status: 400 });
    const input = parsed.data;
    if (input.imagePath && !input.imagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "The uploaded image does not belong to your account." }, { status: 400 });
    }
    const { data, error } = await supabase.from("materials").insert({
      owner_id: user.id,
      name: input.name,
      category: input.category,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit,
      condition: input.condition,
      approximate_location: input.location,
    }).select("id,name,category,description,quantity,unit,condition,approximate_location,status,created_at").single();
    if (error) throw error;
    if (input.imagePath && input.imageType) {
      const { error: imageError } = await supabase.from("material_images").insert({
        material_id: data.id,
        owner_id: user.id,
        storage_path: input.imagePath,
        content_type: input.imageType,
      });
      if (imageError) throw imageError;
    }
    const analysis = analyzeMaterial(input);
    await supabase.from("ai_analyses").insert({ material_id: data.id, owner_id: user.id, method: analysis.method, result: analysis });
    return NextResponse.json({ material: data, analysis }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the material." }, { status: 500 });
  }
}
