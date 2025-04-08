/*
* SalaaTime (API) - Islamic Prayer Times Watch Face for Bangle.js 2
*
* Fetches times from Masjid Al-Yaqeen API.
* Requires Bluetooth connection to phone w/ Internet via Gadgetbridge.
* Settings configured via salaatime.settings.json
*/

// Removed: const PrayTimes = require("PrayTimes");
const Storage = require("Storage");
const locale = require("locale");
const W = g.getWidth(); // 176
const H = g.getHeight(); // 176

// API Endpoint
const API_URL = "https://masjidalyaqeen.co.uk/wp-json/dpt/v1/prayertime?&filter=today";

// --- Settings ---
let settings = Object.assign({
  // Default values, will be overwritten by saved settings
  showHijri: true,
  showSeconds: false
}, Storage.readJSON("salaatime.settings.json", true) || {});

// Map API fields to display names and internal keys
// Using `*_begins` for main times, `sunrise` as is.
const prayerMap = {
  fajr: { name: "Fajr", apiField: "fajr_begins" },
  shuruq: { name: "Shuruq", apiField: "sunrise" },
  dhuhr: { name: "Dhuhr", apiField: "zuhr_begins" },
  asr: { name: "Asr", apiField: "asr_mithl_1" }, // Using Asr Mithl 1
  maghrib: { name: "Maghrib", apiField: "maghrib_begins" },
  isha: { name: "Isha", apiField: "isha_begins" },
};
const prayerKeys = ["fajr", "shuruq", "dhuhr", "asr", "maghrib", "isha"]; // Order for display

// --- State Variables ---
let currentPrayerTimes = {}; // Stores HH:MM strings {fajr:"04:40", sunrise:"06:20", ...}
let nextPrayerInfo = { name: "...", time: "--:--", iso: null };
let timeToNextPrayer = "Loading...";
let hijriDateStr = ""; // Store Hijri string from API
let lastFetchDate = ""; // Store YYYY-MM-DD of last successful fetch
let fetchStatus = "Idle"; // Idle, Loading, Error, OK
let drawTimeout;
let showSeconds = settings.showSeconds;

// --- Helper: Format HH:MM:SS to HH:MM ---
function formatHHMM(timeStr) {
  if (typeof timeStr === 'string' && timeStr.length >= 5) {
    return timeStr.substring(0, 5);
  }
  return "--:--";
}

// --- API Fetching ---
function fetchAndUpdateTimes() {
  if (fetchStatus === "Loading") return; // Don't fetch if already fetching

  console.log("Attempting to fetch prayer times from API...");
  fetchStatus = "Loading";
  timeToNextPrayer = "Loading..."; // Update display status
  draw(); // Show "Loading..." message

  Bangle.http(API_URL, { timeout: 15000 }) // 15 second timeout
    .then(response => {
      try {
        // The response is text, needs parsing
        let data = JSON.parse(response);
        console.log("API Response OK");

        if (!data || !Array.isArray(data) || data.length === 0) {
          throw new Error("API response is empty or invalid format");
        }

        let todayData = data[0]; // Get the first (and likely only) object

        // Update prayer times
        currentPrayerTimes = {}; // Clear old times
        let allTimesFound = true;
        for (const key of prayerKeys) {
          const field = prayerMap[key].apiField;
          if (todayData[field]) {
            currentPrayerTimes[key] = formatHHMM(todayData[field]);
          } else {
            console.log(`Warning: Missing time for ${key} (field: ${field})`);
            currentPrayerTimes[key] = "--:--";
            allTimesFound = false;
          }
        }

        // Update Hijri Date
        hijriDateStr = settings.showHijri ? (todayData.hijri_date_convert || "Hijri N/A") : "";

        lastFetchDate = todayData.d_date || new Date().toISOString().substr(0, 10); // Store fetch date

        // Calculate next prayer based on fetched times
        findNextPrayerFromList(); // Use our own calculation from the list

        console.log("Prayer times updated successfully.");
        fetchStatus = allTimesFound ? "OK" : "Partial"; // Mark as partial if any time was missing
        draw(); // Redraw with updated times

      } catch (e) {
        console.log("Error processing API data:", e);
        fetchStatus = "Error";
        timeToNextPrayer = "API Error";
        draw(); // Show error
      }
    })
    .catch(err => {
      console.log("Error fetching API:", err);
      fetchStatus = "Error";
      timeToNextPrayer = "No Conn"; // More user friendly error
      // Optionally keep stale data? For now, show error.
      // currentPrayerTimes = {}; // Clear times on error? Maybe not.
      draw(); // Show error
    });
}

