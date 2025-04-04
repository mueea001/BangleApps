/*
* SalaaTime - Islamic Prayer Times Watch Face for Bangle.js 2
*
* Requires: PrayTimes.js library in storage.
* Settings configured via salaatime.settings.json
*/

const PrayTimes = require("PrayTimes"); // Load the library
const Storage = require("Storage");
const locale = require("locale");
const W = g.getWidth(); // 176
const H = g.getHeight(); // 176

// --- Settings ---
let settings = Object.assign({
  // Default values, will be overwritten by saved settings
  lat: 51.24,
  lon: -0.17,
  calcMethod: "ISNA",
  asrMethod: "Standard",
  hijriOffset: 0,
  showHijri: true,
  showSeconds: false
}, Storage.readJSON("salaatime.settings.json", true) || {});

// Prayer time names mapping
const prayerNames = {
  fajr: "Fajr",
  sunrise: "Shuruq", // Using 'sunrise' as key from PrayTimes.js
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
  // midnight: "Midnight" // PrayTimes might also provide this
};
const prayerKeys = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]; // Order for display

// --- State Variables ---
let currentPrayerTimes = {};
let nextPrayerInfo = { name: "...", time: "--:--", iso: null };
let timeToNextPrayer = "";
let lastUpdateDate = "";
let drawTimeout;
let showSeconds = settings.showSeconds;

// --- Prayer Time Calculation ---
function calculatePrayerTimes(date) {
  // Set calculation method in PrayTimes object
  let pt = new PrayTimes(settings.calcMethod);
  pt.adjust({ asr: settings.asrMethod });
  // Adjust tuning manually if needed (example: pt.tune({fajr: 2});)

  // Get timezone offset in hours for PrayTimes.js
  // getTimezoneOffset() returns minutes WEST of UTC, PrayTimes wants hours EAST of UTC
  const tzOffset = -date.getTimezoneOffset() / 60;

  console.log(`Calculating times for ${date.toISOString().substr(0,10)} at ${settings.lat},${settings.lon}, TZ:${tzOffset}, Method:${settings.calcMethod}, Asr:${settings.asrMethod}`);

  try {
    currentPrayerTimes = pt.getTimes(date, [settings.lat, settings.lon], tzOffset, 'auto', '24h'); // Use 24h format internally
    console.log("Times:", currentPrayerTimes);
    lastUpdateDate = date.toISOString().substr(0, 10); // Store date as YYYY-MM-DD
  } catch (e) {
    console.log("Error calculating prayer times:", e);
    // Handle error - maybe display a message?
    E.showAlert("Prayer Time Calc Error").then(()=>load()); // Basic error alert
    currentPrayerTimes = {}; // Clear times on error
  }
}

// --- Hijri Date Calculation (Basic Placeholder) ---
// For accurate Hijri, you'd need a dedicated library or more complex logic.
// This version uses a rough estimate based on offset from a known date.
// A dedicated Bangle.js Hijri module would be better.
function getHijriDate(date, offset) {
  if (!settings.showHijri) return "";

  // VERY rough estimate - replace with a proper library if possible
  // This is just an example and likely inaccurate over time.
  const epoch = new Date(2000, 0, 1); // Reference Gregorian date
  const hijriEpoch = { year: 1420, month: 9, day: 23 }; // Corresponding rough Hijri date
  const daysDiff = Math.round((date - epoch) / (1000 * 60 * 60 * 24));
  const LUNAR_YEAR_DAYS = 354.367;
  const LUNAR_MONTH_DAYS = 29.53;

  let totalHijriDays = hijriEpoch.day + (hijriEpoch.month * LUNAR_MONTH_DAYS) + ((hijriEpoch.year - 1) * LUNAR_YEAR_DAYS) + daysDiff + offset;

  let hYear = Math.floor(totalHijriDays / LUNAR_YEAR_DAYS) + 1;
  let daysInYear = totalHijriDays % LUNAR_YEAR_DAYS;
  let hMonth = Math.floor(daysInYear / LUNAR_MONTH_DAYS) + 1;
  let hDay = Math.floor(daysInYear % LUNAR_MONTH_DAYS) + 1;

  // Basic validation/clamping
  hYear = Math.max(1, hYear);
  hMonth = Math.max(1, Math.min(12, hMonth));
  hDay = Math.max(1, Math.min(30, hDay)); // Max 30 for simplicity

  const hijriMonths = ["Muh", "Saf", "Rb1", "Rb2", "Jm1", "Jm2", "Raj", "Shb", "Ram", "Shw", "DhQ", "DhH"]; // Abbreviated

  // Ensure hMonth index is valid
  const monthIndex = Math.max(0, Math.min(11, hMonth - 1));

  return `${hDay} ${hijriMonths[monthIndex]} ${hYear}`;
}

