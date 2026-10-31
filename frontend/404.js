import { t, applyTranslations } from "./i18n.js";
import { initShell } from "./ui.js";

initShell({ active: "" });

function retranslate() {
  applyTranslations();
  document.title = `KINORA — ${t("page_404_title")}`;
}

retranslate();
window.addEventListener("kinora:lang", retranslate);
