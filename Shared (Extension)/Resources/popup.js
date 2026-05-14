// Reckond — toolbar popup (scores via background cache + API).

const actionApi = globalThis.chrome?.action ?? globalThis.browser?.action;
actionApi?.setBadgeText?.({ text: "" });
const isIOSPopup =
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
if (isIOSPopup) {
  document.body.classList.add("ios-popup");
}

function getGradeClass(grade) {
  const g = (grade || "F")[0].toUpperCase();
  if (g === "A") return "grade-a";
  if (g === "B") return "grade-b";
  if (g === "C") return "grade-c";
  if (g === "D") return "grade-d";
  if (g === "N") return "grade-na";
  return "grade-f";
}

function getVerdict(score) {
  if (score >= 70) return { text: "Strong Commitment", cls: "verdict-a" };
  if (score >= 55) return { text: "Moderate Progress", cls: "verdict-b" };
  if (score >= 40) return { text: "Below Average", cls: "verdict-c" };
  return { text: "Failing the Community", cls: "verdict-f" };
}

function getBarColor(pct) {
  if (pct >= 70) return "#4ade80";
  if (pct >= 50) return "#c96a3a";
  if (pct >= 30) return "#f97316";
  return "#ef4444";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeHttpUrl(value, fallback = "#") {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return fallback;
  } catch (_) {
    return fallback;
  }
}

async function fetchBrand(domain) {
  const timeoutMs = 20000;
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage({
        action: "getBrandScore",
        domain,
      }),
      new Promise((resolve) => {
        setTimeout(() => resolve({ ok: false, timeout: true }), timeoutMs);
      }),
    ]);
    if (!response?.ok) return undefined;
    return response.data;
  } catch (_) {
    return undefined;
  }
}

function renderLoading() {
  return `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <div class="loading-text">Looking up score…</div>
    </div>
  `;
}

function renderNotFound(domain) {
  return `
    <div class="not-found">
      <div class="not-found-icon">🔍</div>
      <div class="not-found-title">Not scored yet</div>
      <div class="not-found-sub">
        <strong>${escapeHtml(domain)}</strong> isn't in our index yet.<br/>
        Every brand has a record. Use “Score a Brand” to run it now.

      </div>
      <div style="margin-top:14px">
        <a href="https://officialblackwallstreet.com" target="_blank" rel="noopener noreferrer"
           style="font-size:0.85rem;color:#c96a3a;font-weight:600;text-decoration:none;">
          Browse Official Black Wall Street →
        </a>
      </div>
    </div>
  `;
}

function renderNetworkError(domain) {
  return `
    <div class="not-found">
      <div class="not-found-icon">⚠️</div>
      <div class="not-found-title">Connection issue</div>
      <div class="not-found-sub">
        We couldn't load a score for <strong>${escapeHtml(domain)}</strong> right now.<br/>
        Please try again in a few seconds.
      </div>
    </div>
  `;
}

function renderNoPageContext() {
  return `
    <div class="not-found">
      <div class="not-found-icon">ℹ️</div>
      <div class="not-found-title">No active webpage</div>
      <div class="not-found-sub">
        Open a regular website tab and try again.
      </div>
    </div>
  `;
}

