import { NextResponse } from "next/server";
import { z } from "zod";
import { answerAssistant } from "@/lib/analysis";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({ question: z.string().trim().min(2).max(500) });

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to use the assistant." }, { status: 401 });
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a question between 2 and 500 characters." }, { status: 400 });
    const { data: materials, error } = await supabase.from("materials").select("name,category,condition");
    if (error) throw error;
    return NextResponse.json({
      answer: answerAssistant(parsed.data.question, materials ?? []),
      method: "rule_based",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The assistant could not answer right now." }, { status: 500 });
  }
}
