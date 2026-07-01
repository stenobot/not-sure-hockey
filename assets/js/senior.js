/* Senior tracker — mirrors Junior tracker but stores a separate selection key */
(function () {
  'use strict';

  var STORAGE_KEY = 'nsh-senior-holder';
  var STORAGE_TIMESTAMP_KEY = 'nsh-senior-holder-at';
  var ROSTER_URL = '/data/13343/roster.json';
  var OVERRIDE_URL = '/data/senior-override.json';

  function readSaved() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function readSavedTimestamp() {
    try { return localStorage.getItem(STORAGE_TIMESTAMP_KEY); } catch (e) { return null; }
  }

  function writeSaved(name) {
    try {
      var now = new Date().toISOString();
      if (name) {
        localStorage.setItem(STORAGE_KEY, name);
        localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
      }
    } catch (e) {
      /* storage unavailable — selection still works for the session */
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function resolveSelected(override) {
    var saved = readSaved();
    var savedTimestamp = readSavedTimestamp();
n    if (!override || !override.name) return saved;
n    if (saved && savedTimestamp) {
      if (new Date(savedTimestamp) > new Date(override.setAt)) {
        return saved;
      }
    }
n    return override.name;
  }

  function render(list, names, override) {
    var selected = resolveSelected(override);
    list.innerHTML = names.map(function (name) {
      var on = name === selected;
      var safe = escapeHtml(name);
      return '<li><button type="button" class="junior-name' +
        (on ? ' is-selected' : '') + '" data-name="' + safe +
        '" aria-pressed="' + (on ? 'true' : 'false') + '">' + safe + '</button></li>';
    }).join('');
  }

  function wire(list) {
    list.addEventListener('click', function (evt) {
      var btn = evt.target.closest('.junior-name');
      if (!btn || !list.contains(btn)) return;

      var buttons = list.querySelectorAll('.junior-name');
      var turningOn = !btn.classList.contains('is-selected');
      buttons.forEach(function (b) {
        var on = turningOn && b === btn;
        b.classList.toggle('is-selected', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      writeSaved(turningOn ? btn.dataset.name : null);
    });
  }

  function init() {
    var list = document.getElementById('junior-list');
    if (!list) return;
n    Promise.all([
      fetch(ROSTER_URL, { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }),
      fetch(OVERRIDE_URL, { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) return null;
          return r.json();
        })
        .catch(function () { return null; })
    ])
      .then(function (results) {
        var data = results[0];
        var override = results[1];
n        var names = (data.players || [])
          .map(function (p) { return p.name; })
          .filter(Boolean)
          .sort(function (a, b) { return a.localeCompare(b); });
        if (!names.length) {
          list.innerHTML = '<li class="junior-status">No roster available.</li>';
          return;
        }
        render(list, names, override);
        wire(list);
      })
      .catch(function (err) {
        list.innerHTML = '<li class="junior-status">Couldn\u2019t load the roster.</li>';
        if (window.console) console.warn('[senior] load failed:', err.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
