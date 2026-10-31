import { fetchAds, fetchCatalog, request } from "./api.js";
import { t, formatNumber } from "./i18n.js";
import {
  adBanner,
  el,
  emptyState,
  errorState,
  genreChips,
  initShell,
  posterGrid,
  skeletonCards,
  $,
} from "./ui.js";

const kind = document.body.dataset.kind === "series" ? "series" : "movie";
const pageName = kind === "series" ? "series.html" : "movies.html";
initShell({ active: pageName });

const params = new URLSearchParams(window.location.search);
const SORTS = ["newest", "popular", "year", "title"];
const state = {
  genre: params.get("genre") || "",
  sort: SORTS.includes(params.get("sort")) ? params.get("sort") : "newest",
  page: 1,
  pages: 1,
  total: 0,
  items: [],
  genres: [],
  loaded: false,
};
let requestSeq = 0;

const chipsHost = $("#genre-chips");
const gridHost = $("#catalog-grid");
const resultLine = $("#result-line");
const moreWrap = $("#more-wrap");
const loadMore = $("#load-more");
const sortSelect = $("#sort-select");

sortSelect.value = state.sort;

function syncUrl() {
  const next = new URLSearchParams();
  if (state.genre) next.set("genre", state.genre);
  if (state.sort !== "newest") next.set("sort", state.sort);
  const suffix = next.toString();
  history.replaceState({}, "", `${pageName}${suffix ? `?${suffix}` : ""}`);
}

function renderChips() {
  if (!state.genres.length) {
    chipsHost.replaceChildren();
    return;
  }
  chipsHost.replaceChildren(
    genreChips(state.genres, state.genre, (genre) => {
      if (state.genre === genre) return;
      state.genre = genre;
      syncUrl();
      load(1);
    }),
  );
}

function renderCount() {
  if (!state.loaded) {
    resultLine.replaceChildren(el("span", { text: t("loading_catalog") }));
    return;
  }
  const parts = [el("span", { text: t("results_count", { count: formatNumber(state.total) }) })];
  if (state.genre) parts.push(el("span", { class: "badge badge--muted", text: t(`genre_${state.genre}`) }));
  resultLine.replaceChildren(...parts);
}

function renderGrid() {
  if (!state.loaded) return;
  if (!state.items.length) {
    const filtered = Boolean(state.genre);
    emptyState(gridHost, {
      title: filtered ? t("no_results") : t("empty_catalog"),
      text: filtered ? t("no_results_hint") : t("empty_catalog_hint"),
      actionLabel: filtered ? t("clear_filters") : t("browse_catalog"),
      onAction: filtered
        ? () => {
            state.genre = "";
            syncUrl();
            load(1);
          }
        : undefined,
      actionHref: filtered ? undefined : "browse.html",
      iconName: "spark",
    });
    moreWrap.hidden = true;
    return;
  }
  gridHost.replaceChildren(posterGrid(state.items));
  moreWrap.hidden = state.page >= state.pages;
}

function showLoading() {
  gridHost.replaceChildren(el("div", { class: "poster-grid" }, ...skeletonCards(12)));
  resultLine.replaceChildren(el("span", { text: t("loading") }));
  moreWrap.hidden = true;
}

async function loadGenres() {
  try {
    const genres = await request("/api/genres");
    state.genres = Array.isArray(genres) ? genres : [];
  } catch {
    state.genres = [];
  }
  renderChips();
}

async function loadAd() {
  try {
    const ads = await fetchAds("catalog_banner", 1);
    if (!ads.length) return;
    const node = adBanner(ads[0]);
    if (node) $("#catalog-ad").replaceChildren(node);
  } catch {
    /* Ads are optional. */
  }
}

async function load(page = 1, { append = false } = {}) {
  const seq = ++requestSeq;
  state.page = page;
  if (!append) showLoading();
  else {
    loadMore.disabled = true;
    loadMore.textContent = t("loading_more");
  }
  try {
    const data = await fetchCatalog({
      kind,
      genre: state.genre,
      sort: state.sort,
      page,
      page_size: 24,
    });
    if (seq !== requestSeq) return;
    state.total = data.total;
    state.pages = data.pages;
    state.items = append ? state.items.concat(data.items) : data.items;
    state.loaded = true;
    renderCount();
    renderGrid();
    moreWrap.hidden = state.page >= state.pages;
  } catch (error) {
    if (seq !== requestSeq) return;
    gridHost.replaceChildren();
    moreWrap.hidden = true;
    resultLine.replaceChildren();
    errorState(gridHost, error.message, () => load(page, { append }));
  } finally {
    if (seq === requestSeq) {
      loadMore.disabled = false;
      loadMore.textContent = t("load_more");
    }
  }
}

sortSelect.addEventListener("change", () => {
  state.sort = SORTS.includes(sortSelect.value) ? sortSelect.value : "newest";
  syncUrl();
  load(1);
});

loadMore.addEventListener("click", () => {
  if (state.page < state.pages && !loadMore.disabled) load(state.page + 1, { append: true });
});

window.addEventListener("kinora:lang", () => {
  renderChips();
  renderCount();
  renderGrid();
  loadMore.textContent = t("load_more");
});

renderChips();
loadGenres();
loadAd();
load(1);
