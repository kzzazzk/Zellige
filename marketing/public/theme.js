// Runs before first paint (external file: the CSP allows no inline scripts).
// A saved choice wins; otherwise follow the system and keep following it.
(function () {
  var root = document.documentElement;
  var query = matchMedia("(prefers-color-scheme: dark)");
  var saved = null;
  try { saved = localStorage.getItem("zellige-theme"); } catch { /* storage blocked */ }
  root.classList.toggle("dark", saved ? saved === "dark" : query.matches);
  query.addEventListener("change", function (event) {
    var current = null;
    try { current = localStorage.getItem("zellige-theme"); } catch { /* storage blocked */ }
    if (!current) root.classList.toggle("dark", event.matches);
  });
})();