function renderBrand(brand) {
  const overallScore = asNumber(brand.overallScore, 0);
  const isUnrated = Boolean(brand.isUnrated);
  const verdict = isUnrated
    ? { text: "Insufficient Data", cls: "verdict-c" }
    : getVerdict(overallScore);
  const gradeCls = isUnrated ? "grade-na" : getGradeClass(brand.grade);
  const estimated = Boolean(brand.isEstimated);
  const grade = isUnrated ? "N/A" : escapeHtml((brand.grade || "F").toString().slice(0, 2));
  const companyName = escapeHtml(brand.name || "");
  const industry = escapeHtml(brand.industry || "");
  const summary = escapeHtml(brand.summary || "");

  const dims = Array.isArray(brand.dimensions) ? brand.dimensions : [];
  const dimsHtml = dims
    .map((d) => {
      const label = (d.category || d.label || d.l || "").toString();
      const val = asNumber(
        d.score !== undefined
          ? d.score
          : d.value !== undefined
            ? d.value
            : d.v !== undefined
              ? d.v
              : 0,
        0,
      );
      const max = asNumber(
        d.maxScore !== undefined
          ? d.maxScore
          : d.maxValue !== undefined
            ? d.maxValue
            : d.m !== undefined
              ? d.m
              : 15,
        15,
      );
      const pct = max > 0 ? clamp(Math.round((val / max) * 100), 0, 100) : 0;
      const shortLabel = escapeHtml(
        label
          .replace("Workforce Diversity", "Workforce")
          .replace("Political Alignment", "Political")
          .replace("Crisis Response", "Crisis")
          .replace("Community Investment", "Community")
          .replace("Legal Record", "Legal")
          .replace("Supplier Diversity", "Suppliers")
          .replace("Black Spending", "Spending"),
      );
      return `
      <div class="dim-item">
        <span class="dim-label">${shortLabel}</span>
        <div class="dim-bar-bg">
          <div class="dim-bar-fill" style="width:${pct}%;background:${getBarColor(pct)}"></div>
        </div>
      </div>
    `;
    })
    .join("");

  const alts = Array.isArray(brand.alternatives) ? brand.alternatives : [];
  const altsHtml = alts
    .map((a) => {
      const name = escapeHtml(a.name || a.n || "");
      const desc = escapeHtml(a.description || a.d || "");
      const url = safeHttpUrl(a.url || a.u || "#");
      return `
      <a href="${url}" target="_blank" rel="noopener noreferrer" class="alt-item">
        <div>
          <div class="alt-name">${name}</div>
          <div class="alt-desc">${desc}</div>
        </div>
        <span class="alt-visit">Visit →</span>
      </a>
    `;
    })
    .join("");

  const estimatedBadge = estimated
    ? `<span class="estimated-badge" title="Score estimated from industry data — not yet fully pipeline-scored">EST</span>`
    : "";

  const sources = brand.sourcesData || {};
  let sourcesHtml = "";

  if (sources.naacp_advisory) {
    const naacp = sources.naacp_advisory;
    const committed = naacp.status === "recommitted";
    const naacpNote = escapeHtml(naacp.note || "");
    sourcesHtml += `
      <div class="source-badge ${committed ? "naacp-committed" : "naacp-retreated"}">
        <span class="source-icon">${committed ? "🛡" : "⚠️"}</span>
        <div class="source-content">
          <div class="source-label">
            NAACP Advisory
            <span class="source-pill ${committed ? "pill-committed" : "pill-retreated"}">
              ${committed ? "✓ DEI Committed" : "⚠ DEI Rollback"}
            </span>
          </div>
          <div class="source-note">${naacpNote}</div>
        </div>
      </div>
    `;
  }

  if (sources.asyousow) {
    const ays = sources.asyousow;
    const aysScore = clamp(asNumber(ays.score, 0), 0, 100);
    const aysSector = escapeHtml(ays.sector || "");
    const aysDataset = escapeHtml(ays.dataset || "");
    sourcesHtml += `
      <div class="source-badge ays">
        <span class="source-icon">📊</span>
        <div class="source-content">
          <div class="source-label">
            As You Sow Racial Justice
            <span class="source-pill pill-ays">${aysScore}/100</span>
          </div>
          <div class="source-note">${aysSector} · ${aysDataset}</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="score-section">
      <div class="score-ring ${gradeCls}">
        <span class="score-grade ${gradeCls.replace("grade-", "score-text-")}" style="font-size:${isUnrated ? "13px" : ""}">${grade}</span>
        ${isUnrated ? "" : `<span class="score-num">${overallScore}/100</span>`}
      </div>
      <div class="score-info">
        <div class="score-company">${companyName} ${estimatedBadge}</div>
        <div class="score-industry">${industry}</div>
        <div class="score-verdict ${verdict.cls}">${verdict.text}</div>
        <div class="score-summary">${summary}</div>
      </div>
    </div>
    ${
      dims.length > 0
        ? `
    <div class="dimensions">
      <div class="dim-title">Score Breakdown${estimated ? " <span style='font-size:9px;color:#888;font-weight:400'>(estimated)</span>" : ""}</div>
      <div class="dim-grid">${dimsHtml}</div>
    </div>
    `
        : ""
    }
    ${sourcesHtml ? `<div class="sources-section">${sourcesHtml}</div>` : ""}
    ${
      alts.length > 0
        ? `
    <div class="alts-section">
      <div class="alts-title">✊🏾 Black-Owned Alternatives</div>
      ${altsHtml}
    </div>
    `
        : ""
    }
  `;
}

chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  const content = document.getElementById("content");
  const domainBadge = document.getElementById("current-domain");
  if (!content) return;

  let domain = "";
  const url = tabs[0]?.url;

  if (url) {
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch (_) {
      domain = "";
    }
  }

  if (!domain) {
    try {
      const stored = await chrome.storage.local.get("lastPopupDomain");
      if (stored?.lastPopupDomain) {
        domain = String(stored.lastPopupDomain);
      }
    } catch (_) {}
  }

  if (!domain) {
    if (domainBadge) domainBadge.textContent = "unsupported";
    content.innerHTML = renderNoPageContext();
    return;
  }

  if (domainBadge) domainBadge.textContent = domain;

  content.innerHTML = renderLoading();

  const brand = await fetchBrand(domain);

  const FRONTEND_APP_URL = "https://reckond.com";

  const viewFullLink = document.getElementById("view-full");
  if (!viewFullLink) return;

  if (brand === undefined) {
    content.innerHTML = renderNetworkError(domain);
    viewFullLink.href = FRONTEND_APP_URL;
    viewFullLink.target = "_blank";
    viewFullLink.rel = "noopener noreferrer";
    viewFullLink.title = "Open Reckond";
    return;
  }

  if (brand === null) {
    content.innerHTML = renderNotFound(domain);
    viewFullLink.href = FRONTEND_APP_URL;
    viewFullLink.target = "_blank";
    viewFullLink.rel = "noopener noreferrer";
    viewFullLink.title = "View full scorecard";
    return;
  }

  content.innerHTML = renderBrand(brand);
  const footerLinkEl = document.querySelector(".footer-link");
  const breakdownOrScore =
    content.querySelector(".dimensions") || content.querySelector(".score-section");
  if (footerLinkEl && breakdownOrScore) {
    breakdownOrScore.insertAdjacentElement("afterend", footerLinkEl);
  }
  viewFullLink.href = `${FRONTEND_APP_URL}/#/brand/${brand.id}`;
  viewFullLink.target = "_blank";
  viewFullLink.rel = "noopener noreferrer";
  viewFullLink.title = "View full scorecard";

  const methodSection = document.getElementById("methodology-section");
  if (methodSection) methodSection.style.display = "block";

  const methodLink = document.getElementById("methodology-full-link");
  if (methodLink) {
    methodLink.href = `${FRONTEND_APP_URL}/#/methodology`;
    methodLink.rel = "noopener noreferrer";
  }

  const challengeLink = document.getElementById("challenge-link");
  if (challengeLink) {
    challengeLink.href = `${FRONTEND_APP_URL}/#/brand/${brand.id}`;
    challengeLink.target = "_blank";
    challengeLink.rel = "noopener noreferrer";
    challengeLink.title = "Submit a factual correction or update request";
  }

  const footerLegal = document.getElementById("footer-legal");
  const footerDate = document.getElementById("footer-date");
  if (footerLegal && footerDate) {
    footerDate.textContent = brand.lastUpdated || "recent review";
    footerLegal.style.display = "block";
  }

  const toggle = document.getElementById("methodology-toggle");
  const body = document.getElementById("methodology-body");
  const icon = document.getElementById("methodology-icon");
  if (toggle && body && icon) {
    toggle.addEventListener("click", () => {
      const open = body.classList.toggle("open");
      icon.classList.toggle("open", open);
    });
  }
});
