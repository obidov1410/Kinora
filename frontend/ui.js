/* Shared shell, cards, ads, dialogs and state helpers. */
import {
  API_BASE,
  ApiError,
  BOT_USERNAME,
  apiUrl,
  devLogin,
  ensureSession,
  fetchCatalog,
  getMe,
  getPublicConfig,
  getToken,
  initTelegramWebApp,
  isInTelegram,
  logout,
  mediaUrl,
  openBot,
  telegramLogin,
  trackAdImpression,
  updateLanguage,
} from "./api.js";
import {
  applyTranslations,
  currentLang,
  formatNumber,
  genreLabel,
  getLang,
  kindLabel,
  localized,
  setLang,
  t,
} from "./i18n.js";

export const FALLBACK_POSTER = "assets/posters/kinora-namuna.webp";

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style") node.style.cssText = value;
    else if (key === "attrs") {
      for (const [name, attrValue] of Object.entries(value)) {
        if (attrValue !== undefined && attrValue !== null) node.setAttribute(name, attrValue);
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value === true ? "" : value);
    }
  }
  appendChildren(node, children);
  return node;
}

const ICONS = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4.2 4.2L19 6.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 6.7 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/></svg>',
  heartFilled: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 6.7 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.6 6.8-3.8M8.6 13.4l6.8 3.8"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 5-7 7 7 7"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 5 7 7-7 7"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M10 4H5v16h5M15 8l4 4-4 4M9 12h10"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-3.6 3.7-5.6 7.5-5.6s6.7 2 7.5 5.6"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c.6 4.9 2.2 6.9 6.9 7.5-4.7.6-6.3 2.6-6.9 7.5-.6-4.9-2.2-6.9-6.9-7.5 4.7-.6 6.3-2.6 6.9-7.5Z"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17.2v.3"/></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 4.2 2.9 11.4c-.9.3-.9.9-.1 1.1l4.8 1.5 1.8 5.6c.2.6.4.8 1 .8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.4c.3-1.2-.4-1.8-1.5-1.8ZM8.6 13.9l9.1-5.7c.4-.3.8-.1.5.2l-7.5 6.8-.3 3.1-1.8-4.4Z"/></svg>',
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 11 14-6v14L3 13v-2Z"/><path d="M7 13v5a2 2 0 0 0 4 0v-4"/><path d="M20 9.5v5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.1 3-4.8 6-4.8s5.4 1.7 6 4.8"/><path d="M16 5.4a3 3 0 0 1 0 5.6M18 14.6c1.7.6 2.8 2 3.2 4.4"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 7 4 4 5-6 5 6 4-4-2 12H5L3 7Z"/><path d="M5.5 19h13"/></svg>',
  database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17l-1 4Z"/><path d="m13.5 6.5 3 3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 19h16"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 5v6h-6"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 4.5 6v5.5c0 4.6 3 7.6 7.5 9.5 4.5-1.9 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  checkCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7L16.5 9"/></svg>',
  xCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 5-5 4 4 3-3 4 4"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M10 13.5a4.5 4.5 0 0 0 6.4 0l2.1-2.1a4.5 4.5 0 0 0-6.4-6.4L11 6.1"/><path d="M14 10.5a4.5 4.5 0 0 0-6.4 0l-2.1 2.1a4.5 4.5 0 0 0 6.4 6.4l1.1-1.1"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.4 2"/></svg>',
  trending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m3 16 5.5-5.5 4 4L21 6"/><path d="M15 6h6v6"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 9h18M16 13.5h2"/></svg>',
};

export function icon(name, className = "icon") {
  const span = el("span", { class: className, attrs: { "aria-hidden": "true" } });
  span.innerHTML = ICONS[name] || "";
  return span;
}

export function initials(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || "";
  return name.trim().slice(0, 2).toUpperCase() || "K";
}

export function avatar(user, size = "md") {
  if (user?.photo_url) {
    return el("img", {
      class: `avatar avatar--${size}`,
      src: user.photo_url,
      alt: "",
      loading: "lazy",
      referrerpolicy: "no-referrer",
    });
  }
  return el("span", { class: `avatar avatar--${size} avatar--letter`, text: initials(user) });
}

export function safeImage(path, fallback = FALLBACK_POSTER) {
  return mediaUrl(path) || fallback;
}

export function contentHref(content) {
  return `detail.html?slug=${encodeURIComponent(content.slug || content.id)}`;
}

