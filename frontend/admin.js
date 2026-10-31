/* KINORA admin dashboard: auth gate, shell, routing and statistics. */
import {
  devLogin,
  ensureSession,
  getPublicConfig,
  isInTelegram,
  logout,
  BOT_USERNAME,
} from "./api.js";
import { formatNumber, formatDate } from "./i18n.js";
import { avatar, el, icon, toast } from "./ui.js";
import {
  api,
  badge,
  barChart,
  button,
  confirmDialog,
  lineChart,
  loadingBlock,
  pageHead,
  panel,
  panelHead,
  selectControl,
  setAuthErrorHandler,
  stateBlock,
  statCard,
  table,
} from "./admin-ui.js";
import { renderContent } from "./admin-content.js";
import { renderAds } from "./admin-ads.js";
import { renderUsers } from "./admin-users.js";
import { renderVip } from "./admin-vip.js";
import { renderAudit, renderBackups, renderSettings } from "./admin-system.js";

const FALLBACK_GENRES = [
  "action", "adventure", "animation", "comedy", "crime", "documentary", "drama",
  "family", "fantasy", "history", "horror", "music", "mystery", "romance",
  "sci-fi", "sport", "thriller", "war", "western",
];

const NAV = [
  { route: "dashboard", label: "Boshqaruv paneli", iconName: "dashboard" },
  { route: "content", label: "Kontent", iconName: "film" },
  { route: "ads", label: "Reklamalar", iconName: "megaphone" },
  { route: "users", label: "Foydalanuvchilar", iconName: "users" },
  { route: "vip", label: "VIP va to'lovlar", iconName: "crown" },
  { route: "backups", label: "Zaxira nusxalar", iconName: "database" },
  { route: "audit", label: "Audit jurnali", iconName: "list" },
  { route: "settings", label: "Sozlamalar", iconName: "settings" },
];

const TITLES = Object.fromEntries(NAV.map((item) => [item.route, item.label]));

const state = {
  me: null,
  config: null,
  started: false,
};

const gate = document.getElementById("admin-gate");
const app = document.getElementById("admin-app");
const viewHost = document.getElementById("admin-view");
const navHost = document.getElementById("admin-nav");
const topbarHost = document.getElementById("admin-topbar");
const sidebar = document.getElementById("admin-sidebar");
const backdrop = document.getElementById("admin-backdrop");

setAuthErrorHandler(() => {
  showLogin("Sessiya muddati tugadi. Iltimos, qaytadan kiring.");
});

function setGate(node) {
  app.hidden = true;
  gate.hidden = false;
  gate.replaceChildren(node);
}

function gateCard(content) {
  return el(
    "div",
    { class: "admin-gate__card" },
    el(
      "a",
      { class: "admin-gate__brand", href: "index.html" },
      el("span", { class: "brand__logo" }, el("span", { class: "brand__mark" }), el("span", { text: "KINORA" })),
      el("span", { class: "admin-gate__badge", text: "ADMIN" }),
    ),
    content,
  );
}

function showGateLoading(message = "Tekshirilmoqda…") {
  setGate(
    el(
      "div",
      { class: "admin-gate__card admin-gate__card--plain" },
      el("div", { class: "spinner" }),
      el("p", { class: "admin-muted", text: message }),
    ),
  );
}

