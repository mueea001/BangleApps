(function(back) {
  const SETTINGS_FILE = "salaatime.settings.json";

  // Defaults, also used for validation
  const DEFAULTS = {
    lat: 51.24,
    lon: -0.17,
    calcMethod: "ISNA",
    asrMethod: "Standard",
    hijriOffset: 0,
    showHijri: true,
    showSeconds: false
  };

  // Prayer calculation methods supported by PrayTimes.js (customize if needed)
  const calcMethods = ["ISNA", "MWL", "Makkah", "Karachi", "Egyptian", "Tehran", "Jafari", "Custom"]; // Added Custom
  const asrMethods = ["Standard", "Hanafi"];

  // Helper function to load settings
  let loadSettings = function() {
    let settings = require("Storage").readJSON(SETTINGS_FILE, 1) || {};
    // Ensure all keys exist, assign default if not
    Object.keys(DEFAULTS).forEach(key => {
      if (settings[key] === undefined) {
        settings[key] = DEFAULTS[key];
      }
    });
    // Validate numeric fields
    settings.lat = parseFloat(settings.lat) || DEFAULTS.lat;
    settings.lon = parseFloat(settings.lon) || DEFAULTS.lon;
    settings.hijriOffset = parseInt(settings.hijriOffset) || DEFAULTS.hijriOffset;
    // Validate enum fields
    if (calcMethods.indexOf(settings.calcMethod) === -1) settings.calcMethod = DEFAULTS.calcMethod;
    if (asrMethods.indexOf(settings.asrMethod) === -1) settings.asrMethod = DEFAULTS.asrMethod;

    return settings;
  };

  // Helper function to save settings
  let saveSettings = function(settings) {
    require("Storage").writeJSON(SETTINGS_FILE, settings);
  };

  let settings = loadSettings();

  // Function to show the main menu
  let showMainMenu = function() {
    let menu = {
      '': { 'title': 'SalaaTime Settings' },
      '< Back': back,
      'Latitude': {
        value: settings.lat,
        min: -90, max: 90, step: 0.01, wrap: false,
        format: v => v.toFixed(2),
        onchange: v => { settings.lat = v; saveSettings(settings); }
      },
      'Longitude': {
        value: settings.lon,
        min: -180, max: 180, step: 0.01, wrap: false,
        format: v => v.toFixed(2),
        onchange: v => { settings.lon = v; saveSettings(settings); }
      },
      'Calc Method': {
        value: calcMethods.indexOf(settings.calcMethod),
        min: 0, max: calcMethods.length - 1, step: 1, wrap: true,
        format: v => calcMethods[v],
        onchange: v => { settings.calcMethod = calcMethods[v]; saveSettings(settings); }
      },
      'Asr Method': {
        value: asrMethods.indexOf(settings.asrMethod),
        min: 0, max: asrMethods.length - 1, step: 1, wrap: true,
        format: v => asrMethods[v],
        onchange: v => { settings.asrMethod = asrMethods[v]; saveSettings(settings); }
      },
      'Show Hijri': {
        value: settings.showHijri,
        format: v => v ? 'On' : 'Off',
        onchange: v => { settings.showHijri = v; saveSettings(settings); }
      },
      'Hijri Offset': {
        value: settings.hijriOffset,
        min: -5, max: 5, step: 1, wrap: false, // Adjust range if needed
        format: v => (v >= 0 ? '+' : '') + v + 'd',
        onchange: v => { settings.hijriOffset = v; saveSettings(settings); }
      },
      'Show Seconds': {
        value: settings.showSeconds,
        format: v => v ? 'On' : 'Off',
        onchange: v => { settings.showSeconds = v; saveSettings(settings); }
      }
    };
    E.showMenu(menu);
  };

  showMainMenu();
})
