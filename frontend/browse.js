import { apiUrl, fetchAds, fetchCatalog, fetchHome, mediaUrl, trackAdImpression, trackView } from "./api.js";
import { localized, t, genreLabel, kindLabel, formatNumber } from "./i18n.js";
import {
  adBanner,
  el,
  emptyState,
  errorState,
  initShell,
  openPlayer,
  posterCard,
  posterGrid,
  resolvePlayback,
  safeImage,
  shelf,
  skeletonCards,
  $,
} from "./ui.js";

const shell = initShell({ active: "browse.html" });
const params = new URLSearchParams(window.location.search);
const query = (params.get("search") || "").trim();

const homeWrap = $("#browse-home");
const hero = $("#home-hero");
const heroMedia = $("#hero-media");
const heroContent = $("#hero-content");
const heroControls = $("#hero-controls");
const heroDots = $("#hero-dots");
const rowsHost = $("#browse-rows");
const searchWrap = $("#browse-search");
const searchTitle = $("#search-title");
const searchSub = $("#search-sub");
const searchCount = $("#search-count");
const searchResults = $("#search-results");
const searchMoreWrap = $("#search-more-wrap");
const searchMore = $("#search-more");

let homeCache = null;
let searchCache = null;
let slides = [];
let currentSlide = 0;
let heroTimer = null;

function skeletonShelf() {
  const section = el("section", { class: "shelf" });
  section.append(
    el("div", { class: "shelf__head" }, el("div", { class: "skeleton skeleton--line", style: "width: 190px; height: 20px;" })),
    el("div", { class: "shelf__scroller" }, ...skeletonCards(7)),
  );
  return section;
}

function iconNode(path, viewBox = "0 0 24 24", fill = "none") {
  const span = el("span", { class: "icon", attrs: { "aria-hidden": "true" } });
  span.innerHTML = `<svg viewBox="${viewBox}" fill="${fill}" ${fill === "none" ? 'stroke="currentColor" stroke-width="2"' : ""}>${path}</svg>`;
  return span;
}

function metaLine(content) {
  const meta = el("div", { class: "hero-meta" });
  meta.append(el("span", { text: String(content.year || "—") }));
  meta.append(el("span", { class: "dot" }));
  meta.append(el("span", { text: kindLabel(content.kind) }));
  const genres = (content.genres || []).slice(0, 2);
  for (const genre of genres) {
    meta.append(el("span", { class: "dot" }));
    meta.append(el("span", { text: genreLabel(genre) }));
  }
  if (content.duration_minutes) {
    meta.append(el("span", { class: "dot" }));
    meta.append(el("span", { text: `${content.duration_minutes} ${t("minutes")}` }));
  }
  if (content.age_rating) {
    meta.append(el("span", { class: "hero-meta__badge", text: content.age_rating }));
  }
  return meta;
}

