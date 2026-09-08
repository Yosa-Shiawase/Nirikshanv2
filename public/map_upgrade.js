/* Basemap switcher + labels — injected without touching app.js */
(function () {
  function boot() {
    if (typeof L === "undefined" || typeof map === "undefined" || !map) return setTimeout(boot, 300);
    var esri = "https://server.arcgisonline.com/ArcGIS/rest/services/";
    var dark    = L.tileLayer(esri+"Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {maxZoom:16, attribution:"ESRI"});
    var sat     = L.tileLayer(esri+"World_Imagery/MapServer/tile/{z}/{y}/{x}", {maxZoom:18, attribution:"ESRI Imagery"});
    var streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, attribution:"© OpenStreetMap"});
    var labels  = L.tileLayer(esri+"Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {maxZoom:18});
    L.control.layers(
      { "Dark Ops (ESRI)": dark, "Satellite (ESRI)": sat, "Streets (OSM)": streets },
      { "Place Labels": labels },
      { position: "topleft", collapsed: true }
    ).addTo(map);
    L.control.scale({ imperial:false, position:"bottomleft" }).addTo(map);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