// --- Update Logic (Calculate Next Prayer from our stored list) ---
function findNextPrayerFromList() {
  const now = new Date();
  const nowTimeStr = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);
  let nextPrayerKey = null;
  let nextPrayerTimeStr = null;
  let nextPrayerISO = null;

  // Ensure currentPrayerTimes is populated
  if (!currentPrayerTimes || Object.keys(currentPrayerTimes).length === 0) {
      console.log("No prayer times available to find next.");
      nextPrayerInfo = { name: "N/A", time: "--:--", iso: null };
      timeToNextPrayer = fetchStatus === "Loading" ? "Loading..." : "Error";
      return;
  }

  // Iterate through the defined prayer keys in order
  for (const key of prayerKeys) {
    const prayerTimeStr = currentPrayerTimes[key]; // e.g., "16:45"
    if (!prayerTimeStr || prayerTimeStr === "--:--") continue; // Skip if time is missing/invalid

    // Skip sunrise as a target "next prayer"
    if (key === "shuruq") continue;

    if (prayerTimeStr > nowTimeStr) {
      nextPrayerKey = key;
      nextPrayerTimeStr = prayerTimeStr;
      break; // Found the first prayer after the current time
    }
  }

  // If no prayer found for today (e.g., after Isha), the next is Fajr tomorrow
  if (!nextPrayerKey) {
    nextPrayerKey = "fajr";
    // Need tomorrow's Fajr time. API *might* provide it in 'tomorrow' object
    // but let's rely on fetching fresh data tomorrow instead of storing complex state.
    // For now, just display Fajr name, time will update after midnight fetch.
    nextPrayerTimeStr = currentPrayerTimes.fajr || "--:--"; // Use today's Fajr as placeholder
    nextPrayerISO = null; // Can't reliably calculate ISO for tomorrow without full data
    timeToNextPrayer = "After Isha"; // Indicate state

  } else {
     // Construct ISO time for today's next prayer
     const [hours, minutes] = nextPrayerTimeStr.split(':').map(Number);
     nextPrayerISO = new Date(now);
     nextPrayerISO.setHours(hours, minutes, 0, 0);

     // Calculate time remaining ONLY if we have an ISO date
     let diffMillis = nextPrayerISO - now;
     if (diffMillis < 0) diffMillis = 0; // Should not happen if logic is correct

     let diffMins = Math.ceil(diffMillis / (60 * 1000)); // Round up minutes
     let diffHrs = Math.floor(diffMins / 60);
     diffMins = diffMins % 60;

     if (diffHrs > 0) {
       timeToNextPrayer = `-${diffHrs}h ${diffMins}m`;
     } else if (diffMins > 0) {
        timeToNextPrayer = `-${diffMins}m`;
     } else {
        timeToNextPrayer = "Now"; // Or handle start of prayer time
     }
  }

  nextPrayerInfo = {
    name: prayerMap[nextPrayerKey]?.name || "N/A", // Get display name
    time: nextPrayerTimeStr, // Already HH:MM
    iso: nextPrayerISO
  };

}

// --- Check Date and Trigger Fetch ---
function checkDateAndFetch() {
  const today = new Date();
  const todayStr = today.toISOString().substr(0, 10);

  // If the date has changed, or fetch status is error/idle, or no date stored, fetch.
  if (todayStr !== lastFetchDate || fetchStatus === "Error" || fetchStatus === "Idle" || !lastFetchDate) {
    console.log(`Date changed (${lastFetchDate} -> ${todayStr}) or status needs fetch (${fetchStatus}). Fetching...`);
    fetchAndUpdateTimes(); // This will also trigger findNextPrayer and draw
  } else {
    // Date is same and fetch was OK, just recalculate next prayer based on current time
    findNextPrayerFromList();
    // Need to trigger draw manually if only recalculating next prayer
    // unless called from draw() itself. Add a condition or call draw() here?
    // It's called within draw() usually, so this might be redundant,
    // but safer to ensure next prayer updates every minute via the draw cycle.
  }
}

