const BACKEND_API_BASE = "https://reckond-backend-production.up.railway.app";
const FRONTEND_APP_BASE = "https://reckond.com";
const API_URL = `${BACKEND_API_BASE}/api/brands/domain`;
const CACHE_PREFIX = "brandScore:";
const CACHE_TTL_MS = 1000 * 60 * 30;
const LAST_DOMAIN_KEY = "lastPopupDomain";
const RECKOND_GRADE_HEX = {
  A: "#3A7D52",
  B: "#5A8A2E",
  C: "#C4841A",
  D: "#C4601A",
  F: "#B83030",
  N: "#7A5C45",
};

const memoryCache = new Map();

const actionApi = globalThis.chrome?.action ?? globalThis.browser?.action;

function badgeBackgroundColorForGrade(grade) {
  const letter = String(grade ?? "")
    .trim()
    .charAt(0)
    .toUpperCase();
  return RECKOND_GRADE_HEX[letter] ?? RECKOND_GRADE_HEX.C;
}

function applyValidScoreBadge(brand) {
  if (!brand || typeof brand !== "object") return;
  const text = String(brand.grade != null ? brand.grade : "•")
    .trim()
    .slice(0, 4);
  actionApi?.setBadgeBackgroundColor?.({
    color: badgeBackgroundColorForGrade(brand.grade),
  });
  actionApi?.setBadgeText?.({ text: text || "•" });
}

function clearScoreBadge() {
  actionApi?.setBadgeText?.({ text: "" });
}

function normalizeDomain(domain) {
  return String(domain || "").trim().toLowerCase();
}

function makeCacheKey(domain) {
  return `${CACHE_PREFIX}${normalizeDomain(domain)}`;
}

function toStoredEntry(data) {
  if (data === null) {
    return { status: "not_found", fetchedAt: Date.now(), data: null };
  }
  return { status: "ok", fetchedAt: Date.now(), data };
}

function toBrandModel(data) {
  if (!data) return null;
  return {
    ...data,
    score: data.overallScore,
    color: data.gradeColor,
  };
}

function isFresh(entry) {
  if (!entry || !entry.fetchedAt) return false;
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

async function readCache(domain) {
  const key = makeCacheKey(domain);
  const inMemory = memoryCache.get(key);
  if (isFresh(inMemory)) {
    return inMemory;
  }

  try {
    const stored = await chrome.storage.local.get(key);
    const entry = stored?.[key];
    if (isFresh(entry)) {
      memoryCache.set(key, entry);
      return entry;
    }
  } catch (_) {
    // Ignore storage errors and continue to network.
  }
  return null;
}

async function writeCache(domain, data) {
  const key = makeCacheKey(domain);
  const entry = toStoredEntry(data);
  memoryCache.set(key, entry);
  try {
    await chrome.storage.local.set({ [key]: entry });
  } catch (_) {
    // Ignore storage write failures.
  }
}

async function fetchBrandFromApi(domain) {
  try {
    const res = await fetch(`${API_URL}/${encodeURIComponent(domain)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    return await res.json();
  } catch (_) {
    return undefined;
  }
}

async function fetchBrandScore(domain) {
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) return null;

  const cached = await readCache(normalizedDomain);
  if (cached) {
    return cached.status === "not_found" ? null : toBrandModel(cached.data);
  }

  const data = await fetchBrandFromApi(normalizedDomain);
  if (data === undefined) {
    return undefined;
  }

  await writeCache(normalizedDomain, data);
  return toBrandModel(data);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "openBrandPage") {
    const domain = normalizeDomain(message.domain);
    if (domain) {
      chrome.storage.local.set({ [LAST_DOMAIN_KEY]: domain }).catch(() => {});
    }
    const brandId = String(message.brandId || "").trim();
    const destination = brandId
      ? `${FRONTEND_APP_BASE}/#/brand/${encodeURIComponent(brandId)}`
      : FRONTEND_APP_BASE;
    chrome.tabs.create({ url: destination }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.action === "getBrandScore") {
    const domain = message.domain;
    fetchBrandScore(domain)
      .then((data) => {
        if (data === undefined) {
          clearScoreBadge();
          sendResponse({ ok: false, error: "network" });
          return;
        }
        if (data && typeof data === "object") {
          applyValidScoreBadge(data);
        } else {
          clearScoreBadge();
        }
        sendResponse({ ok: true, data });
      })
      .catch((error) => {
        clearScoreBadge();
        sendResponse({ ok: false, error: String(error) });
      });
    return true;
  }

  return false;
});