function showLogin(message = "") {
  const config = state.config;
  const body = el(
    "div",
    { class: "admin-gate__body" },
    el("h1", { text: "Admin panelga kirish" }),
    el("p", {
      class: "admin-muted",
      text: "Kinora boshqaruv paneli Telegram hisobi orqali himoyalangan. Admin huquqi har so'rovda serverda tekshiriladi.",
    }),
    message ? el("div", { class: "admin-note admin-note--warning" }, el("span", { text: message })) : null,
    isInTelegram()
      ? el("p", { class: "admin-muted", text: "Telegram Mini App aniqlandi, kirish avtomatik amalga oshirilmoqda…" })
      : el(
          "a",
          { class: "btn btn--red", href: `https://t.me/${config?.bot_username || BOT_USERNAME}`, target: "_blank", rel: "noopener" },
          icon("telegram"),
          el("span", { text: "Telegram botni ochish" }),
        ),
  );

  if (!isInTelegram() && config?.dev_login_allowed) {
    const idInput = el("input", { class: "admin-input", type: "number", placeholder: "Telegram ID", value: "7041471070" });
    const nameInput = el("input", { class: "admin-input", type: "text", placeholder: "Ism", value: "Kinora Admin" });
    const loginButton = button("Dev login", { variant: "btn--outline" });
    loginButton.addEventListener("click", async () => {
      const telegramId = Number(idInput.value);
      if (!telegramId) {
        toast("Telegram ID kiriting", "error");
        return;
      }
      loginButton.disabled = true;
      try {
        await devLogin(telegramId, nameInput.value || "Kinora Admin");
        await boot();
      } catch (error) {
        toast(error.message, "error");
        loginButton.disabled = false;
      }
    });
    body.append(
      el(
        "div",
        { class: "admin-dev-login" },
        el("p", { class: "admin-muted", text: "Dev login faqat mahalliy muhitda yoqilgan. Ishlab chiqarishda ALLOW_DEV_LOGIN=false bo'lishi shart." }),
        el("div", { class: "admin-dev-login__row" }, idInput, nameInput, loginButton),
      ),
    );
  }

  if (!config) {
    const retry = button("Qayta urinish", {
      variant: "btn--outline",
      iconName: "refresh",
      onClick: async () => {
        showGateLoading();
        state.config = await loadConfig();
        boot();
      },
    });
    body.append(el("p", { class: "admin-note admin-note--warning" }, el("span", { text: "Server konfiguratsiyasini olib bo'lmadi. API manzilini tekshiring." })), retry);
  }

  body.append(
    el(
      "div",
      { class: "admin-gate__links" },
      el("a", { href: "index.html", text: "Saytga qaytish" }),
      el("a", { href: "browse.html", text: "Katalog" }),
    ),
  );

  setGate(gateCard(body));
}

function showDenied(me, message = "") {
  setGate(
    gateCard(
      el(
        "div",
        { class: "admin-gate__body" },
        el("div", { class: "admin-gate__icon" }, icon("shield")),
        el("h1", { text: "Ruxsat yo'q" }),
        el("p", {
          class: "admin-muted",
          text: message || "Bu hisobda admin huquqi yo'q. Kerak bo'lsa, egasi sizga admin rolini berishi mumkin.",
        }),
        me
          ? el(
              "div",
              { class: "admin-denied-user" },
              avatar(me, "md"),
              el(
                "div",
                {},
                el("strong", { text: [me.first_name, me.last_name].filter(Boolean).join(" ") || "Foydalanuvchi" }),
                el("span", { text: me.username ? `@${me.username}` : `ID: ${me.telegram_id}` }),
              ),
              badge(me.role === "owner" ? "Egasi" : me.role, "muted"),
            )
          : null,
        el(
          "div",
          { class: "admin-gate__actions" },
          button("Saytga qaytish", { variant: "btn--outline", onClick: () => (window.location.href = "index.html") }),
          button("Boshqa hisob bilan kirish", {
            variant: "btn--ghost",
            onClick: () => {
              logout();
              showLogin();
            },
          }),
        ),
      ),
    ),
  );
}

async function loadConfig() {
  try {
    const config = await getPublicConfig();
    return {
      ...config,
      genres: Array.isArray(config?.genres) && config.genres.length ? config.genres : FALLBACK_GENRES,
      placements: Array.isArray(config?.placements) ? config.placements : ["landing", "home_hero", "catalog_banner", "between_rows"],
    };
  } catch {
    return null;
  }
}

async function boot() {
  showGateLoading("Sessiya tekshirilmoqda…");
  state.config = await loadConfig();
  let me = null;
  try {
    me = await ensureSession();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      showLogin(error.message);
      return;
    }
    if (error.status === 0) {
      showLogin(error.message);
      return;
    }
    showLogin(error.message);
    return;
  }
  if (!me) {
    showLogin();
    return;
  }
  if (!["owner", "admin"].includes(me.role)) {
    showDenied(me);
    return;
  }
  state.me = me;
  renderShell();
  if (!location.hash || location.hash === "#") {
    location.hash = "#/dashboard";
  } else {
    route();
  }
}

