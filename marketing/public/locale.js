// First visit to the root: send the reader to the page in their browser's language.
// Runs before first paint (external file: the CSP allows no inline scripts).
// Only "/" redirects; a link to a specific language (/en/) is always respected.
(function () {
  if (location.pathname !== "/") return;
  var supported = { es: "/", en: "/en/" };
  var wanted = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
  var target = "/en/"; // no supported match: English is the widest fallback
  for (var i = 0; i < wanted.length; i += 1) {
    var primary = String(wanted[i]).toLowerCase().split("-")[0];
    if (supported[primary]) { target = supported[primary]; break; }
  }
  if (target !== "/") location.replace(target + location.search + location.hash);
})();
