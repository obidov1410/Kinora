import { fetchAds, fetchHome } from "./api.js";
import { t } from "./i18n.js";
import {
  adBanner,
  emptyState,
  errorState,
  initShell,
  openAuthModal,
  posterCard,
  skeletonCards,
  $,
} from "./ui.js";

const shell = initShell({ active: "index.html", overlay: true, showSearch: false });
const featuredHost = $("#landing-featured");
const adWrap = $("#landing-ad-wrap");
const adHost = $("#landing-ad");
const authButton = $("#landing-auth");
let cache = null;

function showSkeletons() {
  featuredHost.replaceChildren(...skeletonCards(7));
}

function renderFeatured(items) {
  if (!items?.length) {
    emptyState(featuredHost, {
      title: t("empty_catalog"),
      text: t("empty_catalog_hint"),
      actionLabel: t("footer_admin"),
      actionHref: "admin.html",
      iconName: "spark",
    });
    return;
  }
  featuredHost.replaceChildren(...items.map((item) => posterCard(item)));
}

async function loadFeatured({ silent = false } = {}) {
  if (!silent) showSkeletons();
  try {
    const data = await fetchHome();
    cache = data;
    renderFeatured((data.featured || []).slice(0, 7));
  } catch (error) {
    errorState(featuredHost, error.message, () => loadFeatured());
  }
}

async function loadAd() {
  try {
    const ads = await fetchAds("landing", 1);
    if (!ads.length) return;
    const node = adBanner(ads[0]);
    if (node) {
      adHost.replaceChildren(node);
      adWrap.hidden = false;
    }
  } catch {
    /* Landing remains usable without an ad. */
  }
}

authButton?.addEventListener("click", () => {
  if (shell?.me) {
    window.location.href = "profile.html";
    return;
  }
  openAuthModal();
});

window.addEventListener("kinora:me", (event) => {
  const label = authButton?.querySelector("[data-i18n]");
  if (!label) return;
  if (event.detail) {
    label.removeAttribute("data-i18n");
    label.textContent = t("nav_profile");
  } else {
    label.setAttribute("data-i18n", "landing_secondary");
    label.textContent = t("landing_secondary");
  }
});

window.addEventListener("kinora:lang", () => {
  if (cache) renderFeatured((cache.featured || []).slice(0, 7));
});

loadFeatured();
loadAd();
