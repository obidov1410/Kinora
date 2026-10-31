/* Kinora runtime config.
   Local development talks to http://127.0.0.1:8000 automatically.
   For GitHub Pages set the Render URL here (or define window.KINORA_API_BASE_URL
   before this script, or set the repository variable KINORA_API_BASE_URL for the
   Pages workflow, which replaces the placeholder below at build time).
   Never put BOT_TOKEN or any other secret in this file. */
(function () {
  const local = ["127.0.0.1", "localhost"].includes(location.hostname);
  const fallback = local ? "http://127.0.0.1:8000" : "https://YOUR-RENDER-SERVICE.onrender.com";
  window.KINORA_CONFIG = {
    API_BASE_URL: window.KINORA_API_BASE_URL || fallback,
    BOT_USERNAME: "KinoraTV_bot",
  };
})();
