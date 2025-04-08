(function(back) {
  const SETTINGS_FILE = "salaatime.settings.json";

  // Defaults
  const DEFAULTS = {
    showHijri: true,
    showSeconds: false
  };

  // Helper function to load settings
  let loadSettings = function() {
    let settings = require("Storage").readJSON(SETTINGS_FILE, 1) || {};
    // Ensure all keys exist, assign default if not
    Object.keys(DEFAULTS).forEach(key => {
      if (settings[key] === undefined) {
        settings[key] = DEFAULTS[key];
      }
    });
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
      'Show Hijri': {
        value: settings.showHijri,
        format: v => v ? 'On' : 'Off',
        onchange: v => { settings.showHijri = v; saveSettings(settings); }
      },
      'Show Seconds': {
        value: settings.showSeconds,
        format: v => v ? 'On' : 'Off',
        onchange: v => { settings.showSeconds = v; saveSettings(settings); }
      }
      // Removed Lat, Lon, Calc Method, Asr Method, Hijri Offset menus
    };
    E.showMenu(menu);
  };

  showMainMenu();
})