export function posterCard(content, { className = "" } = {}) {
  const link = el(
    "a",
    {
      class: `poster-card ${className}`.trim(),
      href: contentHref(content),
      attrs: { "aria-label": localized(content) || "Kontent" },
    },
    el(
      "div",
      { class: "poster-card__frame" },
      el("img", {
        class: "poster-card__image",
        src: safeImage(content.poster_url),
        alt: "",
        loading: "lazy",
        decoding: "async",
      }),
      el(
        "span",
        { class: "poster-card__hover" },
        el("span", { class: "poster-card__play" }, icon("play")),
        el("span", { class: "poster-card__hint", text: t("more_info") }),
      ),
      content.is_demo ? el("span", { class: "badge badge--demo", text: t("demo_badge") }) : null,
    ),
    el(
      "div",
      { class: "poster-card__body" },
      el("h3", { class: "poster-card__title", text: localized(content) }),
      el(
        "p",
        { class: "poster-card__meta" },
        el("span", { text: content.year || "—" }),
        el("span", { class: "dot" }),
        el("span", { text: kindLabel(content.kind) }),
      ),
    ),
  );
  return link;
}

export function skeletonCards(count = 6) {
  const cards = [];
  for (let index = 0; index < count; index += 1) {
    cards.push(
      el(
        "div",
        { class: "poster-card poster-card--skeleton", attrs: { "aria-hidden": "true" } },
        el("div", { class: "poster-card__frame skeleton" }),
        el("div", { class: "skeleton skeleton--line" }),
        el("div", { class: "skeleton skeleton--line skeleton--short" }),
      ),
    );
  }
  return cards;
}

export function posterGrid(items, { className = "" } = {}) {
  const grid = el("div", { class: `poster-grid ${className}`.trim() });
  for (const item of items) grid.append(posterCard(item));
  return grid;
}

export function shelf({ title, items, viewAllHref, ad, shelfKey = "" }) {
  if (!items?.length && !ad) return null;
  const scroller = el("div", { class: "shelf__scroller", attrs: { role: "list" } });
  for (const item of items || []) {
    const card = posterCard(item);
    card.setAttribute("role", "listitem");
    scroller.append(card);
  }
  if (ad) {
    const adNode = adBanner(ad, { inline: true });
    if (adNode) {
      adNode.setAttribute("role", "listitem");
      scroller.append(adNode);
    }
  }
  const prev = el(
    "button",
    {
      class: "shelf__arrow shelf__arrow--prev",
      type: "button",
      attrs: { "aria-label": "Orqaga" },
      onclick: () => scroller.scrollBy({ left: -scroller.clientWidth * 0.8, behavior: "smooth" }),
    },
    icon("chevronLeft"),
  );
  const next = el(
    "button",
    {
      class: "shelf__arrow shelf__arrow--next",
      type: "button",
      attrs: { "aria-label": "Oldinga" },
      onclick: () => scroller.scrollBy({ left: scroller.clientWidth * 0.8, behavior: "smooth" }),
    },
    icon("chevronRight"),
  );
  return el(
    "section",
    { class: "shelf", dataset: shelfKey ? { shelf: shelfKey } : {} },
    el(
      "div",
      { class: "shelf__head" },
      el("h2", { class: "shelf__title", text: title }),
      viewAllHref
        ? el(
            "a",
            { class: "shelf__more", href: viewAllHref },
            el("span", { text: t("view_all") }),
            icon("arrowRight"),
          )
        : null,
    ),
    el("div", { class: "shelf__viewport" }, prev, scroller, next),
  );
}

function observeImpression(node, ad) {
  if (!ad?.id) return;
  if (!("IntersectionObserver" in window)) {
    trackAdImpression(ad);
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          trackAdImpression(ad);
          observer.disconnect();
        }
      }
    },
    { threshold: 0.45 },
  );
  observer.observe(node);
}

export function adBanner(ad, { inline = false } = {}) {
  if (!ad) return null;
  const link = el(
    "a",
    {
      class: `ad-banner ${inline ? "ad-banner--inline" : ""}`.trim(),
      href: apiUrl(ad.click_url),
      target: "_blank",
      rel: "sponsored noopener noreferrer",
    },
    el("img", {
      class: "ad-banner__image",
      src: safeImage(ad.image_url, "assets/posters/kinora-namuna.webp"),
      alt: "",
      loading: "lazy",
    }),
    el(
      "div",
      { class: "ad-banner__scrim" },
      el(
        "div",
        { class: "ad-banner__content" },
        el(
          "div",
          { class: "ad-banner__labels" },
          el("span", { class: "ad-label", text: t("sponsored") }),
          ad.is_demo ? el("span", { class: "badge badge--demo", text: t("demo_badge") }) : null,
        ),
        el("h3", { class: "ad-banner__title", text: ad.title }),
        ad.description ? el("p", { class: "ad-banner__text", text: ad.description }) : null,
        el(
          "span",
          { class: "ad-banner__cta" },
          el("span", { text: t("ad_cta") }),
          icon("arrowRight"),
        ),
      ),
    ),
  );
  observeImpression(link, ad);
  return link;
}

