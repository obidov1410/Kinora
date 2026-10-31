/* Admin: backups, audit trail and runtime settings. */
import { formatNumber, formatDate } from "./i18n.js";
import {
  api,
  badge,
  button,
  confirmAction,
  confirmDialog,
  downloadBackupFile,
  el,
  field,
  formActions,
  formGrid,
  iconButton,
  input,
  loadingBlock,
  pageHead,
  pagination,
  panel,
  panelHead,
  switchRow,
  table,
  textarea,
  toast,
  stateBlock,
} from "./admin-ui.js";

/* ---------- Backups ---------- */

export function renderBackups(container, context) {
  const listHost = el("div", { class: "admin-list-host" });
  const createButton = button("Zaxira nusxa yaratish", {
    variant: "btn--red",
    iconName: "database",
    onClick: async () => {
      createButton.disabled = true;
      try {
        const backup = await api("/admin/backups", { method: "POST" });
        toast(`Zaxira yaratildi: ${backup.name}`, "success");
        load();
      } catch (error) {
        toast(error.message, "error");
      } finally {
        createButton.disabled = false;
      }
    },
  });

  async function load() {
    listHost.replaceChildren(loadingBlock("Zaxira nusxalar yuklanmoqda…"));
    try {
      const data = await api("/admin/backups");
      paint(data.items || []);
    } catch (error) {
      listHost.replaceChildren(
        stateBlock({
          title: "Zaxira nusxalarni yuklab bo'lmadi",
          text: error.message,
          iconName: "warning",
          error: true,
          action: button("Qayta urinish", { variant: "btn--outline", onClick: load }),
        }),
      );
    }
  }

  function paint(items) {
    const columns = [
      {
        label: "Fayl",
        render: (item) =>
          el(
            "div",
            { class: "admin-backup-name" },
            el("strong", { text: item.name }),
            item.kind === "pre-restore" ? badge("Tiklashdan oldingi", "warning") : badge("Qo'lda", "muted"),
          ),
      },
      { label: "Hajmi", render: (item) => `${(item.bytes / 1024).toFixed(1)} KB` },
      {
        label: "Yaratilgan",
        render: (item) => (item.created_at ? formatDate(new Date(item.created_at * 1000).toISOString(), true) : "—"),
      },
      {
        label: "",
        className: "admin-table__actions",
        render: (item) =>
          el(
            "div",
            { class: "admin-row-actions" },
            iconButton("download", { label: "Yuklab olish", onClick: () => download(item) }),
            iconButton("arrowLeft", { label: "Tiklash", onClick: () => restore(item) }),
            iconButton("trash", {
              label: "O'chirish",
              variant: "admin-icon-btn--danger",
              onClick: () => remove(item),
            }),
          ),
      },
    ];
    listHost.replaceChildren(
      items.length
        ? table(columns, items, { emptyText: "Zaxira nusxalar yo'q" })
        : stateBlock({
            title: "Zaxira nusxalar yo'q",
            text: "Birinchi zaxira nusxasini yaratish uchun yuqoridagi tugmani bosing.",
            iconName: "database",
          }),
    );
  }

  async function download(item) {
    try {
      await downloadBackupFile(item.name);
      toast("Yuklab olish boshlandi", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function remove(item) {
    const ok = await confirmDialog({
      title: "Zaxira nusxasini o'chirish",
      body: `"${item.name}" fayli butunlay o'chiriladi.`,
      confirmText: "O'chirish",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/backups/${encodeURIComponent(item.name)}?confirm=true`, { method: "DELETE" });
      toast("Zaxira nusxa o'chirildi", "success");
      load();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function restore(item) {
    const ok = await confirmAction({
      title: "Ma'lumotlar bazasini tiklash",
      body: "Joriy baza tanlangan zaxira nusxa bilan almashtiriladi. Avtomatik 'pre-restore' nusxasi yaratiladi. Restore tugagach sahifa qayta yuklanadi.",
      confirmText: "Tiklash",
      danger: true,
      requireText: "RESTORE",
      requireHint: "Tasdiqlash uchun RESTORE deb yozing",
    });
    if (!ok) return;
    try {
      const result = await api(`/admin/backups/${encodeURIComponent(item.name)}/restore`, {
        method: "POST",
        body: { confirm: "RESTORE" },
      });
      toast(`Tiklandi. Xavfsizlik nusxasi: ${result.safety_backup}`, "success");
      setTimeout(() => window.location.reload(), 1400);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  container.replaceChildren(
    pageHead({
      title: "Zaxira nusxalar",
      subtitle: "SQLite bazasini yuklab olish, tiklash va saqlash.",
      actions: [createButton],
    }),
    el(
      "div",
      { class: "admin-note admin-note--warning" },
      el("strong", { text: "Muhim" }),
      el(
        "span",
        {},
        "Zaxira nusxalari faqat SQLite uchun ishlaydi va /var/data diskida saqlanadi. Render'da disk persistent bo'lishi shart. Zaxira fayllariga faqat adminlar kira oladi; ularni ommaviy joyga qo'ymang.",
      ),
    ),
    panel(
      panelHead("Mavjud nusxalar", "Qo'lda va tiklashdan oldingi nusxalar. Eski nusxalar BACKUP_RETENTION bo'yicha tozalanadi."),
      listHost,
    ),
  );
  load();
}

/* ---------- Audit ---------- */

export function renderAudit(container) {
  let page = 1;
  let action = "";
  const listHost = el("div", { class: "admin-list-host" });
  const filterInput = input({ type: "search", placeholder: "action, masalan content.create" });
  const filterButton = button("Filtrlash", {
    variant: "btn--outline",
    iconName: "search",
    onClick: () => {
      action = filterInput.value.trim();
      page = 1;
      load();
    },
  });
  filterInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") filterButton.click();
  });

  async function load() {
    listHost.replaceChildren(loadingBlock("Audit yozuvlari yuklanmoqda…"));
    const query = new URLSearchParams({ page: String(page), page_size: "30" });
    if (action) query.set("action", action);
    try {
      const data = await api(`/admin/audit?${query.toString()}`);
      const columns = [
        { label: "Vaqt", render: (row) => formatDate(row.created_at, true) },
        {
          label: "Aktor",
          render: (row) =>
            el(
              "div",
              { class: "admin-actor" },
              el("strong", { text: row.actor_name || "Tizim" }),
              el("span", { text: row.actor_username ? `@${row.actor_username}` : row.actor_telegram_id || "—" }),
            ),
        },
        { label: "Harakat", render: (row) => badge(row.action, "muted") },
        {
          label: "Obyekt",
          render: (row) => `${row.target_type || "—"}${row.target_id ? ` #${row.target_id}` : ""}`,
        },
        {
          label: "Tafsilot",
          render: (row) => {
            const text = row.details ? JSON.stringify(row.details) : "—";
            const code = el("code", { class: "admin-details-code", text: text.length > 90 ? `${text.slice(0, 90)}…` : text });
            code.title = text;
            return code;
          },
        },
      ];
      listHost.replaceChildren(
        table(columns, data.items || [], { emptyText: "Audit yozuvlari yo'q" }),
        pagination({
          page: data.page,
          pages: data.pages,
          total: data.total,
          onPage: (target) => {
            if (target < 1 || target > data.pages) return;
            page = target;
            load();
          },
        }),
      );
    } catch (error) {
      listHost.replaceChildren(
        stateBlock({
          title: "Auditni yuklab bo'lmadi",
          text: error.message,
          iconName: "warning",
          error: true,
          action: button("Qayta urinish", { variant: "btn--outline", onClick: load }),
        }),
      );
    }
  }

  container.replaceChildren(
    pageHead({
      title: "Audit jurnali",
      subtitle: "Har bir admin amali serverda yozib boriladi: kontent, reklama, foydalanuvchi, sozlama va zaxira.",
    }),
    panel(
      panelHead("Yozuvlar", "Action bo'yicha aniq filtr."),
      el("div", { class: "admin-toolbar" }, filterInput, filterButton),
      listHost,
    ),
  );
  load();
}

/* ---------- Settings ---------- */

export function renderSettings(container, context) {
  const bodyHost = el("div", { class: "admin-section-stack" });
  container.replaceChildren(
    pageHead({ title: "Sozlamalar", subtitle: "Sayt e'loni, VIP holati va server konfiguratsiyasi." }),
    bodyHost,
  );
  load();

  async function load() {
    bodyHost.replaceChildren(loadingBlock("Sozlamalar yuklanmoqda…"));
    try {
      const data = await api("/admin/settings");
      paint(data);
    } catch (error) {
      bodyHost.replaceChildren(
        stateBlock({
          title: "Sozlamalarni yuklab bo'lmadi",
          text: error.message,
          iconName: "warning",
          error: true,
          action: button("Qayta urinish", { variant: "btn--outline", onClick: load }),
        }),
      );
    }
  }

  function paint(data) {
    const runtime = data.runtime || {};
    const notice = textarea({ rows: 3, maxlength: "500", placeholder: "Saytda ko'rsatiladigan qisqa e'lon…" }, data.site_notice || "");
    const vipSwitch = switchRow("VIP bo'limi", data.vip_enabled, "Saytda VIP sahifasi va tariflar ko'rinadi");
    const saveButton = button("Saqlash", { variant: "btn--red" });
    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        await api("/admin/settings", {
          method: "PATCH",
          body: { site_notice: notice.value.trim(), vip_enabled: vipSwitch.input.checked },
        });
        toast("Sozlamalar saqlandi", "success");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        saveButton.disabled = false;
      }
    });

    const information = el(
      "div",
      { class: "admin-runtime-grid" },
      runtimeRow("Muhit", runtime.environment || "—"),
      runtimeRow("Telegram bot", runtime.telegram_configured ? `@${runtime.bot_username}` : "Sozlanmagan"),
      runtimeRow("Egasi Telegram ID", runtime.owner_id || "—"),
      runtimeRow("To'lov provayderi", runtime.payment_provider || "none"),
      runtimeRow("To'lov tayyor", runtime.payment_provider_configured ? "Ha" : "Yo'q"),
      runtimeRow("Dev login", runtime.dev_login_allowed ? "Yoqilgan (faqat dev)" : "O'chirilgan"),
      runtimeRow("Rate limit", runtime.rate_limit_enabled ? `${runtime.rate_limit_per_minute} so'rov/daqiqa` : "O'chirilgan"),
      runtimeRow("Maks. yuklash", `${runtime.max_upload_mb} MB`),
      runtimeRow("Zaxira intervali", runtime.backup_interval_hours ? `${runtime.backup_interval_hours} soat` : "Qo'lda"),
      runtimeRow("Sessiya muddati", `${runtime.session_ttl_hours} soat`),
      runtimeRow("Ma'lumotlar bazasi", runtime.data_backend === "sqlite" ? "SQLite (lokal fayl)" : "Tashqi baza"),
    );

    bodyHost.replaceChildren(
      panel(
        panelHead("Umumiy sozlamalar", "O'zgarishlar darhol saytga ta'sir qiladi va auditga yoziladi."),
        formGrid(field("Sayt e'loni", notice, { span: 2, hint: "Bo'sh qoldirsangiz e'lon ko'rsatilmaydi." })),
        el("div", { class: "admin-settings-row" }, vipSwitch, saveButton),
      ),
      panel(
        panelHead("Server konfiguratsiyasi", "Maxfiy qiymatlar (BOT_TOKEN, SECRET_KEY, to'lov kalitlari) bu yerda ko'rsatilmaydi."),
        information,
      ),
      panel(
        panelHead("Xavfsizlik eslatmalari"),
        el(
          "ul",
          { class: "admin-security-list" },
          el("li", { text: "Admin endpointlari har so'rovda bazadagi rolni tekshiradi." }),
          el("li", { text: "Telegram initData imzosi BOT_TOKEN bilan serverda tasdiqlanadi; brauzerdagi ID'ga ishonilmaydi." }),
          el("li", { text: "Rol o'zgartirish faqat egasi uchun ochiq." }),
          el("li", { text: "Barcha media va zaxira fayllari autentifikatsiya bilan himoyalangan." }),
        ),
      ),
    );
  }

  function runtimeRow(label, value) {
    return el("div", { class: "admin-runtime-row" }, el("span", { text: label }), el("strong", { text: String(value) }));
  }
}