function navLink(item) {
  const link = el(
    "a",
    {
      class: "admin-nav__link",
      href: `#/${item.route}`,
      dataset: { route: item.route },
    },
    icon(item.iconName),
    el("span", { text: item.label }),
  );
  return link;
}

function renderShell() {
  gate.hidden = true;
  app.hidden = false;
  const me = state.me;
  navHost.replaceChildren(...NAV.map(navLink));

  const sidebarFooter = document.getElementById("admin-sidebar-footer");
  sidebarFooter.replaceChildren(
    el(
      "div",
      { class: "admin-sidebar__user" },
      avatar(me, "sm"),
      el(
        "div",
        {},
        el("strong", { text: [me.first_name, me.last_name].filter(Boolean).join(" ") || "Admin" }),
        el("span", { text: me.username ? `@${me.username}` : "Kinora" }),
      ),
    ),
    el(
      "div",
      { class: "admin-sidebar__links" },
      el("a", { href: "index.html", class: "admin-sidebar__link" }, icon("external"), el("span", { text: "Saytni ochish" })),
      el(
        "button",
        {
          class: "admin-sidebar__link",
          type: "button",
          onclick: async () => {
            const ok = await confirmDialog({
              title: "Chiqish",
              body: "Admin panelidan chiqmoqchimisiz?",
              confirmText: "Chiqish",
              danger: true,
            });
            if (!ok) return;
            logout();
            showLogin();
          },
        },
        icon("logout"),
        el("span", { text: "Chiqish" }),
      ),
    ),
  );

  topbarHost.replaceChildren(
    el(
      "div",
      { class: "admin-topbar__left" },
      el(
        "button",
        {
          class: "admin-topbar__menu",
          type: "button",
          attrs: { "aria-label": "Menyu" },
          onclick: () => toggleSidebar(true),
        },
        icon("menu"),
      ),
      el("h2", { class: "admin-topbar__title", id: "admin-view-title", text: "Boshqaruv paneli" }),
    ),
    el(
      "div",
      { class: "admin-topbar__right" },
      me.role === "owner" ? badge("Egasi", "danger") : badge("Admin", "warning"),
      el(
        "div",
        { class: "admin-topbar__user" },
        avatar(me, "sm"),
        el("span", { text: me.first_name || "Admin" }),
      ),
    ),
  );

  sidebar.classList.remove("is-open");
  backdrop.hidden = true;
}

function toggleSidebar(open) {
  sidebar.classList.toggle("is-open", open);
  backdrop.hidden = !open;
}

function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, "").split("?")[0];
  return NAV.some((item) => item.route === raw) ? raw : "dashboard";
}

function route() {
  if (!state.me) return;
  const name = currentRoute();
  document.querySelectorAll(".admin-nav__link").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.route === name);
  });
  const titleNode = document.getElementById("admin-view-title");
  if (titleNode) titleNode.textContent = TITLES[name] || "Admin";
  document.title = `KINORA Admin — ${TITLES[name] || "Panel"}`;
  toggleSidebar(false);
  viewHost.scrollTop = 0;
  window.scrollTo({ top: 0 });
  const ctx = {
    me: state.me,
    config: state.config || { genres: FALLBACK_GENRES, placements: [] },
    navigate: (target) => (location.hash = `#/${target}`),
  };

  if (name === "dashboard") renderDashboard(viewHost, ctx);
  else if (name === "content") renderContent(viewHost, ctx);
  else if (name === "ads") renderAds(viewHost, ctx);
  else if (name === "users") renderUsers(viewHost, ctx);
  else if (name === "vip") renderVip(viewHost, ctx);
  else if (name === "backups") renderBackups(viewHost, ctx);
  else if (name === "audit") renderAudit(viewHost, ctx);
  else if (name === "settings") renderSettings(viewHost, ctx);
}

/* ---------- Dashboard ---------- */

