"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Check, CheckCircle2, CircleAlert, ClipboardList, Hammer, LoaderCircle, LogOut,
  MapPin, MessageSquareText, Package, Plus, Recycle, Search, Send, ShieldCheck,
  ShoppingBag, Sparkles, Trash2,
} from "lucide-react";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";
import { analyzeMaterial } from "@/lib/analysis";
import {
  demoApiRequest,
  getDemoSession,
  loginDemoAs,
  loadDemoWorkspace,
  setDemoSession,
  signOutDemo,
  type DemoUser,
} from "@/lib/demo-workspace";
import { isLocalDemoMode } from "@/lib/app-mode";
import "./portal.css";

export type RebuildSection = "dashboard" | "materials" | "marketplace" | "reuse" | "dispose" | "assistant" | "requests";

type Material = {
  id: string | number;
  name: string;
  category: string;
  description?: string;
  quantity?: number | string;
  unit?: string;
  condition?: string;
  approximate_location?: string;
  status?: string;
  created_at?: string;
  imageUrl?: string | null;
};
type Listing = {
  id: string | number;
  isOwn?: boolean;
  asking_price?: number | string | null;
  fulfillment?: string;
  created_at?: string;
  material?: Material;
  seller?: { display_name?: string; name?: string } | string;
  material_id?: string | number;
  [key: string]: unknown;
};
type WorkRequest = {
  id: string | number;
  buyer_id?: string;
  seller_id?: string;
  buyer?: { display_name?: string; name?: string } | string;
  seller?: { display_name?: string; name?: string } | string;
  fulfillment?: string;
  message?: string;
  status?: string;
  buyer_completed?: boolean;
  seller_completed?: boolean;
  completion_confirmed?: boolean;
  listing?: Listing;
  material?: Material;
  [key: string]: unknown;
};
type ActionRecord = { id: string | number; type: "reuse" | "disposal"; status: "planned" | "completed"; notes?: string; disposal_category?: string; material_name?: string; created_at?: string };
type ReuseProject = { id: string; title: string; description: string; categories: string[]; requirements: unknown[] };
type SavedProject = { id: string; project_id: string; material_id?: string | null; status: string; notes?: string; reuse_projects?: { title?: string } };
type MaterialAnalysis = { method: string; suggestedCategory: string; conditionProvided: string; conditionSource: string; indicativeValue: number | null; summary: string; reuseIdeas: string[]; disposalGuidance: string; confidence: string; safetyNote: string };
type SectionProps = { section: RebuildSection };

