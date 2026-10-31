import { fetchPublicVip, fetchSubscription, getToken, getMe, startCheckout } from "./api.js";
import { formatDate, formatPrice, localized, t } from "./i18n.js";
import {
  $,
  el,
  emptyState,
  errorState,
  icon,
  initShell,
  openAuthModal,
  toast,
} from "./ui.js";

initShell({ active: "vip.html" });
const host = $("#vip-content");
let state = { publicVip: null, subscription: null, me: null };
let loading = true;

function statusBlock({ warning = false, success = false, title, text }) {
  return el(
    "div",
    { class: "vip-status" },
    icon(warning ? "warning" : success ? "check" : "info"),
    el("div", {}, el("strong", { text: title }), el("span", { text: text })),
  );
}

function planCard(plan, index, publicVip) {
  const active = Boolean(state.me?.is_vip || state.subscription?.is_vip);
  const buyLabel = !state.me
    ? t("telegram_login_needed")
    : publicVip.payment_configured
      ? active
        ? t("vip_already_active")
        : t("vip_buy")
      : t("buy_disabled");
  const buy = el(
    "button",
    {
      class: "btn btn--red btn--wide",
      type: "button",
      disabled: Boolean(state.me && !publicVip.payment_configured),
      title: !publicVip.payment_configured ? t("vip_payment_body") : undefined,
    },
    el("span", { text: buyLabel }),
  );
  buy.addEventListener("click", async () => {
    if (!state.me) {
      openAuthModal({ onSuccess: () => load() });
      return;
    }
    if (!publicVip.payment_configured) return;
    buy.disabled = true;
    try {
      const result = await startCheckout(plan.id);
      if (result?.checkout_url) {
        window.location.href = result.checkout_url;
        return;
      }
      toast(t("checkout_error"), "error");
    } catch (error) {
      toast(error.message || t("checkout_error"), "error");
    } finally {
      buy.disabled = false;
    }
  });

  const benefits = (plan.benefits || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const list = el("ul", { class: "vip-plan__benefits" });
  for (const benefit of benefits) {
    list.append(el("li", {}, icon("check"), el("span", { text: benefit })));
  }

  return el(
    "article",
    { class: `vip-plan ${index === 1 ? "vip-plan--featured" : ""}` },
    el("h3", { class: "vip-plan__name", text: localized(plan, "name") }),
    el("p", { class: "vip-plan__price", text: formatPrice(plan.price, plan.currency) }),
    el("p", { class: "vip-plan__days", text: t("vip_days", { days: plan.days }) }),
    benefits.length ? list : null,
    buy,
  );
}

function render() {
  if (loading) {
    host.replaceChildren(
      el(
        "div",
        { class: "state-block" },
        el("div", { class: "spinner", attrs: { role: "status", "aria-label": t("loading") } }),
        el("p", { class: "state-block__title", text: t("loading") }),
      ),
    );
    return;
  }
  const data = state.publicVip || { enabled: false, payment_configured: false, plans: [] };
  const sub = state.subscription;
  const isVip = Boolean(state.me?.is_vip || sub?.is_vip);
  const vipUntil = state.me?.vip_until || sub?.vip_until;

  const hero = el(
    "section",
    { class: "vip-hero" },
    el(
      "span",
      { class: "vip-hero__badge" },
      icon("star"),
      el("span", { text: "KINORA VIP" }),
    ),
    el("h1", { class: "vip-hero__title", text: t("vip_title") }),
    el("p", { class: "vip-hero__text", text: t("vip_sub") }),
    !data.enabled
      ? el(
          "div",
          { class: "vip-plans" },
          el(
            "div",
            { class: "vip-plan" },
            el("h3", { class: "vip-plan__name", text: t("vip_disabled_title") }),
            el("p", { class: "vip-plan__days", style: "margin-top: 4px;", text: t("vip_disabled_body") }),
            el("a", { class: "btn btn--outline", href: "browse.html", text: t("browse_catalog") }),
          ),
        )
      : el(
          "div",
          { class: "vip-plans" },
          ...(data.plans || []).map((plan, index) => planCard(plan, index, data)),
        ),
  );

  const content = [hero];

  if (data.enabled) {
    if (isVip) {
      content.push(
        statusBlock({
          success: true,
          title: t("vip_active_title"),
          text: vipUntil ? t("vip_active_until", { date: formatDate(vipUntil) }) : t("vip_sub"),
        }),
      );
    } else if (!state.me) {
      content.push(
        statusBlock({
          title: t("telegram_login_needed"),
          text: t("vip_login_required"),
        }),
      );
    }
    if (!data.payment_configured) {
      content.push(
        statusBlock({
          warning: true,
          title: t("vip_payment_title"),
          text: t("vip_payment_body"),
        }),
      );
    } else {
      content.push(
        statusBlock({
          title: t("payment_configured"),
          text: t("payment_ready_note"),
        }),
      );
    }
    if ((data.plans || []).length === 0) {
      const holder = el("div");
      emptyState(holder, {
        title: t("no_data"),
        text: t("no_data_hint"),
        actionLabel: t("browse_catalog"),
        actionHref: "browse.html",
        iconName: "star",
      });
      content.push(holder);
    }
  } else if (sub && !data.enabled) {
    content.push(
      statusBlock({
        title: t("vip_disabled_title"),
        text: t("vip_disabled_body"),
      }),
    );
  }

  host.replaceChildren(...content);
}

async function load() {
  loading = true;
  render();
  try {
    const publicVip = await fetchPublicVip();
    let subscription = null;
    let me = null;
    if (getToken()) {
      try {
        me = await getMe(true);
        subscription = await fetchSubscription();
      } catch (error) {
        if (error.status !== 401) throw error;
      }
    }
    state = { publicVip, subscription, me };
    loading = false;
    render();
  } catch (error) {
    loading = false;
    errorState(host, error.message || t("error_generic"), () => load());
  }
}

window.addEventListener("kinora:auth-changed", () => load());
window.addEventListener("kinora:lang", () => {
  if (!loading) render();
});
load();
