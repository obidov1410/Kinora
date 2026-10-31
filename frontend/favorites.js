import { fetchFavorites, getToken, getMe, removeFavorite } from "./api.js";
import { t, formatNumber } from "./i18n.js";
import {
  $,
  el,
  emptyState,
  errorState,
  icon,
  initShell,
  openAuthModal,
  posterCard,
  skeletonCards,
  toast,
} from "./ui.js";

initShell({ active: "favorites.html" });
const host = $("#favorites-content");
let items = [];
let loaded = false;
let requestSeq = 0;

function renderLoginGate() {
  host.replaceChildren();
  emptyState(host, {
    title: t("favorites_login_title"),
    text: t("favorites_login_hint"),
    actionLabel: t("sign_in"),
    onAction: () => openAuthModal({ message: t("favorites_login_hint"), onSuccess: () => load() }),
    iconName: "heart",
  });
}

function render() {
  if (!loaded) return;
  if (!items.length) {
    host.replaceChildren();
    emptyState(host, {
      title: t("favorites_empty"),
      text: t("favorites_empty_hint"),
      actionLabel: t("browse_catalog"),
      actionHref: "browse.html",
      iconName: "heart",
    });
    return;
  }
  const grid = el("div", { class: "poster-grid favorites-grid" });
  for (const item of items) {
    const card = posterCard(item);
    const remove = el(
      "button",
      {
        class: "favorite-remove",
        type: "button",
        attrs: { "aria-label": t("remove_favorite"), title: t("remove_favorite") },
        onclick: async () => {
          remove.disabled = true;
          try {
            await removeFavorite(item.id);
            items = items.filter((entry) => entry.id !== item.id);
            loaded = true;
            render();
            toast(t("favorite_removed"));
          } catch (error) {
            toast(error.message || t("error_generic"), "error");
            remove.disabled = false;
          }
        },
      },
      icon("heartFilled"),
    );
    const wrapper = el("div", { class: "favorite-card" }, card, remove);
    grid.append(wrapper);
  }
  const summary = el(
    "p",
    { class: "favorites-summary" },
    el("span", { text: t("results_count", { count: formatNumber(items.length) }) }),
  );
  host.replaceChildren(summary, grid);
}

async function load() {
  const seq = ++requestSeq;
  if (!getToken()) {
    loaded = false;
    renderLoginGate();
    return;
  }
  host.replaceChildren(el("div", { class: "poster-grid" }, ...skeletonCards(10)));
  try {
    const me = await getMe();
    if (!me) {
      if (seq === requestSeq) renderLoginGate();
      return;
    }
    const data = await fetchFavorites();
    if (seq !== requestSeq) return;
    items = Array.isArray(data) ? data : [];
    loaded = true;
    render();
  } catch (error) {
    if (seq !== requestSeq) return;
    if (error.status === 401 || error.status === 403) {
      if (!getToken()) renderLoginGate();
      else renderLoginGate();
    } else {
      errorState(host, error.message || t("error_generic"), () => load());
    }
  }
}

window.addEventListener("kinora:auth-changed", () => load());
window.addEventListener("kinora:auth-cleared", () => {
  items = [];
  loaded = false;
  renderLoginGate();
});
window.addEventListener("kinora:lang", () => {
  if (!loaded) renderLoginGate();
  else render();
});

load();