function renderContentSlide(content) {
  const kicker = el(
    "span",
    { class: "hero-kicker" },
    iconNode('<path d="M12 2.5c.6 4.9 2.2 6.9 6.9 7.5-4.7.6-6.3 2.6-6.9 7.5-.6-4.9-2.2-6.9-6.9-7.5 4.7-.6 6.3-2.6 6.9-7.5Z"/>', "0 0 24 24", "currentColor"),
    el("span", { text: t("hero_pick") }),
  );
  const actions = el("div", { class: "hero-actions" });
  if (content.playback) {
    actions.append(
      el(
        "button",
        {
          class: "btn btn--red",
          type: "button",
          onclick: () => {
            trackView(content.id);
            openPlayer({
              title: localized(content),
              subtitle: `${content.year || ""} · ${kindLabel(content.kind)}`,
              url: resolvePlayback(content.playback),
              poster: safeImage(content.backdrop_url || content.poster_url),
            });
          },
        },
        iconNode('<path d="M8 5.5v13l11-6.5-11-6.5Z"/>', "0 0 24 24", "currentColor"),
        el("span", { text: t("watch_now") }),
      ),
    );
    actions.append(
      el(
        "a",
        { class: "btn btn--outline", href: `detail.html?slug=${encodeURIComponent(content.slug)}` },
        iconNode('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
        el("span", { text: t("more_info") }),
      ),
    );
  } else {
    actions.append(
      el(
        "a",
        { class: "btn btn--red", href: `detail.html?slug=${encodeURIComponent(content.slug)}` },
        el("span", { text: t("more_info") }),
        iconNode('<path d="M5 12h14M13 6l6 6-6 6"/>'),
      ),
    );
  }
  heroContent.replaceChildren(
    kicker,
    el("h1", { class: "hero-title", text: localized(content) }),
    metaLine(content),
    el("p", { class: "hero-desc", text: localized(content, "description") || t("playback_unavailable_hint") }),
    actions,
  );
  heroMedia.replaceChildren(
    el("img", {
      src: safeImage(content.backdrop_url || content.poster_url, "assets/backdrops/nur.webp"),
      alt: "",
      loading: "eager",
    }),
  );
}

function renderAdSlide(ad) {
  const kicker = el(
    "span",
    { class: "hero-kicker" },
    iconNode('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/>', "0 0 24 24", "currentColor"),
    el("span", { text: t("hero_ad") }),
    el("span", { class: "ad-label", text: t("sponsored") }),
  );
  heroContent.replaceChildren(
    kicker,
    el("h1", { class: "hero-title", text: ad.title }),
    el("div", { class: "hero-meta" }, el("span", { text: ad.advertiser }), el("span", { class: "dot" }), el("span", { text: t("sponsored") })),
    el("p", { class: "hero-desc", text: ad.description || t("ad_click_note") }),
    el(
      "div",
      { class: "hero-actions" },
      el(
        "a",
        {
          class: "btn btn--red",
          href: apiUrl(ad.click_url),
          target: "_blank",
          rel: "sponsored noopener noreferrer",
        },
        el("span", { text: t("ad_cta") }),
        iconNode('<path d="M5 12h14M13 6l6 6-6 6"/>'),
      ),
    ),
  );
  heroMedia.replaceChildren(
    el("img", {
      src: safeImage(ad.image_url, "assets/backdrops/nur.webp"),
      alt: "",
      loading: "eager",
    }),
  );
  trackAdImpression(ad);
}

function updateDots() {
  Array.from(heroDots.children).forEach((dot, index) => {
    dot.classList.toggle("is-active", index === currentSlide);
    dot.setAttribute("aria-current", index === currentSlide ? "true" : "false");
  });
}

function showSlide(index, { restart = true } = {}) {
  if (!slides.length) return;
  currentSlide = (index + slides.length) % slides.length;
  const slide = slides[currentSlide];
  if (slide.type === "ad") renderAdSlide(slide.ad);
  else renderContentSlide(slide.content);
  updateDots();
  if (restart) startHeroTimer();
}

function startHeroTimer() {
  clearInterval(heroTimer);
  if (slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  heroTimer = setInterval(() => showSlide(currentSlide + 1, { restart: false }), 8000);
}

function buildHeroSlides(featured, ads) {
  slides = featured.map((content) => ({ type: "content", content }));
  if (ads.length) {
    const insertAt = Math.min(2, slides.length);
    slides.splice(insertAt, 0, { type: "ad", ad: ads[0] });
    if (ads[1]) slides.push({ type: "ad", ad: ads[1] });
  }
  heroDots.replaceChildren(
    ...slides.map((_, index) =>
      el("button", {
        class: "hero-dot",
        type: "button",
        attrs: { "aria-label": `${index + 1}` },
        onclick: () => showSlide(index),
      }),
    ),
  );
  heroControls.hidden = slides.length < 2;
  showSlide(Math.min(currentSlide, slides.length - 1));
}

function rowTitle(key) {
  return {
    trending: t("row_trending"),
    new: t("row_new"),
    movies: t("row_movies"),
    series: t("row_series"),
  }[key] || key;
}

function renderHome(data, ad) {
  const featured = data.featured || [];
  if (!featured.length && !(data.rows || []).some((row) => row.items?.length)) {
    homeWrap.querySelector(".home-hero")?.setAttribute("hidden", "");
    emptyState(rowsHost, {
      title: t("empty_catalog"),
      text: t("empty_catalog_hint"),
      actionLabel: t("footer_admin"),
      actionHref: "admin.html",
    });
    return;
  }
  hero.hidden = false;
  buildHeroSlides(featured.slice(0, 5), ad?.[0] ? [ad[0]] : []);
  rowsHost.replaceChildren();
  const rows = (data.rows || []).filter((row) => row.items?.length);
  let rendered = 0;
  for (const row of rows) {
    const viewAllHref = row.key === "movies" ? "movies.html" : row.key === "series" ? "series.html" : "";
    const node = shelf({
      title: rowTitle(row.key),
      items: row.items,
      viewAllHref,
      shelfKey: row.key,
    });
    if (node) {
      rowsHost.append(node);
      rendered += 1;
    }
    if (rendered === 2 && ad?.[1]) {
      rowsHost.append(el("div", { class: "page-ad" }, adBanner(ad[1])));
    }
  }
  if (rendered === 0) {
    rowsHost.append(
      el(
        "div",
        { class: "notice-bar" },
        iconNode('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
        el("span", { text: t("empty_catalog_hint") }),
      ),
    );
  }
}

async function loadHome() {
  rowsHost.replaceChildren(skeletonShelf(), skeletonShelf());
  try {
    const [home, heroAds, betweenAds] = await Promise.all([
      fetchHome(),
      fetchAds("home_hero", 2),
      fetchAds("between_rows", 1),
    ]);
    const ads = [heroAds[0] || null, betweenAds[0] || null];
    homeCache = { home, ads };
    renderHome(home, ads);
  } catch (error) {
    hero.hidden = true;
    errorState(rowsHost, error.message, () => loadHome());
  }
}

$("#hero-prev")?.addEventListener("click", () => showSlide(currentSlide - 1));
$("#hero-next")?.addEventListener("click", () => showSlide(currentSlide + 1));
hero?.addEventListener("mouseenter", () => clearInterval(heroTimer));
hero?.addEventListener("mouseleave", startHeroTimer);
hero?.addEventListener("focusin", () => clearInterval(heroTimer));
hero?.addEventListener("focusout", startHeroTimer);

/* ---------- Instant search results page mode ---------- */
let searchPage = 1;
let searchPages = 1;
let searchItems = [];
let searchTotal = 0;

function renderSearchHeading() {
  if (!query) {
    searchTitle.textContent = t("search_results");
    searchSub.textContent = t("search_start");
    return;
  }
  searchTitle.textContent = t("search_for", { query });
  searchSub.textContent = t("search_results");
  document.title = `KINORA — ${query}`;
}

function renderSearchResults() {
  if (!query) {
    searchMoreWrap.hidden = true;
    searchCount.replaceChildren();
    emptyState(searchResults, {
      title: t("search_results"),
      text: t("search_start"),
      actionLabel: t("browse_catalog"),
      actionHref: "browse.html",
      iconName: "search",
    });
    return;
  }
  if (!searchItems.length) {
    searchMoreWrap.hidden = true;
    searchCount.replaceChildren();
    emptyState(searchResults, {
      title: t("search_none"),
      text: t("search_none_hint"),
      actionLabel: t("browse_catalog"),
      actionHref: "browse.html",
      iconName: "search",
    });
    return;
  }
  searchResults.replaceChildren(posterGrid(searchItems));
  searchCount.replaceChildren(
    el("span", { text: t("results_count", { count: formatNumber(searchTotal) }) }),
    el("span", { text: query }),
  );
  searchMoreWrap.hidden = searchPage >= searchPages;
}

async function loadSearch(page = 1, { append = false } = {}) {
  if (!query) {
    renderSearchHeading();
    renderSearchResults();
    return;
  }
  searchPage = page;
  if (!append) {
    searchResults.replaceChildren(el("div", { class: "poster-grid" }, ...skeletonCards(10)));
    searchCount.replaceChildren();
    searchMoreWrap.hidden = true;
  }
  searchMore.disabled = true;
  try {
    const data = await fetchCatalog({ search: query, sort: "newest", page, page_size: 24 });
    searchTotal = data.total;
    searchPages = data.pages;
    searchItems = append ? searchItems.concat(data.items || []) : data.items || [];
    searchCache = { items: searchItems, total: searchTotal, pages: searchPages };
    renderSearchHeading();
    renderSearchResults();
  } catch (error) {
    searchResults.replaceChildren();
    errorState(searchResults, error.message, () => loadSearch(page, { append }));
  } finally {
    searchMore.disabled = false;
  }
}

searchMore?.addEventListener("click", () => {
  if (searchPage < searchPages) loadSearch(searchPage + 1, { append: true });
});

function initSearchMode() {
  homeWrap.hidden = true;
  searchWrap.hidden = false;
  loadSearch(1);
}

if (query) initSearchMode();
else loadHome();

window.addEventListener("kinora:lang", () => {
  if (query) {
    renderSearchHeading();
    renderSearchResults();
  } else if (homeCache) {
    renderHome(homeCache.home, homeCache.ads);
  }
});

window.addEventListener("beforeunload", () => clearInterval(heroTimer));
