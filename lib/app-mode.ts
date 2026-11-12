export function getAppDataMode(): "local" | "supabase" {
  return process.env.NEXT_PUBLIC_REBUILD_DATA_MODE === "supabase" ? "supabase" : "local";
}

export function isLocalDemoMode() {
  return getAppDataMode() === "local";
}
