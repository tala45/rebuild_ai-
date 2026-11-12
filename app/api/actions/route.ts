import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const actionInput = z.object({
  materialId: z.string().uuid(),
  type: z.enum(["reuse", "disposal"]),
  status: z.enum(["planned", "completed"]),
  notes: z.string().trim().max(1000).default(""),
  disposalCategory: z.string().trim().max(80).optional(),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to view your activities." }, { status: 401 });
    const { data, error } = await supabase.from("material_actions").select("id,material_id,action_type,status,notes,disposal_category,created_at,completed_at,materials(name)").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ actions: (data ?? []).map((item) => ({
      ...item,
      type: item.action_type,
      material_name: Array.isArray(item.materials) ? item.materials[0]?.name : item.materials?.name,
    })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load activities." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to record an activity." }, { status: 401 });
    const parsed = actionInput.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the activity details." }, { status: 400 });
    const { data: material, error: materialError } = await supabase.from("materials").select("id").eq("id", parsed.data.materialId).single();
    if (materialError || !material) return NextResponse.json({ error: "Material not found." }, { status: 404 });
    const { data, error } = await supabase.from("material_actions").insert({
      material_id: material.id,
      owner_id: user.id,
      action_type: parsed.data.type,
      status: parsed.data.status,
      notes: parsed.data.notes,
      disposal_category: parsed.data.disposalCategory ?? null,
      completed_at: parsed.data.status === "completed" ? new Date().toISOString() : null,
    }).select("id,action_type,status,notes,disposal_category,created_at,completed_at").single();
    if (error) throw error;
    return NextResponse.json({ action: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not record this activity." }, { status: 500 });
  }
}