// --- Drawing Functions ---
function draw() {
  const now = new Date();
  // Check if we need to fetch new data (or retry)
  checkDateAndFetch(); // This might change fetchStatus/prayer times

  // Only recalculate the next prayer display string if fetch isn't running
  if (fetchStatus !== "Loading") {
     findNextPrayerFromList();
  }

  // Clear background
  g.reset();
  g.setColor(g.theme.bg);
  g.fillRect(Bangle.appRect);

  // --- Top Area: Time, Date, Status ---
  g.setFontAlign(-1, -1); // Left aligned top
  g.setColor(g.theme.fg);

  // Time
  let timeStr = locale.time(now, 1); // HH:MM
  if (showSeconds) {
      timeStr += ":" + ("0"+now.getSeconds()).slice(-2);
      g.setFont("Vector", 36); // Adjust size for seconds
  } else {
       g.setFont("Vector", 42); // Larger font without seconds
  }
   // Adjust Y position slightly higher
  g.drawString(timeStr, 15, 26); // Position for time

  // Date
  let dateStr = locale.date(now, 0).toUpperCase(); // Short date format e.g. TUE 8 APR
  g.setFont("6x8", 2);
  g.setFontAlign(1, -1); // Right aligned top
  // Adjust X slightly left, Y slightly higher
  g.drawString(dateStr, W - 8, 28);

   // Add API Status Indicator near date? Optional.
   let statusColor = g.theme.fg;
   if (fetchStatus === "Error" || fetchStatus === "Partial") statusColor = "#F00"; // Red
   else if (fetchStatus === "Loading") statusColor = "#FF0"; // Yellow
   g.setColor(statusColor);
   g.setFont("6x8", 1);
   g.drawString(timeToNextPrayer === "No Conn" ? "NOCON" : fetchStatus, W-8, 42); // Show status under date
   g.setColor(g.theme.fg); // Reset color


  // --- Middle Area: Next Prayer ---
  g.setFontAlign(0, 0); // Center aligned middle
  g.setFont("Vector", 22);
  g.drawString(`Next: ${nextPrayerInfo.name}`, W / 2, 75);

  g.setFont("Vector", 24);
  g.drawString(nextPrayerInfo.time, W / 2, 100);

  g.setFont("Vector", 20);
  g.setColor(g.theme.fg);
  // Highlight if time remaining is short and positive (use ISO for check)
  if (fetchStatus === "OK" && nextPrayerInfo.iso && (nextPrayerInfo.iso - now) < 30 * 60 * 1000 && (nextPrayerInfo.iso - now) > 0) {
      g.setColor("#FFAA00"); // Orange/Yellow
  } else if (fetchStatus !== "OK" && fetchStatus !== "Partial") {
      g.setColor("#AAA"); // Grey out if loading/error
  }
  g.drawString(`(${timeToNextPrayer})`, W / 2, 122);
  g.setColor(g.theme.fg); // Reset color

  // --- Bottom Area: Prayer List & Hijri ---
  g.setFontAlign(-1, -1); // Left aligned bottom
  g.setColor(g.theme.fg);
  g.setFont("6x8", 1.5); // Slightly smaller font for the list

  const listY = 140;
  const listX1 = 10;
  const listX2 = 95;
  const listLineHeight = 12;

  let count = 0;
  for (const key of prayerKeys) {
      let time = currentPrayerTimes[key] || "--:--"; // Use stored HH:MM time
      let name = prayerMap[key].name;
      let x = (count % 2 === 0) ? listX1 : listX2;
      let y = listY + Math.floor(count / 2) * listLineHeight;
      // Grey out times if fetch failed?
      if (fetchStatus !== "OK" && fetchStatus !== "Partial") g.setColor("#AAA");
      g.drawString(`${name} ${time}`, x, y);
      g.setColor(g.theme.fg); // Reset color
      count++;
  }

  // Optional Hijri Date
  if (settings.showHijri && hijriDateStr) {
    g.setFontAlign(0, 1); // Center aligned bottom
    g.setFont("6x8", 1);
    // Grey out if fetch failed?
    if (fetchStatus !== "OK" && fetchStatus !== "Partial") g.setColor("#AAA");
    // Shorten Hijri string if too long?
    let displayHijri = hijriDateStr;
    if (displayHijri.length > 25) displayHijri = displayHijri.substr(0, 24) + "..."; // Example shortening
    g.drawString(displayHijri, W / 2, H - 5);
    g.setColor(g.theme.fg); // Reset color
  }

  // Queue next draw
  queueDraw();
}

// --- Scheduling ---
function queueDraw() {
  if (drawTimeout) clearTimeout(drawTimeout);
  // Calculate time until the next minute or second change
  let millis = showSeconds ? 1000 : 60000;
  let delay = millis - (Date.now() % millis);
  drawTimeout = setTimeout(() => {
    drawTimeout = undefined;
    draw(); // Calls checkDateAndFetch -> findNextPrayer -> redraws
  }, delay);
}

// --- Initial Setup ---
g.clear(); // Clear screen once
//Bangle.loadWidgets(); // Load status widgets (battery, etc.)

// Initial fetch and draw
fetchAndUpdateTimes(); // Start the first fetch

// Stop updates when lock screen is shown, restart when unlocked
Bangle.on('lock', locked => {
  if (drawTimeout) clearTimeout(drawTimeout);
  drawTimeout = undefined;
  if (!locked) {
    // Check if fetch needed and redraw immediately on unlock
    checkDateAndFetch(); // Will trigger fetch if needed
    draw(); // Draw immediately (might show Loading... initially)
  }
});

// Set up the UI - needed for widgets, lock events etc.
Bangle.setUI("clock"); // Set clock mode

// Draw widgets after clock face elements
//Bangle.drawWidgets();