export type AnalysisInput = {
  name: string;
  category: string;
  description?: string;
  condition?: string;
};

const reuseByCategory: Record<string, string[]> = {
  wood: ["Small furniture or shelving", "Workshop jigs and fixtures", "Community repair projects"],
  metal: ["Fabrication prototypes", "Brackets or workshop fixtures", "Metal recycling when reuse is not suitable"],
  electronics: ["Educational electronics projects", "Parts harvesting after safe inspection", "Repair and refurbishment"],
  electrical: ["Low-voltage learning projects after qualified inspection", "Parts recovery", "Certified e-waste recycling"],
  plastics: ["Storage or workshop organizers", "Non-structural prototypes", "Material-specific recycling"],
  construction: ["Repair or small renovation projects after inspection", "Community building projects", "Material-specific recycling"],
  mechanical: ["Robotics or automation prototypes", "Repair projects", "Parts recovery"],
  other: ["Repair or educational projects", "Parts recovery", "Local material-specific recycling"],
};

const disposalByCategory: Record<string, string> = {
  electronics: "Use an approved e-waste collection route where available. Remove batteries only if safe and permitted.",
  electrical: "Separate as electronic/electrical waste. Do not place batteries or damaged components in general waste.",
  chemicals: "Keep sealed and labeled; contact your local hazardous-waste authority for handling instructions.",
  construction: "Separate clean, reusable material from mixed debris and check local construction-waste rules.",
};

export function analyzeMaterial(input: AnalysisInput) {
  const category = input.category.toLowerCase();
  const reuse = reuseByCategory[category] ?? reuseByCategory.other;
  const disposal = disposalByCategory[category] ?? "Check local recycling and waste guidance for this material type.";
  return {
    method: "rule_based" as const,
    suggestedCategory: input.category,
    conditionProvided: input.condition || "unknown",
    conditionSource: "User-entered; not visually assessed",
    indicativeValue: null,
    summary: `Based on the details you provided, “${input.name}” may be suitable for reuse, parts recovery, or material-specific recycling. This is a text-based suggestion, not image recognition or a safety inspection.`,
    reuseIdeas: reuse,
    disposalGuidance: disposal,
    confidence: "Limited: category and text only",
    safetyNote: "A photo or description cannot confirm structural integrity, electrical safety, chemical composition, or engineering suitability. Verify with a qualified person before use.",
  };
}

export function answerAssistant(question: string, materials: Array<{ name: string; category: string; condition: string }>) {
  const q = question.trim().toLowerCase();
  const relevant = materials.filter((item) =>
    q.includes(item.name.toLowerCase()) || q.includes(item.category.toLowerCase()),
  );
  const examples = relevant.length
    ? ` Your saved materials that may be relevant: ${relevant.map((item) => `${item.name} (${item.category}, ${item.condition})`).join("; ")}.`
    : materials.length
      ? ` I checked your saved materials but did not find an obvious match. You have ${materials.length} material record${materials.length === 1 ? "" : "s"}.`
      : " You do not have any saved material records yet.";

  let guidance = "Start by checking whether the item is safe and complete. If you do not need it, compare the effort of listing it for sale with a practical reuse idea; use local recycling guidance when neither is suitable.";
  if (q.includes("sell") || q.includes("price") || q.includes("market")) {
    guidance = "A listing can help another person recover the material. Describe its condition and quantity accurately, use an approximate location, and agree on pickup or shipping details directly. REBUILD AI does not process payments.";
  } else if (q.includes("reuse") || q.includes("project") || q.includes("build")) {
    guidance = "Look for a non-critical project that matches the material and its known specifications. Treat suggestions as ideas only; inspect and test materials appropriately before use.";
  } else if (q.includes("dispos") || q.includes("recycl")) {
    guidance = "Separate materials where it is safe to do so and check your local authority's recycling and hazardous-waste guidance. This app cannot confirm that an item was recycled.";
  }
  return `${guidance}${examples}\n\nThis assistant uses simple rules and your own saved material details. It is not a safety assessment and does not complete actions for you.`;
}