export function genreChips(genres, active, onSelect) {
  const wrap = el("div", { class: "chips", attrs: { role: "list" } });
  const all = el(
    "button",
    {
      type: "button",
      class: `chip ${!active ? "is-active" : ""}`,
      dataset: { genre: "" },
      onclick: () => onSelect(""),
    },
    el("span", { text: t("all") }),
  );
  all.setAttribute("role", "listitem");
  wrap.append(all);
  for (const genre of genres) {
    const key = genre.key || genre;
    const button = el(
      "button",
      {
        type: "button",
        class: `chip ${active === key ? "is-active" : ""}`,
        dataset: { genre: key },
        onclick: () => onSelect(key),
      },
      el("span", { text: genreLabel(key) }),
      genre.count ? el("span", { class: "chip__count", text: formatNumber(genre.count) }) : null,
    );
    button.setAttribute("role", "listitem");
    wrap.append(button);
  }
  return wrap;
}

export function sectionHeading(title, subtitle) {
  return el(
    "div",
    { class: "section-heading" },
    el("h1", { class: "section-heading__title", text: title }),
    subtitle ? el("p", { class: "section-heading__sub", text: subtitle }) : null,
  );
}

export function loadingState(container, message = null) {
  container.replaceChildren(
    el(
      "div",
      { class: "state-block" },
      el("div", { class: "spinner", attrs: { role: "status", "aria-label": t("loading") } }),
      el("p", { class: "state-block__title", text: message || t("loading") }),
    ),
  );
}

export function errorState(container, message, retry) {
  container.replaceChildren(
    el(
      "div",
      { class: "state-block state-block--error" },
      el("div", { class: "state-block__icon" }, icon("warning")),
      el("h2", { class: "state-block__title", text: t("error_title") }),
      el("p", { class: "state-block__text", text: message || t("error_generic") }),
      retry
        ? el(
            "button",
            { class: "btn btn--outline", type: "button", onclick: retry },
            icon("arrowRight"),
            el("span", { text: t("retry") }),
          )
        : null,
    ),
  );
}

export function emptyState(container, { title, text, actionLabel, actionHref, onAction, iconName = "spark" } = {}) {
  container.replaceChildren(
    el(
      "div",
      { class: "state-block" },
      el("div", { class: "state-block__icon" }, icon(iconName)),
      el("h2", { class: "state-block__title", text: title || t("empty_catalog") }),
      el("p", { class: "state-block__text", text: text || t("empty_catalog_hint") }),
      actionLabel
        ? actionHref
          ? el("a", { class: "btn btn--red", href: actionHref, text: actionLabel })
          : el("button", { class: "btn btn--red", type: "button", text: actionLabel, onclick: onAction })
        : null,
    ),
  );
}

let toastRoot = null;

export function toast(message, type = "info") {
  if (!message) return;
  if (!toastRoot) {
    toastRoot = document.getElementById("toast-root") || el("div", { id: "toast-root", class: "toast-root" });
    if (!toastRoot.isConnected) document.body.append(toastRoot);
  }
  const node = el(
    "div",
    { class: `toast toast--${type}`, attrs: { role: "status" } },
    el("span", { class: "toast__icon" }, icon(type === "error" ? "warning" : type === "success" ? "check" : "info")),
    el("span", { class: "toast__text", text: message }),
  );
  toastRoot.append(node);
  requestAnimationFrame(() => node.classList.add("is-visible"));
  setTimeout(() => {
    node.classList.remove("is-visible");
    setTimeout(() => node.remove(), 220);
  }, 3600);
}

const modalStack = [];

