import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({ status: z.literal("completed") });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to update this activity." }, { status: 401 });
    const { id } = await context.params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Only planned activities can be marked complete." }, { status: 400 });
    const { data: action, error } = await supabase.from("material_actions").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "planned").select("id,status,completed_at").single();
    if (error || !action) return NextResponse.json({ error: "Activity not found or already completed." }, { status: 404 });
    return NextResponse.json({ action });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update this activity." }, { status: 500 });
  }
}