// --- Update Logic ---
function findNextPrayer() {
  const now = new Date();
  const nowTimeStr = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);
  let nextPrayer = null;
  let nextPrayerTimeStr = null;
  let nextPrayerISO = null;

  // Ensure currentPrayerTimes is populated
  if (!currentPrayerTimes || Object.keys(currentPrayerTimes).length === 0) {
      console.log("No prayer times available to find next.");
      nextPrayerInfo = { name: "Error", time: "--:--", iso: null };
      timeToNextPrayer = "Calc Error";
      return;
  }

  // Iterate through the defined prayer keys in order
  for (const key of prayerKeys) {
    const prayerTimeStr = currentPrayerTimes[key]; // e.g., "16:45"
    if (!prayerTimeStr) continue; // Skip if time is missing

    if (prayerTimeStr > nowTimeStr) {
      nextPrayer = prayerNames[key];
      nextPrayerTimeStr = prayerTimeStr;
      break; // Found the first prayer after the current time
    }
  }

  // If no prayer found for today (e.g., after Isha), the next is Fajr tomorrow
  if (!nextPrayer) {
    nextPrayer = prayerNames.fajr;
    // Need to calculate tomorrow's Fajr time
    let tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    let pt = new PrayTimes(settings.calcMethod);
    pt.adjust({ asr: settings.asrMethod });
    const tzOffset = -tomorrow.getTimezoneOffset() / 60;
    let tomorrowTimes = pt.getTimes(tomorrow, [settings.lat, settings.lon], tzOffset, 'auto', '24h');
    nextPrayerTimeStr = tomorrowTimes.fajr;

    // Construct ISO time for tomorrow's Fajr
    const [hours, minutes] = nextPrayerTimeStr.split(':').map(Number);
    nextPrayerISO = new Date(tomorrow);
    nextPrayerISO.setHours(hours, minutes, 0, 0);

  } else {
     // Construct ISO time for today's next prayer
     const [hours, minutes] = nextPrayerTimeStr.split(':').map(Number);
     nextPrayerISO = new Date(now);
     nextPrayerISO.setHours(hours, minutes, 0, 0);
  }


  nextPrayerInfo = {
    name: nextPrayer,
    time: formatTime(nextPrayerTimeStr), // Format HH:MM using locale pref if needed
    iso: nextPrayerISO
  };

  // Calculate time remaining
  if (nextPrayerInfo.iso) {
    let diffMillis = nextPrayerInfo.iso - now;
    if (diffMillis < 0) {
        // This can happen briefly around midnight or if calculations are slightly off
        diffMillis += 24 * 60 * 60 * 1000; // Add a day
    }
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

  } else {
      timeToNextPrayer = "...";
  }
}

function checkDateAndUpdateTimes() {
  const today = new Date();
  const todayStr = today.toISOString().substr(0, 10);

  // If the date has changed, or if prayer times are empty, recalculate
  if (todayStr !== lastUpdateDate || Object.keys(currentPrayerTimes).length === 0) {
    console.log("Date changed or times empty, recalculating...");
    calculatePrayerTimes(today);
    findNextPrayer(); // Update next prayer immediately after recalculation
  } else {
      // Only update next prayer info if date hasn't changed
      findNextPrayer();
  }
}