export function openModal({ title = "", body = null, size = "md", className = "", onClose = null } = {}) {
  const previousFocus = document.activeElement;
  const modalBody = el("div", { class: "modal__body" });
  if (body) modalBody.append(body);
  const closeButton = el(
    "button",
    { class: "modal__close", type: "button", attrs: { "aria-label": t("close") } },
    icon("close"),
  );
  const overlay = el(
    "div",
    { class: `modal-overlay modal-overlay--${size} ${className}`.trim(), attrs: { role: "presentation" } },
    el(
      "div",
      { class: "modal", attrs: { role: "dialog", "aria-modal": "true", "aria-label": title || "Dialog" } },
      title
        ? el(
            "div",
            { class: "modal__head" },
            el("h2", { class: "modal__title", text: title }),
            closeButton,
          )
        : closeButton,
      modalBody,
    ),
  );
  if (!title) overlay.querySelector(".modal").classList.add("modal--bare");

  let closed = false;
  const handle = {
    overlay,
    body: modalBody,
    close() {
      if (closed) return;
      closed = true;
      const index = modalStack.indexOf(handle);
      if (index >= 0) modalStack.splice(index, 1);
      overlay.classList.remove("is-open");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => {
        overlay.remove();
        if (!modalStack.length) document.body.classList.remove("modal-open");
        if (previousFocus?.focus) previousFocus.focus({ preventScroll: true });
      }, 180);
      if (onClose) onClose();
    },
  };
  function onKey(event) {
    if (event.key === "Escape" && modalStack[modalStack.length - 1] === handle) {
      event.preventDefault();
      handle.close();
    }
  }
  closeButton.addEventListener("click", () => handle.close());
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) handle.close();
  });
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
  document.body.classList.add("modal-open");
  modalStack.push(handle);
  requestAnimationFrame(() => overlay.classList.add("is-open"));
  const focusable = overlay.querySelector("input, button, select, textarea, a[href]");
  setTimeout(() => focusable?.focus({ preventScroll: true }), 60);
  return handle;
}

export function confirmDialog({
  title = t("confirm"),
  body = "",
  confirmText = t("confirm"),
  cancelText = t("cancel"),
  danger = false,
  requireText = "",
  requireHint = "",
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      modal.close();
    };
    const confirmButton = el("button", {
      class: `btn ${danger ? "btn--danger" : "btn--red"}`,
      type: "button",
      disabled: Boolean(requireText),
      text: confirmText,
    });
    const cancelButton = el("button", {
      class: "btn btn--ghost",
      type: "button",
      text: cancelText,
      onclick: () => finish(false),
    });
    let input = null;
    if (requireText) {
      input = el("input", {
        class: "input",
        type: "text",
        autocomplete: "off",
        placeholder: requireText,
      });
      input.addEventListener("input", () => {
        confirmButton.disabled = input.value.trim() !== requireText;
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !confirmButton.disabled) finish(true);
      });
    }
    confirmButton.addEventListener("click", () => finish(true));
    const content = el(
      "div",
      { class: "dialog" },
      body ? el("p", { class: "dialog__text", text: body }) : null,
      requireText
        ? el(
            "label",
            { class: "field" },
            el("span", { class: "field__label", text: requireHint || t("confirm_type_hint", { text: requireText }) }),
            input,
          )
        : null,
      el("div", { class: "dialog__actions" }, cancelButton, confirmButton),
    );
    const modal = openModal({ title, body: content, size: "sm", onClose: () => finish(false) });
    setTimeout(() => input?.focus({ preventScroll: true }), 80);
  });
}

export function promptDialog({ title, label, value = "", type = "number", confirmText = t("confirm"), placeholder = "" } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
      modal.close();
    };
    const input = el("input", {
      class: "input",
      type,
      value,
      placeholder,
      autocomplete: "off",
    });
    const submit = el("button", {
      class: "btn btn--red",
      type: "button",
      text: confirmText,
      onclick: () => finish(input.value),
    });
    const cancel = el("button", {
      class: "btn btn--ghost",
      type: "button",
      text: t("cancel"),
      onclick: () => finish(null),
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(input.value);
    });
    const content = el(
      "div",
      { class: "dialog" },
      el("label", { class: "field" }, el("span", { class: "field__label", text: label }), input),
      el("div", { class: "dialog__actions" }, cancel, submit),
    );
    const modal = openModal({ title, body: content, size: "sm", onClose: () => finish(null) });
    setTimeout(() => {
      input.focus({ preventScroll: true });
      input.select();
    }, 80);
  });
}

export function resolvePlayback(playback) {
  if (!playback?.url) return "";
  if (playback.type === "telegram" || playback.url.startsWith("/api/")) return apiUrl(playback.url);
  return playback.url;
}

