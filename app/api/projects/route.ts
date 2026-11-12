import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const saveSchema = z.object({
  projectId: z.string().uuid(),
  materialId: z.string().uuid().optional(),
  status: z.enum(["planned", "completed"]).default("planned"),
  notes: z.string().trim().max(1000).default(""),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to view reuse ideas." }, { status: 401 });
    const [projects, saved] = await Promise.all([
      supabase.from("reuse_projects").select("id,title,description,categories,requirements").order("title"),
      supabase.from("saved_projects").select("id,project_id,material_id,status,notes,created_at,completed_at,reuse_projects(title)").order("created_at", { ascending: false }),
    ]);
    if (projects.error) throw projects.error;
    if (saved.error) throw saved.error;
    return NextResponse.json({ projects: projects.data ?? [], saved: saved.data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load reuse projects." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to save a reuse project." }, { status: 401 });
    const parsed = saveSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the project details." }, { status: 400 });
    if (parsed.data.materialId) {
      const { data: material, error } = await supabase.from("materials").select("id").eq("id", parsed.data.materialId).single();
      if (error || !material) return NextResponse.json({ error: "Choose one of your own materials." }, { status: 404 });
    }
    const { data, error } = await supabase.from("saved_projects").insert({
      owner_id: user.id,
      project_id: parsed.data.projectId,
      material_id: parsed.data.materialId ?? null,
      status: parsed.data.status,
      notes: parsed.data.notes,
      completed_at: parsed.data.status === "completed" ? new Date().toISOString() : null,
    }).select("id,project_id,material_id,status,notes,created_at,completed_at").single();
    if (error) throw error;
    return NextResponse.json({ savedProject: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the project." }, { status: 500 });
  }
}
