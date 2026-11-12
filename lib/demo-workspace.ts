import { analyzeMaterial, answerAssistant } from "@/lib/analysis";

export type DemoUser = {
  id: string;
  email: string;
  display_name: string;
};

type DemoMaterial = {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  condition: string;
  approximate_location: string;
  status: string;
  created_at: string;
  imageUrl: string | null;
};

type DemoListing = {
  id: string;
  material_id: string;
  seller_id: string;
  asking_price: number;
  fulfillment: string[];
  status: string;
  created_at: string;
};

type DemoRequest = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  message: string;
  fulfillment: string;
  status: "requested" | "accepted" | "declined" | "completed";
  buyer_completed_at: string | null;
  seller_completed_at: string | null;
  created_at: string;
};

type DemoAction = {
  id: string;
  owner_id: string;
  material_id: string;
  type: "reuse" | "disposal";
  status: "planned" | "completed";
  notes: string;
  disposal_category?: string;
  created_at: string;
  completed_at: string | null;
};

type DemoProject = {
  id: string;
  title: string;
  description: string;
  categories: string[];
  requirements: Array<Record<string, string | number>>;
};

type SavedProject = {
  id: string;
  owner_id: string;
  project_id: string;
  material_id: string | null;
  status: string;
  notes: string;
  created_at: string;
  completed_at: string | null;
};

type DemoState = {
  users: DemoUser[];
  materials: DemoMaterial[];
  listings: DemoListing[];
  requests: DemoRequest[];
  actions: DemoAction[];
  projects: DemoProject[];
  savedProjects: SavedProject[];
};

const dataKey = "rebuild-local-demo-v1";
const sessionKey = "rebuild-local-demo-session";

const defaultProjects: DemoProject[] = [
  {
    id: "project-shelving",
    title: "Workshop shelving",
    description: "Use suitable timber offcuts to make non-structural storage shelves.",
    categories: ["wood", "construction"],
    requirements: [{ material: "wood", minimum_quantity: 4, unit: "pieces" }],
  },
  {
    id: "project-electronics-kit",
    title: "Electronics learning kit",
    description: "Build a supervised learning kit from inspected, low-voltage components.",
    categories: ["electronics", "electrical"],
    requirements: [{ material: "electronics", minimum_quantity: 3, unit: "components" }],
  },
  {
    id: "project-planters",
    title: "Community planter boxes",
    description: "Turn clean, suitable wood into simple planter boxes for a shared space.",
    categories: ["wood", "construction"],
    requirements: [{ material: "wood", minimum_quantity: 3, unit: "pieces" }],
  },
  {
    id: "project-sorting-trays",
    title: "Workshop sorting trays",
    description: "Reuse suitable plastics or sheet offcuts to organize small parts.",
    categories: ["plastics", "wood", "construction"],
    requirements: [{ material: "plastics", minimum_quantity: 2, unit: "pieces" }],
  },
];

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createSeed(): DemoState {
  const now = new Date().toISOString();
  const seller: DemoUser = { id: "demo-seller", email: "seller@demo.local", display_name: "Maya · Demo seller" };
  const buyer: DemoUser = { id: "demo-buyer", email: "buyer@demo.local", display_name: "Omar · Demo buyer" };
  const material: DemoMaterial = {
    id: "demo-material-wood",
    owner_id: seller.id,
    name: "Birch plywood offcuts",
    category: "wood",
    description: "Clean, dry workshop offcuts. Check dimensions and condition before collection.",
    quantity: 12,
    unit: "sheets",
    condition: "good",
    approximate_location: "Riyadh workshop area",
    status: "available",
    created_at: now,
    imageUrl: null,
  };
  return {
    users: [seller, buyer],
    materials: [material],
    listings: [{
      id: "demo-listing-wood",
      material_id: material.id,
      seller_id: seller.id,
      asking_price: 0,
      fulfillment: ["pickup"],
      status: "active",
      created_at: now,
    }],
    requests: [],
    actions: [],
    projects: defaultProjects,
    savedProjects: [],
  };
}

function persist(state: DemoState) {
  try {
    window.localStorage.setItem(dataKey, JSON.stringify(state));
  } catch {
    throw new Error("Browser storage is full or unavailable. Remove a large photo or clear this demo’s site data and try again.");
  }
}