export function openPlayer({ title, subtitle = "", url, poster = "" }) {
  const video = el("video", {
    class: "player__video",
    controls: true,
    playsinline: true,
    preload: "metadata",
    autoplay: true,
  });
  video.setAttribute("controlslist", "nodownload noplaybackrate noremoteplayback");
  video.disablePictureInPicture = true;
  if (poster) video.poster = poster;
  video.src = url;
  const note = el("p", { class: "player__note", text: t("video_rights_notice") });
  const error = el("p", { class: "player__error", text: t("playback_unavailable_hint") });
  error.hidden = true;
  video.addEventListener("error", () => {
    error.hidden = false;
  });
  const container = el(
    "div",
    { class: "player" },
    title ? el("h3", { class: "player__title", text: title }) : null,
    subtitle ? el("p", { class: "player__sub", text: subtitle }) : null,
    video,
    note,
    error,
  );
  const modal = openModal({
    title: "",
    body: container,
    size: "lg",
    className: "modal-overlay--player",
    onClose: () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    },
  });
  video.play?.().catch(() => {});
  return modal;
}

function authAvatarName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || t("guest_badge");
}

export async function openAuthModal({ message = "", onSuccess = null } = {}) {
  let config = null;
  try {
    config = await getPublicConfig();
  } catch {
    config = null;
  }
  const body = el("div", { class: "auth-modal" });
  if (message) body.append(el("p", { class: "auth-modal__message", text: message }));
  body.append(
    el("p", { class: "auth-modal__text", text: t("auth_body") }),
    el(
      "button",
      {
        class: "btn btn--red btn--wide",
        type: "button",
        onclick: () => openBot(),
      },
      icon("telegram"),
      el("span", { text: t("auth_open_bot") }),
    ),
    el(
      "p",
      { class: "auth-modal__hint" },
      el("span", { text: t("auth_inside_tg") }),
    ),
    el(
      "p",
      { class: "auth-modal__note" },
      icon("info"),
      el("span", { text: t("auth_guest_note") }),
    ),
  );

  if (isInTelegram()) {
    const app = window.Telegram?.WebApp;
    if (app?.initData) {
      const auto = el("p", { class: "auth-modal__waiting", text: t("auth_waiting") });
      body.append(auto);
      telegramLogin(app.initData, currentLang)
        .then((user) => {
          toast(t("admin_saved"), "success");
          window.dispatchEvent(new CustomEvent("kinora:auth-changed", { detail: user }));
          modal.close();
          onSuccess?.(user);
        })
        .catch((error) => {
          auto.remove();
          body.append(el("p", { class: "form-error", text: error.message || t("auth_failed") }));
        });
    }
  }

  if (config?.dev_login_allowed) {
    const devForm = el("form", { class: "auth-modal__dev" });
    const idInput = el("input", {
      class: "input",
      type: "text",
      name: "telegram_id",
      inputmode: "numeric",
      placeholder: "7041471070",
      required: true,
    });
    const nameInput = el("input", {
      class: "input",
      type: "text",
      name: "first_name",
      placeholder: "Dev Owner",
    });
    const submit = el("button", {
      class: "btn btn--outline btn--wide",
      type: "submit",
      text: t("auth_dev_submit"),
    });
    const feedback = el("p", { class: "form-error", hidden: true });
    devForm.append(
      el("div", { class: "auth-modal__dev-note" }, icon("warning"), el("span", { text: t("auth_dev_body") })),
      el(
        "label",
        { class: "field" },
        el("span", { class: "field__label", text: t("auth_dev_id") }),
        idInput,
      ),
      el(
        "label",
        { class: "field" },
        el("span", { class: "field__label", text: t("auth_dev_name") }),
        nameInput,
      ),
      feedback,
      submit,
    );
    devForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      feedback.hidden = true;
      submit.disabled = true;
      try {
        const user = await devLogin(Number(idInput.value), nameInput.value || "Dev User");
        toast(t("admin_saved"), "success");
        window.dispatchEvent(new CustomEvent("kinora:auth-changed", { detail: user }));
        modal.close();
        onSuccess?.(user);
      } catch (error) {
        feedback.textContent = error.message || t("error_generic");
        feedback.hidden = false;
      } finally {
        submit.disabled = false;
      }
    });
    body.append(devForm);
  }

  const modal = openModal({ title: t("auth_title"), body, size: "sm" });
  return modal;
}

export async function requireLogin(message = t("favorite_requires_auth")) {
  if (getToken()) {
    try {
      const me = await getMe();
      if (me) return me;
    } catch {
      /* fall through to the modal */
    }
  }
  openAuthModal({ message });
  return null;
}

function brandNode(overlay) {
  return el(
    "a",
    { class: `brand ${overlay ? "brand--overlay" : ""}`, href: "index.html", attrs: { "aria-label": "KINORA" } },
    el("span", { class: "brand__mark", text: "K" }),
    el("span", { class: "brand__name", text: "KINORA" }),
  );
}

