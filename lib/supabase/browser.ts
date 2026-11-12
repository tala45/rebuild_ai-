"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  client ??= createBrowserClient(config.url, config.key);
  return client;
}
