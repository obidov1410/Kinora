import { getMe, getToken, logout, updateLanguage } from "./api.js";
import { formatDate, formatNumber, setLang, t, getLang } from "./i18n.js";
import {
  $,
  avatar,
  confirmDialog,
  el,
  emptyState,
  errorState,
  icon,
  initShell,
  openAuthModal,
  toast,
} from "./ui.js";

initShell({ active: "profile.html" });
const host = $("#profile-content");
let me = null;

const roleLabel = (role) => t(role === "owner" ? "role_owner" : role === "admin" ? "role_admin" : "role_user");

function statTile(value, label) {
  return el(
    "div",
    { class: "stat-tile" },
    el("p", { class: "stat-tile__value", text: value }),
    el("p", { class: "stat-tile__label", text: label }),
  );
}

function languageSetting() {
  const select = el(
    "select",
    { class: "lang-select", attrs: { "aria-label": t("language_title") } },
    el("option", { value: "uz", text: t("lang_latin") }),
    el("option", { value: "uzc", text: t("lang_cyrillic") }),
  );
  select.value = getLang();
  select.addEventListener("change", async () => {
    setLang(select.value);
    await updateLanguage(select.value);
    toast(t("admin_saved"), "success");
  });
  return el(
    "div",
    { class: "setting-row" },
    el(
      "div",
      {},
      el("p", { class: "setting-row__title", text: t("language_title") }),
      el("p", { class: "setting-row__hint", text: t("language_hint") }),
    ),
    select,
  );
}

function logoutRow() {
  return el(
    "div",
    { class: "setting-row" },
    el(
      "div",
      {},
      el("p", { class: "setting-row__title", text: t("sign_out") }),
      el("p", { class: "setting-row__hint", text: t("logout_confirm_text") }),
    ),
    el(
      "button",
      {
        class: "btn btn--outline btn--sm",
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
          toast(t("sign_out_done"));
          window.dispatchEvent(new CustomEvent("kinora:auth-changed", { detail: null }));
          window.location.href = "index.html";
        },
      },
      icon("logout"),
      el("span", { text: t("sign_out") }),
    ),
  );
}

function render() {
  if (!me) return;
  const canAdmin = me.role === "admin" || me.role === "owner";
  const badges = el("div", { class: "profile-card__badges" });
  badges.append(el("span", { class: "badge badge--muted", text: roleLabel(me.role) }));
  if (me.is_vip) badges.append(el("span", { class: "badge badge--success", text: t("vip_badge") }));
  if (me.is_blocked) badges.append(el("span", { class: "badge badge--danger", text: t("blocked_badge") }));

  const card = el(
    "div",
    { class: "profile-card" },
    avatar(me, "xl"),
    el("h2", { class: "profile-card__name", text: [me.first_name, me.last_name].filter(Boolean).join(" ") || t("viewer") }),
    el("p", { class: "profile-card__username", text: me.username ? `@${me.username}` : `ID ${me.telegram_id || "—"}` }),
    badges,
    el(
      "div",
      { class: "profile-card__actions" },
      el("a", { class: "btn btn--red btn--sm", href: "favorites.html" }, icon("heart"), el("span", { text: t("open_favorites") })),
      el("a", { class: "btn btn--outline btn--sm", href: "vip.html" }, icon("star"), el("span", { text: t("nav_vip") })),
      canAdmin
        ? el("a", { class: "btn btn--outline btn--sm", href: "admin.html" }, icon("spark"), el("span", { text: t("nav_admin") }))
        : null,
    ),
  );

  const stats = el(
    "div",
    { class: "stats-grid" },
    statTile(formatNumber(me.visit_count || 0), t("visits")),
    statTile(formatNumber(me.favorites_count || 0), t("favorites_count")),
    statTile(me.is_vip ? t("active") : t("vip_inactive"), t("nav_vip")),
    statTile(me.role === "owner" || me.role === "admin" ? roleLabel(me.role) : t("viewer"), t("role")),
  );

  const meta = el("dl", { class: "meta-list" });
  for (const [label, value] of [
    [t("telegram_id"), me.telegram_id || "—"],
    [t("role"), roleLabel(me.role)],
    [t("member_since"), formatDate(me.created_at)],
    [t("last_seen"), formatDate(me.last_seen_at, true)],
    [t("vip_until_label"), me.vip_until ? formatDate(me.vip_until) : t("vip_inactive")],
  ]) {
    meta.append(el("div", {}, el("dt", { text: label }), el("dd", { text: String(value) })));
  }

  host.replaceChildren(
    el(
      "div",
      { class: "profile-grid" },
      card,
      el(
        "div",
        { class: "profile-panels" },
        el("div", { class: "panel" }, el("h2", { class: "panel__title", text: t("profile_sub") }), stats),
        el("div", { class: "panel" }, el("h2", { class: "panel__title", text: t("detail_meta") }), meta),
        el(
          "div",
          { class: "panel" },
          el("h2", { class: "panel__title", text: t("settings_title") }),
          languageSetting(),
          logoutRow(),
        ),
      ),
    ),
  );
}

function renderGate() {
  host.replaceChildren();
  emptyState(host, {
    title: t("auth_required_title"),
    text: t("profile_login_hint"),
    actionLabel: t("sign_in"),
    onAction: () => openAuthModal({ onSuccess: () => load() }),
    iconName: "user",
  });
}

async function load() {
  if (!getToken()) {
    renderGate();
    return;
  }
  host.replaceChildren(
    el(
      "div",
      { class: "state-block" },
      el("div", { class: "spinner", attrs: { role: "status", "aria-label": t("loading") } }),
      el("p", { class: "state-block__title", text: t("loading") }),
    ),
  );
  try {
    me = await getMe(true);
    if (!me) {
      renderGate();
      return;
    }
    render();
  } catch (error) {
    if (error.status === 401) renderGate();
    else errorState(host, error.message || t("error_generic"), () => load());
  }
}

window.addEventListener("kinora:auth-changed", () => load());
window.addEventListener("kinora:auth-cleared", () => {
  me = null;
  renderGate();
});
window.addEventListener("kinora:lang", () => {
  if (me) render();
  else if (!getToken()) renderGate();
});

load();