function navLink(href, label, active) {
  return el("a", {
    class: `nav-link ${active === href ? "is-active" : ""}`,
    href,
    text: label,
  });
}

export function initShell({ active = "", overlay = false, showSearch = true } = {}) {
  const headerHost = document.getElementById("site-header");
  const footerHost = document.getElementById("site-footer");
  if (!headerHost) return null;
  const state = { me: null, config: null, ready: false };
  let searchTimer = null;
  let searchController = null;

  function navItems() {
    const items = [
      navLink("browse.html", t("nav_home"), active),
      navLink("movies.html", t("nav_movies"), active),
      navLink("series.html", t("nav_series"), active),
      navLink("favorites.html", t("nav_favorites"), active),
    ];
    if (state.config?.vip_enabled || state.me?.is_vip) items.push(navLink("vip.html", t("nav_vip"), active));
    return items;
  }

  function langSelect(id = "") {
    const select = el(
      "select",
      { class: "lang-select", id, attrs: { "aria-label": t("language") } },
      el("option", { value: "uz", text: t("lang_latin") }),
      el("option", { value: "uzc", text: t("lang_cyrillic") }),
    );
    select.value = getLang();
    select.addEventListener("change", () => {
      setLang(select.value);
      updateLanguage(select.value);
    });
    return select;
  }

  function authArea() {
    const wrap = el("div", { class: "auth-area" });
    if (state.me) {
      const menu = el("div", { class: "account-menu", hidden: true });
      const role = state.me.role;
      menu.append(
        el(
          "div",
          { class: "account-menu__head" },
          avatar(state.me, "sm"),
          el(
            "div",
            { class: "account-menu__id" },
            el("strong", { text: authAvatarName(state.me) }),
            state.me.username ? el("span", { text: `@${state.me.username}` }) : null,
          ),
        ),
        el("a", { class: "account-menu__link", href: "profile.html" }, icon("user"), el("span", { text: t("nav_profile") })),
        el("a", { class: "account-menu__link", href: "favorites.html" }, icon("heart"), el("span", { text: t("nav_favorites") })),
        state.config?.vip_enabled || state.me.is_vip
          ? el("a", { class: "account-menu__link", href: "vip.html" }, icon("star"), el("span", { text: t("nav_vip") }))
          : null,
        role === "admin" || role === "owner"
          ? el("a", { class: "account-menu__link", href: "admin.html" }, icon("spark"), el("span", { text: t("nav_admin") }))
          : null,
        el("div", { class: "account-menu__divider" }),
        el(
          "button",
          {
            class: "account-menu__link account-menu__link--danger",
            type: "button",
            onclick: async () => {
              const ok = await confirmDialog({
                title: t("logout_confirm_title"),
                body: t("logout_confirm_text"),
                confirmText: t("logout_confirm_btn"),
                danger: true,
              });
              if (!ok) return;
              logout();
              state.me = null;
              window.dispatchEvent(new CustomEvent("kinora:auth-changed", { detail: null }));
              toast(t("sign_out"));
              drawHeader();
            },
          },
          icon("logout"),
          el("span", { text: t("sign_out") }),
        ),
      );
      const trigger = el(
        "button",
        {
          class: "account-trigger",
          type: "button",
          attrs: { "aria-haspopup": "menu", "aria-expanded": "false" },
          onclick: (event) => {
            event.stopPropagation();
            const open = !menu.hidden;
            menu.hidden = open;
            trigger.setAttribute("aria-expanded", String(!open));
          },
        },
        avatar(state.me, "sm"),
        el("span", { class: "account-trigger__name", text: state.me.first_name || state.me.username || t("nav_profile") }),
        icon("chevronDown", "icon icon--sm"),
      );
      const closeMenu = () => {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      };
      document.addEventListener("click", closeMenu);
      menu.addEventListener("click", (event) => event.stopPropagation());
      wrap.append(trigger, menu);
    } else {
      wrap.append(
        el(
          "button",
          {
            class: "btn btn--red btn--sm auth-area__login",
            type: "button",
            onclick: () => openAuthModal({ onSuccess: () => refreshAuth() }),
          },
          el("span", { text: t("sign_in") }),
        ),
      );
    }
    return wrap;
  }

  function searchArea() {
    if (!showSearch) return null;
    const results = el("div", { class: "search-popover", hidden: true });
    const input = el("input", {
      class: "search-input",
      type: "search",
      name: "q",
      autocomplete: "off",
      placeholder: t("search_placeholder"),
      attrs: { "aria-label": t("search"), "aria-expanded": "false" },
    });
    const form = el(
      "form",
      { class: "search-form", attrs: { role: "search" } },
      icon("search", "icon search-form__icon"),
      input,
      el("button", { class: "search-form__submit", type: "submit", attrs: { "aria-label": t("search") } }, icon("arrowRight")),
      results,
    );
    function closeResults() {
      results.hidden = true;
      input.setAttribute("aria-expanded", "false");
    }
    function renderResults(data) {
      results.replaceChildren();
      if (!data.items?.length) {
        results.append(el("p", { class: "search-popover__empty", text: t("search_none") }));
      } else {
        for (const item of data.items) {
          results.append(
            el(
              "a",
              { class: "search-result", href: contentHref(item) },
              el("img", {
                class: "search-result__image",
                src: safeImage(item.poster_url),
                alt: "",
                loading: "lazy",
              }),
              el(
                "div",
                { class: "search-result__text" },
                el("strong", { text: localized(item) }),
                el("span", { text: `${item.year || "—"} · ${kindLabel(item.kind)}` }),
              ),
              icon("arrowRight", "icon icon--sm"),
            ),
          );
        }
        results.append(
          el(
            "a",
            {
              class: "search-popover__all",
              href: `browse.html?search=${encodeURIComponent(input.value.trim())}`,
            },
            el("span", { text: t("view_all") }),
            icon("arrowRight", "icon icon--sm"),
          ),
        );
      }
      results.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    async function runSearch(query) {
      if (query.trim().length < 2) {
        closeResults();
        return;
      }
      searchController?.abort();
      searchController = new AbortController();
      results.replaceChildren(
        el("div", { class: "search-popover__loading" }, el("span", { class: "spinner spinner--sm" }), el("span", { text: t("loading") })),
      );
      results.hidden = false;
      try {
        const data = await fetchCatalog({ search: query.trim(), page_size: 6 });
        renderResults(data);
      } catch (error) {
        if (error.name === "AbortError") return;
        results.replaceChildren(el("p", { class: "search-popover__empty", text: error.message || t("error_generic") }));
      }
    }
    input.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const value = input.value;
      searchTimer = setTimeout(() => runSearch(value), 260);
    });
    input.addEventListener("focus", () => {
      if (input.value.trim().length >= 2) runSearch(input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeResults();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (query.length < 2) {
        toast(t("search_start"));
        return;
      }
      window.location.href = `browse.html?search=${encodeURIComponent(query)}`;
    });
    document.addEventListener("click", (event) => {
      if (!form.contains(event.target)) closeResults();
    });
    const params = new URLSearchParams(window.location.search);
    if (active === "browse.html" && params.get("search")) input.value = params.get("search");
    return form;
  }

  function drawHeader() {
    if (!headerHost) return;
    const header = el(
      "header",
      { class: `site-header ${overlay ? "site-header--overlay" : ""}`, id: "app-header" },
      el(
        "div",
        { class: "site-header__inner" },
        brandNode(overlay),
        el("nav", { class: "main-nav", attrs: { "aria-label": t("nav_menu") } }, navItems()),
        el(
          "div",
          { class: "header-tools" },
          searchArea(),
          el("div", { class: "header-tools__select" }, langSelect()),
          authArea(),
          el(
            "button",
            {
              class: "icon-button mobile-menu-button",
              type: "button",
              attrs: { "aria-label": t("nav_menu"), "aria-expanded": "false" },
              onclick: (event) => openMobileMenu(event.currentTarget),
            },
            icon("menu"),
          ),
        ),
      ),
    );
    const notice = state.config?.site_notice
      ? el(
          "div",
          { class: "site-notice" },
          icon("info", "icon icon--sm"),
          el("span", { text: state.config.site_notice }),
        )
      : null;
    headerHost.replaceChildren(...(notice ? [notice, header] : [header]));
    applyTranslations(headerHost);
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function openMobileMenu(trigger) {
    const menu = el("div", { class: "mobile-menu" });
    trigger?.setAttribute("aria-expanded", "true");
    const close = () => {
      menu.classList.remove("is-open");
      setTimeout(() => menu.remove(), 200);
      document.body.classList.remove("modal-open");
      trigger?.setAttribute("aria-expanded", "false");
    };
    menu.append(
      el(
        "div",
        { class: "mobile-menu__head" },
        brandNode(false),
        el("button", { class: "icon-button", type: "button", attrs: { "aria-label": t("close") }, onclick: close }, icon("close")),
      ),
      el("nav", { class: "mobile-menu__nav" }, navItems()),
      el(
        "div",
        { class: "mobile-menu__extra" },
        el("a", { class: "mobile-menu__link", href: "profile.html" }, icon("user"), el("span", { text: t("nav_profile") })),
        el("a", { class: "mobile-menu__link", href: "favorites.html" }, icon("heart"), el("span", { text: t("nav_favorites") })),
        state.me && (state.me.role === "admin" || state.me.role === "owner")
          ? el("a", { class: "mobile-menu__link", href: "admin.html" }, icon("spark"), el("span", { text: t("nav_admin") }))
          : null,
        el(
          "button",
          {
            class: "mobile-menu__link",
            type: "button",
            onclick: () => {
              close();
              openAuthModal({ onSuccess: () => refreshAuth() });
            },
          },
          icon(state.me ? "user" : "telegram"),
          el("span", { text: state.me ? authAvatarName(state.me) : t("sign_in") }),
        ),
        el("div", { class: "mobile-menu__lang" }, el("span", { text: t("language") }), langSelect()),
      ),
    );
    menu.addEventListener("click", (event) => {
      if (event.target === menu) close();
    });
    document.body.append(menu);
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => menu.classList.add("is-open"));
  }

  function drawFooter() {
    if (!footerHost) return;
    const year = new Date().getFullYear();
    footerHost.replaceChildren(
      el(
        "footer",
        { class: "site-footer" },
        el(
          "div",
          { class: "site-footer__inner" },
          el(
            "div",
            { class: "site-footer__brand" },
            brandNode(false),
            el("p", { class: "site-footer__about", text: t("footer_about") }),
            el(
              "a",
              { class: "site-footer__tg", href: `https://t.me/${BOT_USERNAME}`, target: "_blank", rel: "noopener" },
              icon("telegram"),
              el("span", { text: t("footer_telegram") }),
            ),
          ),
          el(
            "div",
            { class: "site-footer__cols" },
            el(
              "div",
              { class: "site-footer__col" },
              el("h3", { text: t("footer_browse") }),
              el("a", { href: "browse.html", text: t("nav_home") }),
              el("a", { href: "movies.html", text: t("nav_movies") }),
              el("a", { href: "series.html", text: t("nav_series") }),
            ),
            el(
              "div",
              { class: "site-footer__col" },
              el("h3", { text: t("nav_profile") }),
              el("a", { href: "favorites.html", text: t("nav_favorites") }),
              el("a", { href: "vip.html", text: t("nav_vip") }),
              el("a", { href: "profile.html", text: t("nav_profile") }),
            ),
            el(
              "div",
              { class: "site-footer__col" },
              el("h3", { text: t("footer_legal") }),
              el("a", { href: `https://t.me/${BOT_USERNAME}`, target: "_blank", rel: "noopener", text: t("footer_rights") }),
              el("a", { href: "admin.html", text: t("footer_admin") }),
              el("span", { class: "site-footer__muted", text: t("footer_admin_hint") }),
            ),
          ),
        ),
        el(
          "div",
          { class: "site-footer__bottom" },
          el("span", { text: t("copyright", { year }) }),
          el("span", { text: t("footer_notice") }),
        ),
      ),
    );
    applyTranslations(footerHost);
  }

  async function refreshAuth() {
    try {
      state.me = await ensureSession();
    } catch (error) {
      state.me = null;
      if (error?.status && error.status !== 401 && error.status !== 403) {
        /* Silent: the landing page still works without a session. */
      }
    }
    drawHeader();
    window.dispatchEvent(new CustomEvent("kinora:me", { detail: state.me }));
    return state.me;
  }

  drawHeader();
  drawFooter();
  initTelegramWebApp();

  getPublicConfig()
    .then((config) => {
      state.config = config;
      state.ready = true;
      drawHeader();
    })
    .catch(() => {
      state.ready = true;
    });

  refreshAuth();

  window.addEventListener("kinora:lang", () => {
    drawHeader();
    drawFooter();
  });
  window.addEventListener("kinora:auth-changed", (event) => {
    state.me = event.detail ?? null;
    drawHeader();
    if (!state.me) getPublicConfig(true).catch(() => {});
  });
  window.addEventListener("kinora:auth-cleared", () => {
    state.me = null;
    drawHeader();
  });

  return {
    get me() {
      return state.me;
    },
    get config() {
      return state.config;
    },
    refreshAuth,
    openAuth: openAuthModal,
  };
}

export function openInNewTab(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export { API_BASE, ApiError, BOT_USERNAME, apiUrl, formatNumber, getToken, mediaUrl, t };
