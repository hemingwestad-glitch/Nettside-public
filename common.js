/* hemingwestad.no — felles JS */

// Oppdater "sist oppdatert"-felter til dagens dato
(function updateDates() {
  document.querySelectorAll('[data-today]').forEach(el => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    el.textContent = `${yyyy}-${mm}-${dd}`;
  });
})();

// Faner: aktiver via [data-tab="X"] knapper og [data-panel="X"] paneler
(function initTabs() {
  document.querySelectorAll('.tabs').forEach(tabsEl => {
    const tabs = tabsEl.querySelectorAll('[data-tab]');
    const panels = document.querySelectorAll('[data-panel]');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach(t => t.classList.toggle('active', t === tab));
        panels.forEach(p => p.classList.toggle('active', p.dataset.panel === target));

        // Trigger en custom event så verktøy kan reagere på fanebytte
        window.dispatchEvent(new CustomEvent('tabchange', { detail: { tab: target }}));
      });
    });
  });
})();

// Hjelpefunksjoner globalt
window.HW = {
  fmt: {
    num: (n, dec = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(dec),
    int: n => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('nb-NO'),
    deg: (n, dec = 1) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(dec) + '°',
    km: n => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(0) + ' km',
    pct: n => (n == null || isNaN(n)) ? '—' : Math.round(n) + ' %',
    dt: d => {
      if (!d) return '—';
      const dd = (d instanceof Date) ? d : new Date(d);
      return dd.toLocaleString('nb-NO', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    },
    time: d => {
      if (!d) return '—';
      const dd = (d instanceof Date) ? d : new Date(d);
      return dd.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
    }
  },

  // Trondheim som default
  loc: { lat: 63.4305, lon: 10.3951, alt: 51.3, name: 'Trondheim' },

  // Liten event-bus for cross-tool kommunikasjon
  bus: new EventTarget()
};
