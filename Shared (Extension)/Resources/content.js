// Reckond — content script: floating score badge (data from background).

const scoreCache = new Map();

function getCurrentDomain() {
  return location.hostname.replace(/^www\./, "");
}

function safeColor(input) {
  const value = String(input || "").trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return value;
  if (/^rgba?\(\s*[\d.\s,%]+\)$/i.test(value)) return value;
  if (/^hsla?\(\s*[\d.\s,%]+\)$/i.test(value)) return value;
  return "#c96a3a";
}

async function fetchBrandScore(domain) {
  if (scoreCache.has(domain)) {
    return scoreCache.get(domain);
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: "getBrandScore",
      domain,
    });
    if (!response?.ok) {
      return null;
    }
    const brand = response.data ?? null;
    scoreCache.set(domain, brand);
    return brand;
  } catch (_) {
    return null;
  }
}

function injectBadge(data, domain) {
  if (document.getElementById("reckond-badge")) return;

  const borderColor = safeColor(data.color);
  const badge = document.createElement("div");
  badge.id = "reckond-badge";
  badge.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    background: #0d0d0d;
    border: 2px solid ${borderColor};
    border-radius: 12px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    font-family: system-ui, -apple-system, sans-serif;
    transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.3s ease;
    max-width: 240px;
  `;
  let hideTimeout = null;

  const dismissBadge = () => {
    if (!badge.isConnected) return;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    badge.style.opacity = "0";
    badge.style.transform = "translateY(8px)";
    badge.style.pointerEvents = "none";
    setTimeout(() => {
      badge.remove();
    }, 100);
  };

  const estimatedIndicator = data.isEstimated
    ? (() => {
        const est = document.createElement("span");
        est.style.cssText =
          "font-size:7px;color:#888;background:#222;padding:1px 4px;border-radius:3px;margin-left:4px;";
        est.textContent = "EST";
        return est;
      })()
    : null;

  const ring = document.createElement("div");
  ring.style.cssText = `
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 3px solid ${borderColor};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  `;

  const grade = document.createElement("span");
  grade.style.cssText = `font-size:1.25rem;font-weight:900;color:${borderColor};line-height:1;`;
  grade.textContent = String(data.grade || "F").slice(0, 2);

  const score = document.createElement("span");
  score.style.cssText = `font-size:0.75rem;color:${borderColor};opacity:0.7;line-height:1;`;
  score.textContent = String(data.score ?? "");

  ring.appendChild(grade);
  ring.appendChild(score);

  const textWrap = document.createElement("div");
  const title = document.createElement("div");
  title.style.cssText =
    "font-size:0.85rem;font-weight:700;color:#e8e5de;line-height:1.2;";
  title.textContent = "Black Commitment";
  if (estimatedIndicator) title.appendChild(estimatedIndicator);

  const subtitle = document.createElement("div");
  subtitle.style.cssText =
    "font-size:0.75rem;color:#888;margin-top:2px;line-height:1.3;";
  subtitle.textContent = `${String(data.name || "Brand")} · Click for details`;

  textWrap.appendChild(title);
  textWrap.appendChild(subtitle);

  const closeBtn = document.createElement("button");
  closeBtn.id = "reckond-badge-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Dismiss Reckond badge");
  closeBtn.style.cssText = `
    position:absolute;top:4px;right:4px;
    background:none;border:none;color:#555;
    cursor:pointer;font-size:12px;line-height:1;padding:2px;
  `;
  closeBtn.textContent = "×";

  badge.appendChild(ring);
  badge.appendChild(textWrap);
  badge.appendChild(closeBtn);

  badge.addEventListener("mouseenter", () => {
    badge.style.transform = "translateY(-2px)";
    badge.style.boxShadow = "0 8px 32px rgba(0,0,0,0.6)";
  });
  badge.addEventListener("mouseleave", () => {
    badge.style.transform = "translateY(0)";
    badge.style.boxShadow = "0 4px 24px rgba(0,0,0,0.5)";
  });

  badge.addEventListener("click", (e) => {
    if (e.target.closest("#reckond-badge-close")) {
      dismissBadge();
      return;
    }
    chrome.runtime.sendMessage({ action: "openBrandPage", brandId: data.id, domain });
  });

  document.body.appendChild(badge);
  hideTimeout = setTimeout(dismissBadge, 10000);
}

async function init() {
  const domain = getCurrentDomain();
  const data = await fetchBrandScore(domain);
  if (data) {
    injectBadge(data, domain);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