function readState(): DemoState {
  if (typeof window === "undefined") throw new Error("The local demo is only available in a browser.");
  let saved: string | null;
  try {
    saved = window.localStorage.getItem(dataKey);
  } catch {
    throw new Error("Browser storage is unavailable. Enable site storage to use the local demo.");
  }
  if (!saved) {
    const seeded = createSeed();
    persist(seeded);
    return seeded;
  }
  try {
    const parsed = JSON.parse(saved) as DemoState;
    if (
      !Array.isArray(parsed.users) ||
      !Array.isArray(parsed.materials) ||
      !Array.isArray(parsed.listings) ||
      !Array.isArray(parsed.requests) ||
      !Array.isArray(parsed.actions) ||
      !Array.isArray(parsed.projects) ||
      !Array.isArray(parsed.savedProjects)
    ) throw new Error();
    return parsed;
  } catch {
    throw new Error("The saved local demo data could not be read. Clear this site’s local storage to start a fresh demo.");
  }
}

function currentUser(state: DemoState): DemoUser | null {
  const id = window.localStorage.getItem(sessionKey);
  return state.users.find((user) => user.id === id) ?? null;
}

function requireUser(state = readState()): DemoUser {
  const user = currentUser(state);
  if (!user) throw new Error("Choose a local demo account to continue.");
  return user;
}

export function getDemoUsers() {
  return readState().users;
}

export function getDemoSession() {
  const state = readState();
  return currentUser(state);
}

export function setDemoSession(userId: string) {
  const state = readState();
  if (!state.users.some((user) => user.id === userId)) throw new Error("That local demo account is unavailable.");
  window.localStorage.setItem(sessionKey, userId);
}

export function signOutDemo() {
  window.localStorage.removeItem(sessionKey);
}

export function loginDemo(email: string) {
  const state = readState();
  const normalized = email.trim().toLowerCase();
  const user = state.users.find((item) => item.email.toLowerCase() === normalized);
  if (!user) throw new Error("No local workspace uses that email. Choose a demo account or create a local workspace.");
  window.localStorage.setItem(sessionKey, user.id);
  return user;
}

export function loginDemoAs(userId: string) {
  const state = readState();
  const user = state.users.find((item) => item.id === userId);
  if (!user) throw new Error("That local demo account is unavailable.");
  window.localStorage.setItem(sessionKey, user.id);
  return user;
}

export function createDemoAccount(displayName: string, email: string) {
  const state = readState();
  const normalized = email.trim().toLowerCase();
  const name = displayName.trim().slice(0, 80);
  if (!name) throw new Error("Enter a name for this local workspace.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Enter a valid email address.");
  if (state.users.some((user) => user.email.toLowerCase() === normalized)) {
    throw new Error("A local workspace already uses that email. Sign in instead.");
  }
  const user: DemoUser = { id: newId(), email: normalized, display_name: name };
  state.users.push(user);
  persist(state);
  window.localStorage.setItem(sessionKey, user.id);
  return user;
}

function materialView(state: DemoState, id: string) {
  const material = state.materials.find((item) => item.id === id);
  return material ?? null;
}

function listingView(state: DemoState, listing: DemoListing, viewerId: string) {
  const material = materialView(state, listing.material_id);
  const seller = state.users.find((user) => user.id === listing.seller_id);
  return {
    ...listing,
    fulfillment: listing.fulfillment.join(", "),
    isOwn: listing.seller_id === viewerId,
    material: material ? { ...material } : undefined,
    seller: seller ? { display_name: seller.display_name } : { display_name: "Workspace member" },
  };
}

function requestView(state: DemoState, request: DemoRequest, viewerId: string) {
  const listing = state.listings.find((item) => item.id === request.listing_id);
  const buyer = state.users.find((user) => user.id === request.buyer_id);
  const seller = state.users.find((user) => user.id === request.seller_id);
  const material = listing ? materialView(state, listing.material_id) : null;
  return {
    ...request,
    buyer: buyer ? { display_name: buyer.display_name } : { display_name: "Workspace member" },
    seller: seller ? { display_name: seller.display_name } : { display_name: "Workspace member" },
    buyer_completed: Boolean(request.buyer_completed_at),
    seller_completed: Boolean(request.seller_completed_at),
    completion_confirmed: request.buyer_id === viewerId
      ? Boolean(request.buyer_completed_at)
      : request.seller_id === viewerId && Boolean(request.seller_completed_at),
    listing: listing ? {
      id: listing.id,
      material_id: listing.material_id,
      seller_id: listing.seller_id,
      asking_price: listing.asking_price,
      status: listing.status,
      fulfillment: listing.fulfillment.join(", "),
      material: material ?? undefined,
    } : undefined,
  };
}