const sectionInfo: Record<RebuildSection, { label: string; title: string; description: string }> = {
  dashboard: { label: "Overview", title: "Your materials, in motion.", description: "Keep useful stock visible, find its next home, and record what happens next." },
  materials: { label: "Materials", title: "Material inventory", description: "A practical record of surplus stock your team can assess and put to use." },
  marketplace: { label: "Marketplace", title: "Find a useful next owner.", description: "Browse shared materials. Confirm details and fulfillment directly with the other person." },
  reuse: { label: "Reuse", title: "Put surplus to work.", description: "Record planned reuse and keep the material's next use connected to its source." },
  dispose: { label: "Responsible disposal", title: "When reuse is not right.", description: "Record a responsible disposal plan. Local requirements and safety checks still apply." },
  assistant: { label: "Material assistant", title: "A second set of eyes.", description: "Ask practical questions about your saved materials and possible next steps." },
  requests: { label: "Requests", title: "Material handoffs.", description: "Track incoming and outgoing requests, then confirm completion when the handoff is done." },
};
const navItems: RebuildSection[] = ["dashboard", "materials", "marketplace", "requests", "reuse", "dispose", "assistant"];
const categoryOptions = ["wood", "metal", "electronics", "electrical", "plastics", "construction", "mechanical", "chemicals", "other"];

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["data", "materials", "listings", "requests", "actions", "projects", "items", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}
function displayName(value: WorkRequest["buyer"] | WorkRequest["seller"] | Listing["seller"]): string {
  if (typeof value === "string") return value;
  return value?.display_name || value?.name || "Workspace member";
}
function dateLabel(value?: string) {
  if (!value) return "Recently added";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function money(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "Contact seller";
  const amount = Number(value);
  return Number.isNaN(amount) ? String(value) : amount === 0 ? "Free" : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount)} · currency to agree`;
}
function statusTone(status?: string) {
  if (!status) return "neutral";
  if (["available", "active", "planned", "pending"].includes(status.toLowerCase())) return "warm";
  if (["completed", "accepted", "fulfilled"].includes(status.toLowerCase())) return "";
  return "neutral";
}
function requestMaterial(request: WorkRequest): Material | undefined {
  return request.material || request.listing?.material;
}

async function compressLocalPhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const maxEdge = 1400;
  let scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  let quality = 0.82;
  let dataUrl = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      throw new Error("This browser could not prepare the image.");
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= 1_600_000) break;
    if (quality > 0.5) quality -= 0.1;
    else scale *= 0.8;
  }
  bitmap.close();
  if (!dataUrl || dataUrl.length > 1_600_000) throw new Error("This image is too large for local browser storage. Choose a smaller photo.");
  return dataUrl;
}

export default function RebuildPortal({ section }: SectionProps) {
  const router = useRouter();
  const [demoMode, setDemoMode] = useState(false);
  const [modeReady, setModeReady] = useState(false);
  const [active, setActive] = useState<RebuildSection>(section);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [requests, setRequests] = useState<WorkRequest[]>([]);
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [reuseProjects, setReuseProjects] = useState<ReuseProject[]>([]);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<MaterialAnalysis | null>(null);
  const [selectedAnalysisMaterial, setSelectedAnalysisMaterial] = useState<string>("");
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [listingCategory, setListingCategory] = useState("all");
  const [listingCondition, setListingCondition] = useState("all");
  const [busy, setBusy] = useState(false);
  const [materialForm, setMaterialForm] = useState({ name: "", category: "wood", description: "", quantity: "", unit: "", condition: "good", approximate_location: "" });
  const [listingForm, setListingForm] = useState({ material_id: "", asking_price: "", fulfillment: "pickup" });
  const [requestForm, setRequestForm] = useState({ listing_id: "", fulfillment: "pickup", message: "" });
  const [actionForm, setActionForm] = useState({ material_id: "", notes: "", disposal_category: "recycling" });
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => setActive(section), [section]);
  useEffect(() => {
    setDemoMode(isLocalDemoMode());
    setModeReady(true);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadData = useCallback(async (target: RebuildSection, quiet = false) => {
    if (!quiet) setLoading(true);
    setPageError("");
    try {
      if (demoMode) {
        if (!getDemoSession()) loginDemoAs("demo-seller");
        const workspace = loadDemoWorkspace();
        setCurrentUserId(workspace.user.id);
        setDemoUsers(workspace.users);
        setSummary(workspace.summary);
        setMaterials(workspace.materials);
        setListings(workspace.listings);
        setMyListings(workspace.myListings);
        setRequests(workspace.requests);
        setActions(workspace.actions);
        setReuseProjects(workspace.projects);
        setSavedProjects(workspace.savedProjects);
        return;
      }
      const endpoints: Array<[string, string]> = [];
       if (target === "dashboard") endpoints.push(["summary", "/api/summary"], ["materials", "/api/materials"], ["requests", "/api/requests"], ["actions", "/api/actions"]);
      if (target === "materials" || target === "reuse" || target === "dispose" || target === "assistant") endpoints.push(["materials", "/api/materials"]);
       if (target === "reuse" || target === "dispose") endpoints.push(["actions", "/api/actions"]);
       if (target === "reuse") endpoints.push(["projects", "/api/projects"]);
       if (target === "marketplace") endpoints.push(["listings", "/api/listings"], ["myListings", "/api/listings?mine=1"], ["materials", "/api/materials"]);
      if (target === "requests") endpoints.push(["requests", "/api/requests"]);
      const responses = await Promise.all(endpoints.map(async ([key, url]) => {
        const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((body as { error?: string; message?: string }).error || (body as { message?: string }).message || `Could not load ${key}. Please try again.`);
        return [key, body] as const;
      }));
      for (const [key, body] of responses) {
        if (key === "summary") setSummary(body as Record<string, unknown>);
        if (key === "materials") setMaterials(unwrapList<Material>(body));
         if (key === "listings") {
           setListings(unwrapList<Listing>(body));
           if (typeof (body as { userId?: unknown }).userId === "string") setCurrentUserId((body as { userId: string }).userId);
         }
         if (key === "myListings") setMyListings(unwrapList<Listing>(body));
         if (key === "actions") setActions(unwrapList<ActionRecord>(body));
         if (key === "projects") {
           setReuseProjects(unwrapList<ReuseProject>(body));
           setSavedProjects(Array.isArray((body as { saved?: unknown }).saved) ? (body as { saved: SavedProject[] }).saved : []);
         }
         if (key === "requests") {
           setRequests(unwrapList<WorkRequest>(body));
           if (typeof (body as { userId?: unknown }).userId === "string") setCurrentUserId((body as { userId: string }).userId);
         }
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Something went wrong while loading this workspace.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [demoMode, router]);
  useEffect(() => { if (modeReady) void loadData(active); }, [active, loadData, modeReady]);

  const navigate = (target: RebuildSection) => {
    setSearch("");
    setNotice("");
    const routes: Record<RebuildSection, string> = {
      dashboard: "/dashboard",
      materials: "/dashboard/materials",
      marketplace: "/dashboard/marketplace",
      reuse: "/dashboard/reuse",
      dispose: "/dashboard/dispose",
      assistant: "/dashboard/assistant",
      requests: "/dashboard/requests",
    };
    router.push(routes[target]);
  };
  const apiPost = async (url: string, method: "POST" | "PATCH", payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (demoMode) return demoApiRequest(url, method, payload) as Record<string, unknown>;
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((body as { error?: string; message?: string }).error || (body as { message?: string }).message || `Request failed (${response.status}).`);
    return body as Record<string, unknown>;
  };
  const doSubmit = async (event: React.FormEvent, task: () => Promise<void>) => {
    event.preventDefault();
    setNotice("");
    setBusy(true);
    try { await task(); } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not complete that request. Please try again.");
    } finally { setBusy(false); }
  };
  const refresh = async () => loadData(active, true);
  const switchDemoAccount = async (userId: string) => {
    setBusy(true);
    setNotice("");
    try {
      setDemoSession(userId);
      await loadData(active, true);
      setToast("Switched local demo account");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not switch accounts.");
    } finally {
      setBusy(false);
    }
  };
  const exitDemo = () => {
    signOutDemo();
    router.replace("/login");
  };
  const visibleMaterials = useMemo(() => materials.filter(item => `${item.name} ${item.category} ${item.description || ""} ${item.approximate_location || ""}`.toLowerCase().includes(search.toLowerCase())), [materials, search]);
  const visibleListings = useMemo(() => listings.filter(item => {
    const material = item.material;
    return `${material?.name || ""} ${material?.category || ""} ${material?.description || ""} ${displayName(item.seller as Listing["seller"])}`.toLowerCase().includes(search.toLowerCase())
      && (listingCategory === "all" || material?.category === listingCategory)
      && (listingCondition === "all" || material?.condition === listingCondition);
  }), [listings, search, listingCategory, listingCondition]);

  const createMaterial = (event: React.FormEvent) => doSubmit(event, async () => {
    let imagePath: string | undefined;
    let imageType: string | undefined;
    let imageDataUrl: string | undefined;
    const supabase = demoMode ? null : createBrowserClient();
    if (photoFile) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(photoFile.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
      if (photoFile.size > 5 * 1024 * 1024) throw new Error("Images must be 5 MB or smaller.");
      if (supabase) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Sign in again before uploading an image.");
        const extension = photoFile.type === "image/jpeg" ? "jpg" : photoFile.type === "image/png" ? "png" : "webp";
        imagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        imageType = photoFile.type;
        const { error: uploadError } = await supabase.storage.from("material-uploads").upload(imagePath, photoFile, { contentType: imageType, upsert: false });
        if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);
      } else {
        imageDataUrl = await compressLocalPhoto(photoFile);
      }
    }
    const payload = {
      name: materialForm.name,
      category: materialForm.category,
      description: materialForm.description,
      quantity: Number(materialForm.quantity),
      unit: materialForm.unit,
      condition: materialForm.condition,
      location: materialForm.approximate_location,
      imagePath,
      imageType,
      imageDataUrl,
    };
    try {
      const response = await apiPost("/api/materials", "POST", payload);
      if (response.analysis && typeof response.analysis === "object") setLastAnalysis(response.analysis as MaterialAnalysis);
    } catch (error) {
      if (imagePath && supabase) await supabase.storage.from("material-uploads").remove([imagePath]);
      throw error;
    }
    setMaterialForm({ name: "", category: "wood", description: "", quantity: "", unit: "", condition: "good", approximate_location: "" });
    setPhotoFile(null);
    setToast("Material saved to your inventory");
    await refresh();
  });
  const createListing = (event: React.FormEvent) => doSubmit(event, async () => {
    const payload: Record<string, unknown> = {
      materialId: listingForm.material_id,
      askingPrice: listingForm.asking_price === "" ? 0 : Number(listingForm.asking_price),
      fulfillment: [listingForm.fulfillment],
    };
    await apiPost("/api/listings", "POST", payload);
    setListingForm({ material_id: "", asking_price: "", fulfillment: "pickup" });
    setToast("Listing published");
    await refresh();
  });
  const sendRequest = (event: React.FormEvent) => doSubmit(event, async () => {
    await apiPost("/api/requests", "POST", {
      listingId: requestForm.listing_id,
      fulfillment: requestForm.fulfillment.toLowerCase(),
      message: requestForm.message,
    });
    setRequestForm({ listing_id: "", fulfillment: "pickup", message: "" });
    setToast("Request sent");
    await refresh();
  });
  const submitAction = (type: "reuse" | "disposal") => (event: React.FormEvent) => doSubmit(event, async () => {
    const payload: Record<string, unknown> = { type, status: "planned", notes: actionForm.notes, materialId: actionForm.material_id };
    if (type === "disposal") payload.disposalCategory = actionForm.disposal_category;
    const response = await apiPost("/api/actions", "POST", payload);
    const returned = (response.action || response.data || response) as Partial<ActionRecord>;
    if (returned && returned.id !== undefined) setActions(current => [returned as ActionRecord, ...current]);
    setActionForm({ material_id: "", notes: "", disposal_category: "recycling" });
    setToast(type === "reuse" ? "Reuse plan recorded" : "Disposal plan recorded");
    await refresh();
  });
  const saveReuseProject = async (projectId: string) => {
    setBusy(true);
    setNotice("");
    try {
      await apiPost("/api/projects", "POST", {
        projectId,
        materialId: actionForm.material_id || undefined,
        status: "planned",
        notes: actionForm.notes,
      });
      setToast("Reuse idea saved as a plan");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save this project.");
    } finally {
      setBusy(false);
    }
  };
  const completeAction = async (id: string | number) => {
    setBusy(true);
    setNotice("");
    try {
      await apiPost(`/api/actions/${encodeURIComponent(String(id))}`, "PATCH", { status: "completed" });
      setToast("Activity marked completed");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update this activity.");
    } finally {
      setBusy(false);
    }
  };
  const askAssistant = (event: React.FormEvent) => doSubmit(event, async () => {
    const q = question.trim();
    if (!q) return;
    setChatHistory(current => [...current, { role: "user", text: q }]);
    setQuestion("");
    try {
      const body = await apiPost("/api/assistant", "POST", { question: q });
      const text = String(body.answer ?? body.response ?? body.message ?? "");
      if (!text) throw new Error("The assistant returned an empty response.");
      setChatHistory(current => [...current, { role: "assistant", text }]);
    } catch (error) {
      setChatHistory(current => [...current, { role: "assistant", text: error instanceof Error ? error.message : "The assistant could not respond." }]);
      throw error;
    }
  });
  const updateRequest = async (id: string | number, payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    setNotice("");
    try { await apiPost(`/api/requests/${encodeURIComponent(String(id))}`, "PATCH", payload); setToast(success); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not update this request."); }
    finally { setBusy(false); }
  };

  const title = sectionInfo[active];
  const header = <>
    {demoMode && <div className="rb-demo-banner"><div className="rb-shell"><strong>Local browser demo</strong><span>Data stays in this browser; profiles are not real accounts and are not private.</span></div></div>}
    <header className="rb-topbar"><div className="rb-shell rb-topbar-inner">
      <div className="rb-brand"><span className="rb-mark"><Recycle aria-hidden="true" /></span><span>REBUILD AI<small>MATERIAL RECOVERY</small></span></div>
      <nav className="rb-nav" aria-label="Workspace navigation">{navItems.map(item => <button key={item} aria-current={active === item ? "page" : undefined} onClick={() => navigate(item)}>{sectionInfo[item].label}</button>)}</nav>
      {demoMode ? <div className="rb-account-switch">
        <label className="sr-only" htmlFor="demo-account">Switch demo profile</label>
        <select id="demo-account" value={currentUserId} onChange={event => void switchDemoAccount(event.target.value)} disabled={busy}>
          {demoUsers.map(user => <option key={user.id} value={user.id}>{user.display_name}</option>)}
        </select>
        <button className="rb-profile" type="button" onClick={exitDemo} aria-label="Exit local demo" title="Exit local demo"><LogOut size={15} /></button>
      </div> : <form action="/auth/signout" method="post"><button className="rb-profile" type="submit" aria-label="Sign out" title="Sign out"><LogOut size={15} /></button></form>}
    </div></header>
  </>;
  const pageHeading = (action?: React.ReactNode) => <div className="rb-page-head"><div><div className="rb-overline">{title.label}</div><h1>{title.title}</h1><p>{title.description}</p></div>{action && <div className="rb-head-actions">{action}</div>}</div>;
  const feedback = notice ? <div className="rb-message error" role="alert"><CircleAlert />{notice}</div> : null;
  const empty = (headline: string, copy: string, icon: React.ReactNode, button?: React.ReactNode) => <div className="rb-empty"><span className="rb-empty-mark">{icon}</span><strong>{headline}</strong><p>{copy}</p>{button}</div>;
  const materialRow = (item: Material) => <div className="rb-material-row" key={item.id}><span className="rb-material-symbol"><Package /></span><div className="rb-material-copy"><strong>{item.name}</strong><span>{item.quantity ?? "—"} {item.unit || "units"} · {item.category} · {item.condition || "Condition not noted"}</span></div><span className={`rb-tag ${statusTone(item.status)}`}>{item.status || "Available"}</span></div>;
  const renderLoading = (count = 3) => <div className="rb-stack" aria-label="Loading content">{Array.from({ length: count }, (_, i) => <div className="rb-skeleton" key={i} />)}</div>;

  const renderDashboard = () => {
    const summaryData = summary || {};
    const getCount = (...keys: string[]) => {
      for (const key of keys) if (typeof summaryData[key] === "number" || typeof summaryData[key] === "string") return String(summaryData[key]);
      return "—";
    };
    const focusMaterial = materials[0];
    const focusAnalysis = focusMaterial ? analyzeMaterial({
      name: focusMaterial.name,
      category: focusMaterial.category,
      description: focusMaterial.description,
      condition: focusMaterial.condition,
    }) : null;
    return <>
      <section className="rb-welcome">
        <div className="rb-welcome-copy">
          <span className="rb-overline">Your circular workspace</span>
          <h1>Make room for<br /><em>what comes next.</em></h1>
          <p>Record surplus, find it a new home, and keep the next step visible.</p>
          <button className="rb-btn" onClick={() => navigate("materials")}><Plus />Add material</button>
        </div>
        <div className="rb-welcome-art" aria-hidden="true">
          <div className="rb-orbit orbit-one" /><div className="rb-orbit orbit-two" />
          <span className="rb-art-chip chip-a">LIST</span><span className="rb-art-chip chip-b">REUSE</span>
          <Recycle className="rb-art-symbol" />
          <span className="rb-art-caption">Useful things<br />keep moving.</span>
        </div>
      </section>
      {pageError && <div className="rb-message error" role="alert"><CircleAlert />{pageError}<button className="rb-quiet-link" onClick={() => void loadData(active)}>Retry</button></div>}
      <div className="rb-flow-strip" aria-label="Workspace activity summary">
        <div><strong>{loading ? "—" : getCount("materials")}</strong><span>materials in your inventory</span></div>
        <span className="rb-flow-divider" aria-hidden="true">→</span>
        <div><strong>{loading ? "—" : getCount("activeListings")}</strong><span>open listings</span></div>
        <span className="rb-flow-divider" aria-hidden="true">→</span>
        <div><strong>{loading ? "—" : getCount("incomingRequests")}</strong><span>requests to follow up</span></div>
      </div>
      <div className="rb-dashboard-grid rb-dashboard-story">
        <div className="rb-panel rb-inventory-panel"><div className="rb-panel-head"><div><span className="rb-kicker">On your shelves</span><h2>Recent materials</h2></div><button className="rb-quiet-link" onClick={() => navigate("materials")}>View inventory <ArrowRight size={13} /></button></div>
          {loading ? renderLoading(3) : pageError ? null : materials.length ? <div className="rb-row-list">{materials.slice(0, 4).map(materialRow)}</div> : empty("Nothing in the inventory yet", "Add a material record to make surplus stock visible to your team.", <Package />, <button className="rb-btn" onClick={() => navigate("materials")}><Plus />Add first material</button>)}
        </div>
        <div className="rb-next-step">
          <span className="rb-kicker">Keep it moving</span><h2>What should happen next?</h2>
          <button className="rb-step-link" onClick={() => navigate("marketplace")}><span className="rb-step-number">01</span><span><strong>Find a new owner</strong><small>Publish or browse shared stock</small></span><ArrowRight /></button>
          <button className="rb-step-link" onClick={() => navigate("reuse")}><span className="rb-step-number">02</span><span><strong>Plan a second use</strong><small>Keep a material in circulation</small></span><ArrowRight /></button>
          <button className="rb-step-link" onClick={() => navigate("dispose")}><span className="rb-step-number">03</span><span><strong>Record responsible disposal</strong><small>When reuse is not suitable</small></span><ArrowRight /></button>
        </div>
        <div className="rb-guidance-preview">
          <div className="rb-guidance-top"><span className="rb-guidance-mark"><Sparkles /></span><span className="rb-kicker">Material guide · rule-based</span></div>
          {focusAnalysis ? <>
            <h2>A thought for <em>{focusMaterial.name}</em></h2>
            <p>{focusAnalysis.reuseIdeas[0]} could be worth exploring, based on its recorded {focusMaterial.category} category.</p>
            <span className="rb-guide-meta">Uses your saved details · no image assessment</span>
          </> : <>
            <h2>Start with a material.</h2><p>Record surplus to see practical, category-based reuse and disposal guidance here.</p>
            <button className="rb-quiet-link" onClick={() => navigate("materials")}>Add your first material <ArrowRight size={13} /></button>
          </>}
          <button className="rb-guide-open" onClick={() => navigate("assistant")}>Explore material guidance <ArrowRight /></button>
        </div>
        <div className="rb-panel rb-activity-panel"><div className="rb-panel-head"><div><span className="rb-kicker">A clear next step</span><h2>Handoffs & activity</h2></div><button className="rb-quiet-link" onClick={() => navigate("requests")}>All requests <ArrowRight size={13} /></button></div>
          {loading ? renderLoading(2) : requests.length ? <div className="rb-row-list">{requests.slice(0, 2).map(req => <div className="rb-material-row" key={req.id}><span className="rb-material-symbol"><ClipboardList /></span><div className="rb-material-copy"><strong>{requestMaterial(req)?.name || `Request ${req.id}`}</strong><span>{displayName(req.buyer)} · {req.fulfillment || "Fulfillment to arrange"}</span></div><span className={`rb-tag ${statusTone(req.status)}`}>{req.status || "Pending"}</span></div>)}</div> : <p className="rb-activity-empty">No handoffs yet. Requests and two-sided confirmations will show up here.</p>}
          {actions.length > 0 && <div className="rb-activity-foot"><span>{actions.filter(item => item.status === "completed").length} reuse or disposal actions completed</span><button className="rb-quiet-link" onClick={() => navigate("reuse")}>See activity</button></div>}
        </div>
        <div className="rb-guidance rb-safety-note"><strong><ShieldCheck size={14} style={{ verticalAlign: "-3px", marginRight: 5 }} />Keep the final call human</strong>Guidance and records do not verify material safety, composition, or suitability. Inspect stock and follow qualified advice before use.</div>
      </div>
    </>;
  };

  const renderMaterials = () => <>
    {pageHeading()}
    {feedback}
    {lastAnalysis && <div className="rb-panel" style={{ marginBottom: 16 }}>
      <div className="rb-panel-head"><h2>Rule-based material guidance</h2><span>{lastAnalysis.confidence}</span></div>
      <p><strong>Suggested category:</strong> {lastAnalysis.suggestedCategory} · <strong>Condition:</strong> {lastAnalysis.conditionProvided} ({lastAnalysis.conditionSource})</p>
      <p><strong>Value estimate:</strong> Not provided; there is not enough verified market information.</p>
      <p>{lastAnalysis.summary}</p>
      <strong>Possible next uses</strong><p>{lastAnalysis.reuseIdeas.join(" · ")}</p>
      <strong>Disposal guidance</strong><p>{lastAnalysis.disposalGuidance}</p>
      <div className="rb-message info"><ShieldCheck />{lastAnalysis.safetyNote}</div>
    </div>}
    {pageError && <div className="rb-message error" role="alert"><CircleAlert />{pageError}<button className="rb-quiet-link" onClick={() => void loadData(active)}>Retry</button></div>}
    <div className="rb-content-grid" style={{ marginTop: 16 }}>
      <section className="rb-panel"><div className="rb-panel-head"><h2>Add a material</h2><span>Inventory record</span></div>
        <form className="rb-form" onSubmit={createMaterial}>
          <Field label="Material name"><input required maxLength={100} value={materialForm.name} onChange={e => setMaterialForm({ ...materialForm, name: e.target.value })} placeholder="e.g. Birch plywood offcuts" /></Field>
          <Field label="Category"><select value={materialForm.category} onChange={e => setMaterialForm({ ...materialForm, category: e.target.value })}>{categoryOptions.map(option => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}</select></Field>
          <div className="rb-inline"><Field label="Quantity"><input type="number" min="0" step="any" required value={materialForm.quantity} onChange={e => setMaterialForm({ ...materialForm, quantity: e.target.value })} placeholder="0" /></Field><Field label="Unit"><input maxLength={24} required value={materialForm.unit} onChange={e => setMaterialForm({ ...materialForm, unit: e.target.value })} placeholder="sheets, kg…" /></Field></div>
           <Field label="Condition"><select value={materialForm.condition} onChange={e => setMaterialForm({ ...materialForm, condition: e.target.value })}><option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option><option value="unknown">Unknown</option></select></Field>
          <Field label="Approximate location"><input maxLength={120} value={materialForm.approximate_location} onChange={e => setMaterialForm({ ...materialForm, approximate_location: e.target.value })} placeholder="Building, workshop, or area" /></Field>
          <Field label="Description"><textarea maxLength={1000} value={materialForm.description} onChange={e => setMaterialForm({ ...materialForm, description: e.target.value })} placeholder="Dimensions, specifications, or useful context" /></Field>
           <Field label="Optional photo"><div className="rb-file"><input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Optional material photo" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} /><span className="rb-field-hint">{photoFile ? `${photoFile.name} · ${demoMode ? "compressed and saved in this browser" : "saved privately with this material"}` : demoMode ? "JPEG, PNG, or WebP · up to 5 MB · compressed for this browser demo" : "JPEG, PNG, or WebP · up to 5 MB · stored privately"}</span></div></Field>
          <button className="rb-btn" disabled={busy}>{busy ? <><span className="rb-busy" />Saving…</> : <><Plus />Save material</>}</button>
        </form>
      </section>
      <section className="rb-panel"><div className="rb-panel-head"><h2>Your inventory</h2><span>{loading ? "Loading" : `${materials.length} records`}</span></div>
        <div className="rb-toolbar"><div className="rb-search-wrap"><Search /><input className="rb-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, type, location" aria-label="Search materials" /></div><button className="rb-btn secondary" onClick={() => void loadData(active)} aria-label="Refresh materials"><LoaderCircle size={15} />Refresh</button></div>
        {pageError ? <div className="rb-message error" role="alert"><CircleAlert />{pageError}<button className="rb-quiet-link" onClick={() => void loadData(active)}>Retry</button></div> : loading ? renderLoading() : visibleMaterials.length ? <div className="rb-row-list">{visibleMaterials.map(materialRow)}</div> : empty(search ? "No matches found" : "Your inventory starts here", search ? "Try another material name, category, or location." : "Give leftover stock a clear record so it can be assessed and reused.", <Package />)}
        <p className="rb-footnote">Material details should be accurate enough for another person to assess. Do not include sensitive location details.</p>
      </section>
    </div>
  </>;

  const renderMarketplace = () => <>
    {pageHeading()}
    {feedback}
    {pageError && <div className="rb-message error" role="alert"><CircleAlert />{pageError}<button className="rb-quiet-link" onClick={() => void loadData(active)}>Retry</button></div>}
    <section className="rb-panel" style={{ marginTop: 16 }}>
      <div className="rb-panel-head"><h2>List one of your materials</h2><span>No payments in the app</span></div>
      {!materials.length && <div className="rb-message info"><Package />Add a material before creating a listing.</div>}
      <form className="rb-form" onSubmit={createListing}>
        <div className="rb-inline">
          <Field label="Material"><select required value={listingForm.material_id} onChange={e => setListingForm({ ...listingForm, material_id: e.target.value })}><option value="">Choose your material</option>{materials.map(item => <option key={item.id} value={item.id}>{item.name} · {item.quantity} {item.unit}</option>)}</select></Field>
          <Field label="Asking amount (0 for free)"><input type="number" min="0" step="0.01" value={listingForm.asking_price} onChange={e => setListingForm({ ...listingForm, asking_price: e.target.value })} placeholder="0" /></Field>
        </div>
        <Field label="Fulfillment"><select value={listingForm.fulfillment} onChange={e => setListingForm({ ...listingForm, fulfillment: e.target.value })}><option value="pickup">Pickup</option><option value="shipping">Shipping</option></select></Field>
        <p className="rb-field-hint">Currency and shipping fees are not set in the app; agree on them directly before any transaction.</p>
        <button className="rb-btn" disabled={busy || !materials.length}>{busy ? <><span className="rb-busy" />Publishing…</> : <><Plus />Publish listing</>}</button>
      </form>
    </section>
    {myListings.length > 0 && <section className="rb-panel" style={{ marginTop: 16 }}>
      <div className="rb-panel-head"><h2>Your listings</h2><span>{myListings.length} records</span></div>
      <div className="rb-stack">{myListings.map(item => <article className="rb-request" key={item.id}>
        <div className="rb-request-head"><div><h3>{item.material?.name || "Your material"}</h3><span className="rb-tag">{String(item.status || "active")}</span></div><span className="rb-tag neutral">{item.fulfillment}</span></div>
        <div className="rb-inline">
          <Field label="Asking amount"><input type="number" min="0" step="0.01" value={String(item.asking_price ?? 0)} onChange={e => setMyListings(current => current.map(row => row.id === item.id ? { ...row, asking_price: e.target.value } : row))} /></Field>
          <Field label="Fulfillment"><select value={String(item.fulfillment || "pickup").toLowerCase()} onChange={e => setMyListings(current => current.map(row => row.id === item.id ? { ...row, fulfillment: e.target.value } : row))}><option value="pickup">Pickup</option><option value="shipping">Shipping</option></select></Field>
        </div>
        <button type="button" className="rb-btn secondary" disabled={busy || item.status === "sold"} onClick={async () => { setBusy(true); try { await apiPost(`/api/listings/${item.id}`, "PATCH", { askingPrice: Number(item.asking_price ?? 0), fulfillment: [String(item.fulfillment || "pickup").toLowerCase()] }); setToast("Listing updated"); await refresh(); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not update listing."); } finally { setBusy(false); } }}>Save listing changes</button>
        {item.status !== "sold" && item.status !== "closed" && <button type="button" className="rb-btn secondary" disabled={busy} onClick={async () => { setBusy(true); try { await apiPost(`/api/listings/${item.id}`, "PATCH", { status: item.status === "paused" ? "active" : "paused" }); setToast(item.status === "paused" ? "Listing reactivated" : "Listing paused"); await refresh(); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not update listing."); } finally { setBusy(false); } }}>{item.status === "paused" ? "Reactivate listing" : "Pause listing"}</button>}
      </article>)}</div>
    </section>}
    <section className="rb-panel" style={{ marginTop: 16 }}>
      <div className="rb-panel-head"><h2>Available materials</h2><span>Listings shared with your workspace</span></div>
      <div className="rb-toolbar"><div className="rb-search-wrap"><Search /><input className="rb-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search available materials" aria-label="Search marketplace listings" /></div><div className="rb-toolbar-end"><select aria-label="Filter by category" value={listingCategory} onChange={e => setListingCategory(e.target.value)}><option value="all">All categories</option>{categoryOptions.map(option => <option key={option} value={option}>{option}</option>)}</select><select aria-label="Filter by condition" value={listingCondition} onChange={e => setListingCondition(e.target.value)}><option value="all">Any condition</option>{["new", "good", "fair", "poor", "unknown"].map(option => <option key={option} value={option}>{option}</option>)}</select><button className="rb-btn secondary" onClick={() => void loadData(active)}><LoaderCircle size={15} />Refresh</button><button className="rb-btn" onClick={() => navigate("materials")}><Plus />Add stock</button></div></div>
      {loading ? renderLoading(4) : pageError ? null : visibleListings.length ? <div className="rb-cards">{visibleListings.map(listing => <article className="rb-card" key={listing.id}>
        {listing.material?.imageUrl && <img className="rb-card-image" src={listing.material.imageUrl} alt={`Photo of ${listing.material?.name || "listed material"}`} />}
        <div className="rb-card-top"><div><h3>{listing.material?.name || "Material listing"}</h3><span className="rb-tag">{listing.material?.category || "Uncategorized"}</span></div><span className="rb-price">{money(listing.asking_price)}</span></div>
        <p>{listing.material?.description || "No additional material details provided."}</p>
        <div className="rb-card-meta"><span className="rb-tag neutral">{listing.material?.quantity ?? "—"} {listing.material?.unit || "units"}</span><span className="rb-tag neutral">{listing.material?.condition || "Condition not noted"}</span><span className="rb-tag neutral">{listing.fulfillment || "Arrange directly"}</span></div>
        <div className="rb-card-bottom"><span><MapPin size={12} style={{ verticalAlign: "-2px" }} /> {listing.material?.approximate_location || "Location not shared"}</span><span>By {displayName(listing.seller)}</span></div>
        {listing.isOwn ? <span className="rb-tag neutral" style={{ marginTop: 12 }}>Your listing</span> : <button className="rb-btn" style={{ marginTop: 12 }} onClick={() => { setRequestForm({ ...requestForm, listing_id: String(listing.id) }); setNotice(""); document.getElementById("rb-request-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Request material <ArrowRight /></button>}
      </article>)}</div> : empty(search ? "No listings match that search" : "No listings available right now", "Check back later, or make surplus stock visible by adding a material and listing it.", <ShoppingBag />)}
    </section>
    <section className="rb-panel" id="rb-request-form" style={{ marginTop: 16 }}>
      <div className="rb-panel-head"><h2>Send a material request</h2><span>Coordinate directly</span></div>
      <form className="rb-form" onSubmit={sendRequest}>
         <div className="rb-inline"><Field label="Listing"><select required value={requestForm.listing_id} onChange={e => setRequestForm({ ...requestForm, listing_id: e.target.value })}><option value="">Choose a listing</option>{listings.map(item => <option key={item.id} value={item.id}>{item.material?.name || `Listing ${item.id}`}</option>)}</select></Field><Field label="Fulfillment"><select value={requestForm.fulfillment} onChange={e => setRequestForm({ ...requestForm, fulfillment: e.target.value })}><option value="pickup">Pickup</option><option value="shipping">Shipping</option></select></Field></div>
        <Field label="Message"><textarea required minLength={5} maxLength={800} value={requestForm.message} onChange={e => setRequestForm({ ...requestForm, message: e.target.value })} placeholder="Introduce your intended use or ask a practical question" /></Field>
        <p className="rb-field-hint">Requests are coordination only. Payment and final handoff arrangements happen directly between participants.</p>
        <button className="rb-btn" disabled={busy || listings.length === 0}>{busy ? <><span className="rb-busy" />Sending…</> : <><Send />Send request</>}</button>
      </form>
    </section>
  </>;

  const renderRequests = () => <>
    {pageHeading(<button className="rb-btn secondary" onClick={() => void loadData(active)}><LoaderCircle />Refresh</button>)}
    {feedback}
    {pageError && <div className="rb-message error" role="alert"><CircleAlert />{pageError}<button className="rb-quiet-link" onClick={() => void loadData(active)}>Retry</button></div>}
    <section className="rb-panel">
      <div className="rb-panel-head"><h2>Requests and confirmations</h2><span>{loading ? "Loading" : `${requests.length} requests`}</span></div>
      <div className="rb-message info" style={{ marginBottom: 14 }}><ShieldCheck />Completion confirmation records that your side of the handoff is done. It does not verify payment, condition, or receipt by the other person.</div>
      {loading ? renderLoading(3) : pageError ? null : requests.length ? <div className="rb-stack">{requests.map(request => {
        const material = requestMaterial(request);
         const confirmed = Boolean(request.completion_confirmed);
         const status = String(request.status || "").toLowerCase();
         const complete = status === "completed";
         const isSeller = request.seller_id === currentUserId;
        return <article className="rb-request" key={request.id}>
          <div className="rb-request-head"><div><h3>{material?.name || `Material request ${request.id}`}</h3><span className="rb-tag">{request.status || "Pending"}</span></div><span className={`rb-tag ${statusTone(request.status)}`}>{request.fulfillment || "Fulfillment to arrange"}</span></div>
          <p>{request.message || "No message included."}</p>
          <div className="rb-request-foot"><span>Buyer: {displayName(request.buyer)} · Seller: {displayName(request.seller)}</span>
             {status === "requested" && isSeller && <div className="rb-request-actions"><button className="rb-btn secondary" disabled={busy} onClick={() => void updateRequest(request.id, { status: "declined" }, "Request declined")}>Decline</button><button className="rb-btn" disabled={busy} onClick={() => void updateRequest(request.id, { status: "accepted" }, "Request accepted")}>Accept request</button></div>}
             {status === "requested" && !isSeller && <span className="rb-tag neutral">Waiting for seller</span>}
             {status === "accepted" && <div className="rb-request-actions"><button className="rb-btn" disabled={busy || confirmed} onClick={() => void updateRequest(request.id, { confirmComplete: true }, confirmed ? "Your side is confirmed" : "Your completion was confirmed")}>{confirmed ? <><Check />Your side confirmed</> : <><CheckCircle2 />Confirm handoff</>}</button></div>}
             {status === "declined" && <span className="rb-tag neutral">Request declined</span>}
            {complete && <span className="rb-tag">Completed</span>}
          </div>
        </article>;
      })}</div> : empty("No requests yet", "When a material request is sent or received, its handoff details will live here.", <ClipboardList />)}
    </section>
  </>;

  const renderAction = (type: "reuse" | "dispose") => {
    const isReuse = type === "reuse";
    const actionType = isReuse ? "reuse" : "disposal";
    const relevant = actions.filter(item => item.type === actionType);
    return <>
      {pageHeading()}
      {feedback}
      {pageError && <div className="rb-message error" role="alert"><CircleAlert />{pageError}<button className="rb-quiet-link" onClick={() => void loadData(active)}>Retry</button></div>}
      <div className="rb-content-grid" style={{ marginTop: 16 }}>
        <section className="rb-panel"><div className="rb-panel-head"><h2>{isReuse ? "Record a reuse plan" : "Record a disposal plan"}</h2><span>Action record</span></div>
          {!materials.length && !loading && <div className="rb-message info" style={{ marginBottom: 12 }}>Add a material record before creating an action.</div>}
          <form className="rb-form" onSubmit={submitAction(actionType)}>
            <Field label="Material"><select required value={actionForm.material_id} onChange={e => setActionForm({ ...actionForm, material_id: e.target.value })}><option value="">Choose material</option>{materials.map(item => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></Field>
            {isReuse ? <Field label="Reuse notes"><textarea required maxLength={1200} value={actionForm.notes} onChange={e => setActionForm({ ...actionForm, notes: e.target.value })} placeholder="What is the intended next use? Add useful context." /></Field> : <>
              <Field label="Disposal category"><select value={actionForm.disposal_category} onChange={e => setActionForm({ ...actionForm, disposal_category: e.target.value })}><option value="recycling">Recycling</option><option value="e-waste">Electronic waste</option><option value="hazardous-waste">Hazardous waste</option><option value="construction-waste">Construction waste</option><option value="other">Other / local guidance</option></select></Field>
              <Field label="Disposal notes"><textarea required maxLength={1200} value={actionForm.notes} onChange={e => setActionForm({ ...actionForm, notes: e.target.value })} placeholder="Planned facility, separation details, or local guidance checked" /></Field>
            </>}
            {!isReuse && <div className="rb-message info"><ShieldCheck />For chemicals, electronics, damaged items, and regulated stock, follow your local authority or qualified handler. This record does not verify disposal.</div>}
            <button className="rb-btn" disabled={busy || !materials.length}>{busy ? <><span className="rb-busy" />Saving…</> : isReuse ? <><Hammer />Save reuse plan</> : <><Trash2 />Save disposal plan</>}</button>
          </form>
        </section>
        <section className="rb-panel"><div className="rb-panel-head"><h2>{isReuse ? "Reuse records" : "Disposal records"}</h2><span>{loading ? "Loading" : `${relevant.length} recorded`}</span></div>
          {loading ? renderLoading(3) : relevant.length ? <div className="rb-stack">{relevant.map(item => <div className="rb-request" key={item.id}><div className="rb-request-head"><div><h3>{item.material_name || (item.type === "reuse" ? "Reuse activity" : item.disposal_category || "Disposal activity")}</h3><span className="rb-tag">{item.status}</span></div><span className="rb-tag neutral">{dateLabel(item.created_at)}</span></div><p>{item.notes || "No notes provided."}</p>{item.status === "planned" && <button type="button" className="rb-btn secondary" disabled={busy} onClick={() => void completeAction(item.id)}><CheckCircle2 />Mark completed</button>}</div>)}</div> : empty(isReuse ? "No reuse plans recorded" : "No disposal records yet", "Save a plan after choosing a material from your inventory.", isReuse ? <Hammer /> : <Trash2 />)}
        </section>
      </div>
      {isReuse && <section className="rb-panel" style={{ marginTop: 16 }}>
        <div className="rb-panel-head"><h2>Project ideas</h2><span>Suggestions, not safety assessments</span></div>
        {loading ? renderLoading(2) : reuseProjects.length ? <div className="rb-cards">{reuseProjects.map(project => {
          const chosen = materials.find(material => material.id === actionForm.material_id);
          const matches = chosen ? project.categories.includes(chosen.category) : null;
          const requirements = project.requirements.map(value => {
            const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
            return item;
          });
          const requirementLabels = requirements.map(item => [item.material, item.minimum_quantity, item.unit].filter(Boolean).join(" ")).filter(Boolean);
          const matchingRequirement = chosen && requirements.find(item => item.material === chosen.category);
          const quantityMatch = chosen && matchingRequirement
            ? Number(chosen.quantity) >= Number(matchingRequirement.minimum_quantity ?? 0)
            : null;
          return <article className="rb-card" key={project.id}>
            <div className="rb-card-top"><h3>{project.title}</h3><span className="rb-tag">{project.categories.join(", ") || "General"}</span></div>
            <p>{project.description}</p>
            <p><strong>Listed requirements:</strong> {requirementLabels.join(" · ") || "Check the project details."}</p>
            {chosen && <span className={`rb-tag ${matches ? "" : "neutral"}`}>{matches ? `Selected material category matches: ${chosen.category}` : `Selected material category differs: ${chosen.category}`}</span>}
            {chosen && matchingRequirement && <p className="rb-field-hint">Quantity check: {quantityMatch ? "meets" : "below"} the listed minimum of {String(matchingRequirement.minimum_quantity ?? 0)} {String(matchingRequirement.unit ?? "")}. Confirm units and suitability before use.</p>}
            <button type="button" className="rb-btn" disabled={busy} onClick={() => void saveReuseProject(project.id)}><Plus />Save as planned project</button>
          </article>;
        })}</div> : empty("No project ideas available", "Reuse ideas will appear here when they are available.", <Hammer />)}
        {savedProjects.length > 0 && <div className="rb-stack" style={{ marginTop: 18 }}>
          <div className="rb-panel-head"><h2>Saved project plans</h2><span>{savedProjects.length} saved</span></div>
          {savedProjects.map(saved => <div className="rb-material-row" key={saved.id}><span className="rb-material-symbol"><ClipboardList /></span><div className="rb-material-copy"><strong>{saved.reuse_projects?.title || "Saved reuse project"}</strong><span>{saved.status}{saved.notes ? ` · ${saved.notes}` : ""}</span></div></div>)}
        </div>}
      </section>}
    </>;
  };

  const renderAssistant = () => {
    const analyzedMaterial = materials.find(item => String(item.id) === selectedAnalysisMaterial) || materials[0];
    const materialGuidance = analyzedMaterial ? analyzeMaterial({
      name: analyzedMaterial.name,
      category: analyzedMaterial.category,
      description: analyzedMaterial.description,
      condition: analyzedMaterial.condition,
    }) : null;
    return <>
    {pageHeading()}
    {feedback}
    {pageError && <div className="rb-message error" role="alert"><CircleAlert />{pageError}<button className="rb-quiet-link" onClick={() => void loadData(active)}>Retry</button></div>}
    <div className="rb-assistant-layout" style={{ marginTop: 16 }}>
      <section className="rb-panel rb-assistant-guide">
        <div className="rb-panel-head"><div><span className="rb-kicker">Guidance from your records</span><h2>Start with what you have.</h2></div><span className="rb-tag">Rule-based</span></div>
        {loading ? renderLoading(2) : materials.length ? <>
          <Field label="Choose a saved material"><select value={analyzedMaterial ? String(analyzedMaterial.id) : ""} onChange={event => setSelectedAnalysisMaterial(event.target.value)}>{materials.map(item => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></Field>
          {materialGuidance && <div className="rb-analysis-card">
            <span className="rb-analysis-label">A possible next use</span>
            <h3>{materialGuidance.reuseIdeas[0]}</h3>
            <p>{materialGuidance.summary}</p>
            <div className="rb-analysis-details"><span>{analyzedMaterial?.category} · {analyzedMaterial?.condition || "condition not noted"}</span><span>{analyzedMaterial?.quantity ?? "—"} {analyzedMaterial?.unit || "units"} recorded</span></div>
            <div className="rb-message info"><ShieldCheck />{materialGuidance.safetyNote}</div>
          </div>}
        </> : empty("No saved materials to review", "Add stock to get guidance based on its recorded category and condition.", <Package />, <button className="rb-btn" onClick={() => navigate("materials")}><Plus />Add material</button>)}
        <p className="rb-chat-disclaimer">This is practical, rule-based text guidance using the details you entered. It is not a connected generative AI model, image recognition, or a safety assessment.</p>
      </section>
      <section className="rb-panel rb-chat"><div className="rb-panel-head"><div><span className="rb-kicker">Ask a question</span><h2>Think through a next step.</h2></div><span className="rb-tag">Text guidance</span></div>
        {!chatHistory.length ? <div className="rb-empty" style={{ marginBottom: 16 }}><span className="rb-empty-mark"><MessageSquareText /></span><strong>Start with what you know</strong><p>Ask about a category, a possible next use, or how to think through a handoff.</p></div> : <div className="rb-chat-history" aria-live="polite">{chatHistory.map((item, index) => <div className={`rb-chat-bubble ${item.role === "user" ? "user" : ""}`} key={`${index}-${item.role}`}>{item.text}</div>)}</div>}
        <form className="rb-chat-form" onSubmit={askAssistant}><input aria-label="Ask the material assistant" value={question} maxLength={1000} onChange={e => setQuestion(e.target.value)} placeholder="What could I do with clean timber offcuts?" /><button className="rb-btn" disabled={busy || !question.trim()} aria-label="Send question">{busy ? <span className="rb-busy" /> : <Send />}</button></form>
        <p className="rb-chat-disclaimer">Answers are simple rule-based guidance informed by your saved material details—not a live AI model or safety assessment. Check the details and use qualified advice where needed.</p>
      </section>
    </div>
  </>;
  };

  let content: React.ReactNode;
  if (active === "dashboard") content = renderDashboard();
  else if (active === "materials") content = renderMaterials();
  else if (active === "marketplace") content = renderMarketplace();
  else if (active === "requests") content = renderRequests();
  else if (active === "reuse" || active === "dispose") content = renderAction(active);
  else content = renderAssistant();

  return <div className="rb">{header}<main className="rb-shell rb-main" key={active}>{content}</main>{toast && <div className="rb-toast" role="status"><CheckCircle2 />{toast}</div>}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rb-field"><label>{label}{children}</label></div>;
}
