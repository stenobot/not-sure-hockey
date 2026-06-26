/* Junior tracker — renders the team roster from data and lets one member claim
   Junior. The selection is single-select and persisted in localStorage. */
(function () {
  'use strict';

  var STORAGE_KEY = 'nsh-junior-holder';
  var ROSTER_URL = '/data/13343/roster.json';

  function readSaved() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function writeSaved(name) {
    try {
      if (name) localStorage.setItem(STORAGE_KEY, name);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* storage unavailable (e.g. private mode) — selection still works for the session */
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(list, names) {
    var saved = readSaved();
    list.innerHTML = names.map(function (name) {
      var on = name === saved;
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

    fetch(ROSTER_URL, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var names = (data.players || [])
          .map(function (p) { return p.name; })
          .filter(Boolean)
          .sort(function (a, b) { return a.localeCompare(b); });
        if (!names.length) {
          list.innerHTML = '<li class="junior-status">No roster available.</li>';
          return;
        }
        render(list, names);
        wire(list);
      })
      .catch(function (err) {
        list.innerHTML = '<li class="junior-status">Couldn\u2019t load the roster.</li>';
        if (window.console) console.warn('[junior] roster load failed:', err.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