export function loadDemoWorkspace() {
  const state = readState();
  const user = requireUser(state);
  const ownMaterials = state.materials.filter((item) => item.owner_id === user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const ownListings = state.listings.filter((item) => item.seller_id === user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const visibleListings = state.listings.filter((item) => item.status === "active").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const ownRequests = state.requests
    .filter((item) => item.buyer_id === user.id || item.seller_id === user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const ownActions = state.actions.filter((item) => item.owner_id === user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const ownSavedProjects = state.savedProjects
    .filter((item) => item.owner_id === user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((saved) => ({
      ...saved,
      reuse_projects: { title: state.projects.find((project) => project.id === saved.project_id)?.title },
    }));

  return {
    user,
    users: state.users,
    materials: ownMaterials,
    listings: visibleListings.map((item) => listingView(state, item, user.id)),
    myListings: ownListings.map((item) => listingView(state, item, user.id)),
    requests: ownRequests.map((item) => requestView(state, item, user.id)),
    actions: ownActions.map((item) => ({
      ...item,
      material_name: materialView(state, item.material_id)?.name,
    })),
    projects: state.projects,
    savedProjects: ownSavedProjects,
    summary: {
      materials: ownMaterials.length,
      activeListings: ownListings.filter((item) => item.status === "active").length,
      completedSales: ownListings.filter((item) => item.status === "sold").length,
      plannedReuse: ownActions.filter((item) => item.type === "reuse" && item.status === "planned").length,
      completedReuse: ownActions.filter((item) => item.type === "reuse" && item.status === "completed").length,
      plannedDisposal: ownActions.filter((item) => item.type === "disposal" && item.status === "planned").length,
      completedDisposal: ownActions.filter((item) => item.type === "disposal" && item.status === "completed").length,
      incomingRequests: ownRequests.filter((item) => item.seller_id === user.id && ["requested", "accepted"].includes(item.status)).length,
    },
  };
}

function createMaterial(payload: Record<string, unknown>) {
  const state = readState();
  const user = requireUser(state);
  const name = String(payload.name ?? "").trim();
  const category = String(payload.category ?? "");
  const quantity = Number(payload.quantity);
  const unit = String(payload.unit ?? "").trim();
  const allowedCategories = ["construction", "wood", "metal", "plastics", "electrical", "electronics", "mechanical", "chemicals", "other"];
  if (name.length < 2 || name.length > 100) throw new Error("Material names must be between 2 and 100 characters.");
  if (!allowedCategories.includes(category)) throw new Error("Choose a valid material category.");
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000) throw new Error("Enter a quantity greater than zero.");
  if (!unit || unit.length > 24) throw new Error("Enter a unit such as sheets or kg.");
  const material: DemoMaterial = {
    id: newId(),
    owner_id: user.id,
    name,
    category,
    description: String(payload.description ?? "").trim().slice(0, 1000),
    quantity,
    unit,
    condition: String(payload.condition ?? "unknown"),
    approximate_location: String(payload.location ?? "").trim().slice(0, 120),
    status: "available",
    created_at: new Date().toISOString(),
    imageUrl: typeof payload.imageDataUrl === "string" ? payload.imageDataUrl : null,
  };
  state.materials.unshift(material);
  persist(state);
  return { material, analysis: analyzeMaterial(material) };
}

function createListing(payload: Record<string, unknown>) {
  const state = readState();
  const user = requireUser(state);
  const materialId = String(payload.materialId ?? "");
  const material = state.materials.find((item) => item.id === materialId && item.owner_id === user.id);
  if (!material) throw new Error("You can only list your own material.");
  const price = Number(payload.askingPrice ?? 0);
  const fulfillment = Array.isArray(payload.fulfillment) ? payload.fulfillment.map(String) : [];
  if (!Number.isFinite(price) || price < 0) throw new Error("Enter a valid asking amount.");
  if (!fulfillment.length || fulfillment.some((item) => !["pickup", "shipping"].includes(item))) {
    throw new Error("Choose a valid fulfillment option.");
  }
  if (state.listings.some((item) => item.material_id === materialId && ["active", "paused"].includes(item.status))) {
    throw new Error("This material already has an open listing.");
  }
  const listing: DemoListing = {
    id: newId(),
    material_id: materialId,
    seller_id: user.id,
    asking_price: price,
    fulfillment,
    status: "active",
    created_at: new Date().toISOString(),
  };
  state.listings.unshift(listing);
  persist(state);
  return { listing: { id: listing.id, status: listing.status } };
}

function createRequest(payload: Record<string, unknown>) {
  const state = readState();
  const user = requireUser(state);
  const listing = state.listings.find((item) => item.id === String(payload.listingId ?? ""));
  const message = String(payload.message ?? "").trim();
  const fulfillment = String(payload.fulfillment ?? "");
  if (!listing || listing.status !== "active") throw new Error("This listing is no longer available.");
  if (listing.seller_id === user.id) throw new Error("You cannot request your own listing.");
  if (!listing.fulfillment.includes(fulfillment)) throw new Error("That fulfillment option is not available.");
  if (message.length < 5 || message.length > 800) throw new Error("Add a message between 5 and 800 characters.");
  const request: DemoRequest = {
    id: newId(),
    listing_id: listing.id,
    buyer_id: user.id,
    seller_id: listing.seller_id,
    message,
    fulfillment,
    status: "requested",
    buyer_completed_at: null,
    seller_completed_at: null,
    created_at: new Date().toISOString(),
  };
  state.requests.unshift(request);
  persist(state);
  return { request: { id: request.id, status: request.status }, message: "Request sent. The listing stays active until both sides confirm the handoff." };
}

function updateRequest(id: string, payload: Record<string, unknown>) {
  const state = readState();
  const user = requireUser(state);
  const request = state.requests.find((item) => item.id === id);
  if (!request) throw new Error("Order request not found.");
  if (payload.status === "accepted" || payload.status === "declined") {
    if (request.seller_id !== user.id || request.status !== "requested") throw new Error("Only the seller can accept or decline a new request.");
    if (payload.status === "accepted" && state.requests.some((item) =>
      item.id !== request.id && item.listing_id === request.listing_id && ["accepted", "completed"].includes(item.status),
    )) throw new Error("Another request already has this listing. A listing can have only one accepted handoff.");
    request.status = payload.status;
  } else if (payload.confirmComplete === true) {
    if (request.status !== "accepted" && request.status !== "completed") {
      throw new Error("The seller must accept the request before either side can confirm completion.");
    }
    if (request.buyer_id !== user.id && request.seller_id !== user.id) throw new Error("Only the buyer or seller can confirm completion.");
    const timestamp = new Date().toISOString();
    if (request.buyer_id === user.id) {
      if (request.buyer_completed_at) throw new Error("Your completion is already confirmed.");
      request.buyer_completed_at = timestamp;
    } else {
      if (request.seller_completed_at) throw new Error("Your completion is already confirmed.");
      request.seller_completed_at = timestamp;
    }
    if (request.buyer_completed_at && request.seller_completed_at) {
      request.status = "completed";
      const listing = state.listings.find((item) => item.id === request.listing_id);
      if (listing) listing.status = "sold";
    }
  } else {
    throw new Error("Choose a valid request update.");
  }
  persist(state);
  return { request: { id: request.id, status: request.status }, message: request.status === "completed" ? "Both sides confirmed completion." : "Request updated." };
}

function createAction(payload: Record<string, unknown>) {
  const state = readState();
  const user = requireUser(state);
  const material = state.materials.find((item) => item.id === String(payload.materialId ?? "") && item.owner_id === user.id);
  if (!material) throw new Error("Choose one of your own materials.");
  const type = payload.type === "reuse" ? "reuse" : payload.type === "disposal" ? "disposal" : null;
  if (!type) throw new Error("Choose reuse or disposal.");
  const status = payload.status === "completed" ? "completed" : "planned";
  const action: DemoAction = {
    id: newId(),
    owner_id: user.id,
    material_id: material.id,
    type,
    status,
    notes: String(payload.notes ?? "").trim().slice(0, 1200),
    disposal_category: type === "disposal" ? String(payload.disposalCategory ?? "other") : undefined,
    created_at: new Date().toISOString(),
    completed_at: status === "completed" ? new Date().toISOString() : null,
  };
  state.actions.unshift(action);
  persist(state);
  return { action };
}

function updateAction(id: string) {
  const state = readState();
  const user = requireUser(state);
  const action = state.actions.find((item) => item.id === id && item.owner_id === user.id && item.status === "planned");
  if (!action) throw new Error("Activity not found or already completed.");
  action.status = "completed";
  action.completed_at = new Date().toISOString();
  persist(state);
  return { action: { id: action.id, status: action.status, completed_at: action.completed_at } };
}

function updateListing(id: string, payload: Record<string, unknown>) {
  const state = readState();
  const user = requireUser(state);
  const listing = state.listings.find((item) => item.id === id);
  if (!listing) throw new Error("Listing not found.");
  if (listing.seller_id !== user.id) throw new Error("You can only update your own listing.");
  if (listing.status === "sold") throw new Error("A completed sale cannot be reopened or edited.");
  if (payload.status !== undefined) {
    if (!["active", "paused", "closed"].includes(String(payload.status))) throw new Error("Choose a valid listing status.");
    listing.status = String(payload.status);
  }
  if (payload.askingPrice !== undefined) {
    const price = Number(payload.askingPrice);
    if (!Number.isFinite(price) || price < 0) throw new Error("Enter a valid asking amount.");
    listing.asking_price = price;
  }
  if (payload.fulfillment !== undefined) {
    const fulfillment = Array.isArray(payload.fulfillment) ? payload.fulfillment.map(String) : [];
    if (!fulfillment.length || fulfillment.some((item) => !["pickup", "shipping"].includes(item))) throw new Error("Choose a valid fulfillment option.");
    listing.fulfillment = fulfillment;
  }
  persist(state);
  return { listing: { id: listing.id, status: listing.status, asking_price: listing.asking_price, fulfillment: listing.fulfillment } };
}

function saveProject(payload: Record<string, unknown>) {
  const state = readState();
  const user = requireUser(state);
  const project = state.projects.find((item) => item.id === String(payload.projectId ?? ""));
  if (!project) throw new Error("Choose a valid reuse project.");
  const materialId = payload.materialId ? String(payload.materialId) : null;
  if (materialId && !state.materials.some((item) => item.id === materialId && item.owner_id === user.id)) {
    throw new Error("Choose one of your own materials.");
  }
  const saved: SavedProject = {
    id: newId(),
    owner_id: user.id,
    project_id: project.id,
    material_id: materialId,
    status: payload.status === "completed" ? "completed" : "planned",
    notes: String(payload.notes ?? "").trim().slice(0, 1000),
    created_at: new Date().toISOString(),
    completed_at: payload.status === "completed" ? new Date().toISOString() : null,
  };
  state.savedProjects.unshift(saved);
  persist(state);
  return { savedProject: saved };
}

export function demoApiRequest(url: string, method: "POST" | "PATCH", payload: Record<string, unknown>) {
  const path = new URL(url, window.location.origin).pathname;
  if (method === "POST") {
    if (path === "/api/materials") return createMaterial(payload);
    if (path === "/api/listings") return createListing(payload);
    if (path === "/api/requests") return createRequest(payload);
    if (path === "/api/actions") return createAction(payload);
    if (path === "/api/projects") return saveProject(payload);
    if (path === "/api/assistant") {
      const state = readState();
      const user = requireUser(state);
      const own = state.materials.filter((item) => item.owner_id === user.id);
      return { answer: answerAssistant(String(payload.question ?? ""), own), method: "rule_based" };
    }
  }
  if (method === "PATCH" && path.startsWith("/api/actions/")) return updateAction(decodeURIComponent(path.slice("/api/actions/".length)));
  if (method === "PATCH" && path.startsWith("/api/listings/")) return updateListing(decodeURIComponent(path.slice("/api/listings/".length)), payload);
  if (method === "PATCH" && path.startsWith("/api/requests/")) return updateRequest(decodeURIComponent(path.slice("/api/requests/".length)), payload);
  throw new Error("That action is not available in the local demo.");
}
