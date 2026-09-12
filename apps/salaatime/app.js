// Prayer Times Watchface for Bangle.js 2
// Fetches from Masjid Al-Yaqeen API, caches the last result for offline use.
const CACHE_FILE = "prayertimes.json";
var prayerData = null;
var drawTimeout; // Used for syncing minutes
var settings = Object.assign({ showHijri: true }, require("Storage").readJSON("salaatime.settings.json", true) || {});

function toMins(t) {
  if (!t) return 0;
  var s = t.split(":");
  return parseInt(s[0]) * 60 + parseInt(s[1]);
}

function fmt12(t) {
  if (!t) return "--:--";
  var s = t.split(":");
  var h = parseInt(s[0]);
  var m = s[1];
  h = h % 12 || 12;
  return h + ":" + m;
}

function loadCache() {
  prayerData = require("Storage").readJSON(CACHE_FILE, 1);
}

// True when we have no usable data, or the cached data is not from today
function isStale() {
  if (!prayerData || !prayerData.fetchedAt) return true;
  var d = new Date(prayerData.fetchedAt);
  var now = new Date();
  return d.getFullYear() !== now.getFullYear() ||
         d.getMonth() !== now.getMonth() ||
         d.getDate() !== now.getDate();
}

function fetchPrayers() {
  Bangle.http("https://masjidalyaqeen.co.uk/wp-json/dpt/v1/prayertime?filter=today", { timeout: 10000 }).then(data => {
    try {
      var json = JSON.parse(data.resp);
      prayerData = json[0];
      prayerData.fetchedAt = Date.now();
      require("Storage").writeJSON(CACHE_FILE, prayerData);
      queueDraw(); // Redraw immediately with new data
    } catch (e) { console.log("Parse Error", e); }
  }).catch(err => { console.log("Conn Error", err); });
}

function draw() {
  var d = new Date();
  var nowMins = d.getHours() * 60 + d.getMinutes();
  var w = g.getWidth();
  var h = g.getHeight();
  var stale = isStale();

  g.reset().setColor(g.theme.bg).fillRect(Bangle.appRect);

  // 1. Digital Clock (12h)
  var hh = d.getHours();
  var mm = d.getMinutes();
  var timeStr = (hh % 12 || 12) + ":" + ("0" + mm).slice(-2);
  g.setFont("Vector", 44).setFontAlign(0, -1).setColor(g.theme.fg);
  g.drawString(timeStr, w/2, 5);

  // 2. Gregorian Date
  g.setFont("6x8", 1.5).drawString(require("locale").date(d, 1), w/2, 52);

  if (prayerData) {
    if (settings.showHijri && prayerData.hijri_date_convert) {
      g.setFont("6x8", 1).setColor(0, 1, 0).drawString(prayerData.hijri_date_convert, w/2, 70);
    }

    var tomFajr = (prayerData.tomorrow) ? toMins(prayerData.tomorrow.fajr_begins) : toMins(prayerData.fajr_begins);

    var prayers = [
      { label: "Fajr", b: "fajr_begins",    j: "fajr_jamah",    e: "sunrise" },
      { label: "Zuhr", b: "zuhr_begins",    j: "zuhr_jamah",    e: "asr_mithl_1" },
      { label: "Asr",  b: "asr_mithl_1",    j: "asr_jamah",     e: "maghrib_begins" },
      { label: "Magh", b: "maghrib_begins", j: "maghrib_begins", e: "isha_begins" },
      { label: "Isha", b: "isha_begins",    j: "isha_jamah",    e: "tomorrow" }
    ];

    var yPos = 88;
    for (var i = 0; i < prayers.length; i++) {
      var p = prayers[i];
      if (!p.b || !prayerData[p.b]) continue; // Skip if data missing

      var pStart = toMins(prayerData[p.b]);
      var pEnd = (p.e === "tomorrow") ? tomFajr : toMins(prayerData[p.e]);

      var isCurrent = false;
      var minsLeft = 0;

      if (p.label === "Isha") {
        isCurrent = (nowMins >= pStart || nowMins < pEnd);
        minsLeft = (nowMins >= pStart) ? (1440 - nowMins + pEnd) : (pEnd - nowMins);
      } else {
        isCurrent = (nowMins >= pStart && nowMins < pEnd);
        minsLeft = pEnd - nowMins;
      }

      var col = stale ? "#888" : g.theme.fg;
      if (!stale && isCurrent) {
        col = "#0F0";
        if (minsLeft <= 10) col = "#F80";
      }

      g.setColor(col).setFont("6x8", 2);
      g.setFontAlign(-1, -1).drawString(p.label, 20, yPos);
      g.setFontAlign(1, -1).drawString(fmt12(prayerData[p.j]), w - 20, yPos);
      yPos += 17;
    }
  } else {
    g.setFont("6x8", 1).setFontAlign(0, -1).setColor(g.theme.fg);
    g.drawString("No Data. Syncing...", w/2, 110);
  }

  // Subtle indicator when the shown times are not from today
  if (stale && prayerData) {
    g.setFont("6x8", 1).setFontAlign(0, 1).setColor("#888").drawString("STALE", w/2, h - 2);
  }
}

// Logic to sync the draw call with the start of the next minute
function queueDraw() {
  if (drawTimeout) clearTimeout(drawTimeout);
  draw();
  // Calculate ms until the start of the next minute
  drawTimeout = setTimeout(queueDraw, 60000 - (Date.now() % 60000));
}

var fetchInterval = setInterval(fetchPrayers, 3600000);

Bangle.setUI({
  mode: "clock",
  remove: function() {
    if (drawTimeout) clearTimeout(drawTimeout);
    if (fetchInterval) clearInterval(fetchInterval);
  }
});

loadCache();
if (isStale()) fetchPrayers();
queueDraw(); // Start the synced loop