function renderDashboard(host, ctx) {
  let days = 14;
  let seq = 0;

  const chartHost = el("div", { class: "admin-chart-grid" });
  const cardsHost = el("div", { class: "admin-stats-grid" });
  const lowerHost = el("div", { class: "admin-dashboard-grid" });
  const statusHost = el("div", { class: "admin-dashboard-status" });

  const daysSelect = selectControl(
    [
      { value: "7", label: "7 kun" },
      { value: "14", label: "14 kun" },
      { value: "30", label: "30 kun" },
      { value: "90", label: "90 kun" },
    ],
    "14",
  );
  daysSelect.addEventListener("change", () => {
    days = Number(daysSelect.value) || 14;
    load();
  });
  const refreshButton = button("Yangilash", {
    iconName: "refresh",
    onClick: () => load(),
  });

  host.replaceChildren(
    pageHead({
      title: "Boshqaruv paneli",
      subtitle: "Haqiqiy baza ko'rsatkichlari: foydalanuvchilar, kontent, ko'rishlar va reklama.",
      actions: [daysSelect, refreshButton],
    }),
    statusHost,
    cardsHost,
    chartHost,
    lowerHost,
  );
  load();

  async function load() {
    const current = ++seq;
    refreshButton.disabled = true;
    statusHost.replaceChildren(loadingBlock("Statistika yuklanmoqda…"));
    cardsHost.replaceChildren();
    chartHost.replaceChildren();
    lowerHost.replaceChildren();
    try {
      const data = await api(`/admin/stats?days=${days}`);
      if (current !== seq) return;
      statusHost.replaceChildren();
      paint(data);
    } catch (error) {
      if (current !== seq) return;
      statusHost.replaceChildren(
        stateBlock({
          title: "Statistikani yuklab bo'lmadi",
          text: error.message,
          iconName: "warning",
          error: true,
          action: button("Qayta urinish", { variant: "btn--outline", onClick: load }),
        }),
      );
    } finally {
      if (current === seq) refreshButton.disabled = false;
    }
  }

  function paint(data) {
    const cards = data.cards || {};
    const daily = data.daily || { labels: [], users: [], views: [], impressions: [], clicks: [] };
    cardsHost.replaceChildren(
      statCard({
        label: "Foydalanuvchilar",
        value: formatNumber(cards.total_users),
        meta: `+${formatNumber(cards.new_users_7d)} / 7 kun`,
        iconName: "users",
      }),
      statCard({
        label: "Bugun faol",
        value: formatNumber(cards.active_users_today),
        meta: `+${formatNumber(cards.new_users_today)} yangi`,
        iconName: "trending",
        tone: "blue",
      }),
      statCard({
        label: "Kontent",
        value: formatNumber((cards.total_movies || 0) + (cards.total_series || 0)),
        meta: `${formatNumber(cards.published_content)} chop etilgan`,
        iconName: "film",
        tone: "violet",
      }),
      statCard({
        label: "Ko'rishlar",
        value: formatNumber(cards.total_views),
        meta: "Umumiy hisoblangan",
        iconName: "eye",
        tone: "green",
      }),
      statCard({
        label: "Reklama ko'rsatish",
        value: formatNumber(cards.ad_impressions),
        meta: `CTR ${cards.ad_ctr}%`,
        iconName: "megaphone",
        tone: "orange",
      }),
      statCard({
        label: "Reklama bosishlari",
        value: formatNumber(cards.ad_clicks),
        meta: "Tasdiqlangan bosishlar",
        iconName: "link",
        tone: "blue",
      }),
      statCard({
        label: "VIP obunachilar",
        value: formatNumber(cards.vip_subscribers),
        meta: cards.payment_configured ? "To'lov tizimi ulangan" : "To'lov sozlanmagan",
        iconName: "crown",
        tone: "violet",
      }),
      statCard({
        label: "To'langan summa",
        value: formatNumber(cards.revenue),
        meta: `${formatNumber(cards.paid_transactions)} to'lov`,
        iconName: "wallet",
        tone: "green",
      }),
    );

    chartHost.replaceChildren(
      panel(
        panelHead("Kunlik yangi foydalanuvchilar", `${days} kunlik oqim`),
        lineChart({
          labels: daily.labels,
          series: [{ name: "Yangi foydalanuvchilar", color: "#ff3341", values: daily.users }],
        }),
      ),
      panel(
        panelHead("Kunlik ko'rishlar", "Bezak ko'rishlar 30 daqiqa ichida bir marta hisoblanadi."),
        lineChart({
          labels: daily.labels,
          series: [{ name: "Ko'rishlar", color: "#6ea8fe", values: daily.views }],
        }),
      ),
      panel(
        panelHead("Reklama samaradorligi", "Ko'rsatish va bosishlar"),
        barChart({
          labels: daily.labels,
          series: [
            { name: "Ko'rsatish", color: "#ff3341", values: daily.impressions },
            { name: "Bosish", color: "#5ad1a5", values: daily.clicks },
          ],
        }),
      ),
    );

    const popular = data.popular || [];
    const popularPanel = panel(
      panelHead("Eng ko'p ko'rilgan", "Chop etilgan kontent", [
        button("Katalog", { variant: "btn--ghost", onClick: () => ctx.navigate("content") }),
      ]),
      popular.length
        ? el(
            "div",
            { class: "admin-popular" },
            ...popular.map((item, index) =>
              el(
                "a",
                {
                  class: "admin-popular__row",
                  href: `detail.html?id=${item.id}&preview=1`,
                  target: "_blank",
                  rel: "noopener",
                },
                el("span", { class: "admin-popular__rank", text: String(index + 1) }),
                el("img", { class: "admin-popular__poster", src: item.poster_url || "assets/posters/kinora-namuna.webp", alt: "" }),
                el(
                  "span",
                  { class: "admin-popular__info" },
                  el("strong", { text: item.title }),
                  el("span", { text: `${item.year || "—"} · ${item.kind === "series" ? "Serial" : "Film"}` }),
                ),
                el("span", { class: "admin-popular__views", text: formatNumber(item.views_count) }),
              ),
            ),
          )
        : el("p", { class: "admin-muted", text: "Ko'rishlar hali yo'q." }),
    );

    const recentUsers = data.recent_users || [];
    const usersPanel = panel(
      panelHead("So'nggi foydalanuvchilar", "Oxirgi faollik bo'yicha", [
        button("Barchasi", { variant: "btn--ghost", onClick: () => ctx.navigate("users") }),
      ]),
      recentUsers.length
        ? el(
            "div",
            { class: "admin-recent-users" },
            ...recentUsers.map((user) =>
              el(
                "div",
                { class: "admin-recent-users__row" },
                avatar(user, "sm"),
                el(
                  "div",
                  { class: "admin-recent-users__info" },
                  el("strong", { text: [user.first_name, user.last_name].filter(Boolean).join(" ") || "Nomsiz" }),
                  el("span", { text: user.username ? `@${user.username}` : `ID: ${user.telegram_id || "—"}` }),
                ),
                el("span", { class: "admin-recent-users__time", text: formatDate(user.last_seen_at, true) }),
              ),
            ),
          )
        : el("p", { class: "admin-muted", text: "Foydalanuvchilar yo'q." }),
    );

    const auditRows = (data.recent_audit || []).map((entry) => ({
      ...entry,
      actorLabel: entry.actor?.name || "Tizim",
    }));
    const auditPanel = panel(
      panelHead("So'nggi harakatlar", "Audit jurnali", [
        button("To'liq jurnal", { variant: "btn--ghost", onClick: () => ctx.navigate("audit") }),
      ]),
      table(
        [
          { label: "Vaqt", render: (row) => formatDate(row.created_at, true) },
          { label: "Aktor", key: "actorLabel" },
          { label: "Harakat", render: (row) => badge(row.action, "muted") },
          {
            label: "Obyekt",
            render: (row) => `${row.target_type || "—"}${row.target_id ? ` #${row.target_id}` : ""}`,
          },
        ],
        auditRows,
        { emptyText: "Admin harakatlari hali yo'q" },
      ),
    );

    lowerHost.replaceChildren(popularPanel, usersPanel, auditPanel);
  }
}

/* ---------- Start ---------- */

window.addEventListener("hashchange", () => {
  if (state.me) route();
});
backdrop?.addEventListener("click", () => toggleSidebar(false));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") toggleSidebar(false);
});

boot();