// --- Drawing Functions ---
function formatTime(timeStr) {
  // Basic formatting, assumes timeStr is "HH:MM" (24h)
  // Adapt if locale requires AM/PM
   if (!timeStr || typeof timeStr !== 'string') return "--:--";
   const parts = timeStr.split(':');
   if (parts.length !== 2) return "--:--";
   // Could add 12h formatting here if desired, using locale settings
   return timeStr;
}

function draw() {
  const now = new Date();
  // Check if we need to recalculate times (date change)
  checkDateAndUpdateTimes();

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
  g.drawString(timeStr, 20, 28); // Adjust position as needed

  // Date
  let dateStr = locale.date(now, 0).toUpperCase(); // Short date format e.g. FRI 4 APR
  g.setFont("6x8", 2);
  g.setFontAlign(1, -1); // Right aligned top
  g.drawString(dateStr, W - 10, 30);

  // --- Middle Area: Next Prayer ---
  g.setFontAlign(0, 0); // Center aligned middle
  g.setFont("Vector", 22);
  g.drawString(`Next: ${nextPrayerInfo.name}`, W / 2, 75);

  g.setFont("Vector", 24);
  g.drawString(nextPrayerInfo.time, W / 2, 100);

  g.setFont("Vector", 20);
  g.setColor(g.theme.fg); // Potentially change color based on proximity
  // Example: Highlight if less than 30 mins
  if (nextPrayerInfo.iso && (nextPrayerInfo.iso - now) < 30 * 60 * 1000 && (nextPrayerInfo.iso - now) > 0) {
      g.setColor("#FFAA00"); // Orange/Yellow
  }
  g.drawString(`(${timeToNextPrayer})`, W / 2, 122);

  // --- Bottom Area: Prayer List & Hijri ---
  g.setFontAlign(-1, -1); // Left aligned bottom
  g.setColor(g.theme.fg);
  g.setFont("6x8", 1.5); // Slightly smaller font for the list

  const listY = 140; // Starting Y position for the list
  const listX1 = 10;
  const listX2 = 95; // Column 2 start
  const listLineHeight = 12;

  let count = 0;
  for (const key of prayerKeys) {
      let time = formatTime(currentPrayerTimes[key]);
      let name = prayerNames[key];
      let x = (count % 2 === 0) ? listX1 : listX2;
      let y = listY + Math.floor(count / 2) * listLineHeight;
      g.drawString(`${name} ${time}`, x, y);
      count++;
  }

  // Optional Hijri Date
  if (settings.showHijri) {
    g.setFontAlign(0, 1); // Center aligned bottom
    g.setFont("6x8", 1);
    let hijriStr = getHijriDate(now, settings.hijriOffset);
    g.drawString(hijriStr, W / 2, H - 5); // Position at the very bottom
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
    draw();
  }, delay);
}

// --- Initial Setup ---
g.clear(); // Clear screen once
Bangle.loadWidgets(); // Load status widgets (battery, etc.)

// Initial calculation and draw
calculatePrayerTimes(new Date()); // Calculate times for today
findNextPrayer(); // Find the first prayer
draw(); // Draw immediately

// Stop updates when lock screen is shown, restart when unlocked
Bangle.on('lock', locked => {
  if (drawTimeout) clearTimeout(drawTimeout);
  drawTimeout = undefined;
  if (!locked) {
    // Recalculate and draw immediately on unlock
    checkDateAndUpdateTimes();
    draw();
  }
});

// Set up the UI - needed for widgets, lock events etc.
Bangle.setUI("clock"); // Set clock mode

// No need for Bangle.drawWidgets() within the draw() function here
// if we draw the clock content *first* then call Bangle.drawWidgets() once
// Or, if widgets area is respected (e.g. using Bangle.appRect)
// For simplicity, drawing widgets after clock face elements:
Bangle.drawWidgets();
