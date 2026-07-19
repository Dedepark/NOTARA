/* js/mood.js — Mood Tracker Module (offline-first) */
'use strict';
window.Notara = window.Notara || {};
window.Notara.MoodTracker = (() => {
  const Data = () => window.Notara.Data;
  const UI   = window.Notara.UI;

  const MOODS = [
    { value: 'very_happy', icon: 'ph-smiley-wink',  label: 'Hebat',  color: 'green' },
    { value: 'happy',      icon: 'ph-smiley',       label: 'Senang', color: 'blue' },
    { value: 'neutral',    icon: 'ph-smiley-meh',   label: 'Biasa',  color: 'yellow' },
    { value: 'sad',        icon: 'ph-smiley-sad',   label: 'Sedih',  color: 'orange' },
    { value: 'very_sad',   icon: 'ph-smiley-angry', label: 'Buruk',  color: 'red' },
  ];

  const TRIGGERS = [
    { value: 'Pekerjaan', icon: 'ph-briefcase', color: '#3b82f6' },
    { value: 'Kesehatan', icon: 'ph-heartbeat', color: '#ef4444' },
    { value: 'Keluarga', icon: 'ph-house', color: '#f97316' },
    { value: 'Teman', icon: 'ph-users-three', color: '#8b5cf6' },
    { value: 'Cuaca', icon: 'ph-sun', color: '#eab308' },
    { value: 'Lainnya', icon: 'ph-dots-three', color: '#6b7280' },
  ];

  function _today() { return new Date().toISOString().slice(0, 10); }

  function _moodIcon(moodValue, filled) {
    const m = MOODS.find(x => x.value === moodValue);
    if (!m) return '<i class="ph ph-question"></i>';
    return filled ? `<i class="ph-fill ${m.icon}"></i>` : `<i class="ph ${m.icon}"></i>`;
  }

  function _moodLabel(moodValue) {
    const m = MOODS.find(x => x.value === moodValue);
    return m ? m.label : moodValue;
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Data operations ────────────────────── */
  async function getToday()    { return Data().mood.getToday(); }
  async function getHistory(d) { return Data().mood.getHistory(d || 7); }
  async function save(mood, triggers, note) { return Data().mood.save(mood, triggers, note); }

  /* ── Page Render ── */
  async function renderPage() {
    const main = document.getElementById('app-main');
    UI.setTitle('Mood Tracker');
    UI.setActiveNav('mood');
    main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;

    const todayMood = await getToday();
    const history   = await getHistory();

    let html = '<div class="tracker-page page-enter">';
    html += `<div class="tracker-header"><h2><i class="ph ph-smiley"></i> Mood Tracker</h2></div>`;
    if (todayMood) { html += _renderSummary(todayMood); } else { html += _renderForm(); }
    html += _renderHistory(history);
    html += '</div>';
    main.innerHTML = html;

    if (!todayMood) _bindFormEvents();
    _bindChangeBtn();
  }

  function _renderForm() {
    const todayFmt = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    let html = `<div class="mood-form-card">`;
    html += `<div class="mood-question"><i class="ph ph-smiley" style="color:var(--accent)"></i> Bagaimana perasaanmu hari ini?</div>`;
    html += `<div class="mood-date-hint" style="text-align:center;font-size:0.75rem;color:var(--text-3);margin-bottom:var(--space-md)">${todayFmt}</div>`;
    html += `<div class="mood-picker" id="mood-picker">`;
    MOODS.forEach(m => {
      html += `<button class="mood-btn" data-mood="${m.value}" data-color="${m.color}">${_moodIcon(m.value, false)}<span>${m.label}</span></button>`;
    });
    html += `</div></div>`;

    html += `<div class="mood-form-card">`;
    html += `<div class="mood-triggers">`;
    html += `<div class="mood-triggers-label" id="mood-triggers-label"><i class="ph ph-push-pin"></i> Apa yang memengaruhi perasaanmu?</div>`;
    html += `<div class="mood-trigger-grid" id="mood-triggers">`;
    TRIGGERS.forEach(t => {
      html += `<button class="mood-trigger-btn" data-trigger="${t.value}" style="--trigger-clr:${t.color}"><i class="ph ${t.icon}"></i><span>${t.value}</span></button>`;
    });
    html += `</div></div>`;

    html += `<div class="mood-note">`;
    html += `<textarea id="mood-note" placeholder="Ada yang ingin dicatat? (opsional)" maxlength="200"></textarea>`;
    html += `</div>`;

    html += `<div class="mood-submit-row">`;
    html += `<button class="btn-primary" id="mood-save" disabled><i class="ph ph-check"></i> Simpan Mood</button>`;
    html += `</div></div>`;

    return html;
  }

  function _renderSummary(mood) {
    const moodColor = (MOODS.find(x => x.value === mood.mood) || {}).color || '';
    let html = `<div class="mood-summary">`;
    html += `<div class="mood-summary-icon" data-color="${moodColor}">${_moodIcon(mood.mood, true)}</div>`;
    html += `<div class="mood-summary-label">${_moodLabel(mood.mood)}</div>`;
    html += `<div class="mood-summary-date">Hari ini, ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>`;

    if (mood.triggers && mood.triggers.length > 0) {
      html += `<div class="mood-summary-triggers">`;
      mood.triggers.forEach(t => { html += `<span class="mood-summary-trigger">${_esc(t)}</span>`; });
      html += `</div>`;
    }
    if (mood.note) { html += `<div class="mood-summary-note">${_esc(mood.note)}</div>`; }

    html += `<div style="margin-top:var(--space-md)"><button class="btn-ghost" id="mood-change-btn"><i class="ph ph-pen"></i> Ubah Mood</button></div>`;
    html += `</div>`;
    return html;
  }

  function _renderHistory(history) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d    = new Date();
      d.setDate(d.getDate() - i);
      const iso  = d.toISOString().slice(0, 10);
      const entry = history.find(h => h.date === iso);
      const label = d.toLocaleDateString('id-ID', { weekday: 'short' });
      days.push({ iso, label, entry });
    }

    let html = `<div class="mood-history">`;
    html += `<div class="mood-history-title"><i class="ph ph-clock-counter-clockwise"></i> 7 Hari Terakhir</div>`;
    html += `<div class="mood-week-row">`;
    days.forEach(d => {
      html += `<div class="mood-day">`;
      html += `<div class="mood-day-label">${d.label}</div>`;
      if (d.entry) {
        const hColor = (MOODS.find(x => x.value === d.entry.mood) || {}).color || '';
        html += `<div class="mood-day-icon filled" data-color="${hColor}">${_moodIcon(d.entry.mood, true)}</div>`;
      } else {
        html += `<div class="mood-day-empty"></div>`;
      }
      html += `</div>`;
    });
    html += `</div></div>`;
    return html;
  }

  /* ── Event Binding ── */
  function _bindFormEvents() {
    let selectedMood = null;
    const selectedTriggers = new Set();

    const picker = document.getElementById('mood-picker');
    if (picker) {
      picker.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          picker.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          selectedMood = btn.dataset.mood;
          const label = document.getElementById('mood-triggers-label');
          if (label) {
            const moodData = MOODS.find(m => m.value === selectedMood);
            const moodWord = moodData ? moodData.label.toLowerCase() : 'begitu';
            label.innerHTML = `<i class="ph ph-push-pin"></i> Mengapa kamu merasa ${moodWord} hari ini?`;
          }
          _updateSaveBtn();
        });
      });
    }

    const triggerGrid = document.getElementById('mood-triggers');
    if (triggerGrid) {
      triggerGrid.querySelectorAll('.mood-trigger-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const isActive = btn.classList.toggle('active');
          const t = btn.dataset.trigger;
          const iconEl = btn.querySelector('i');
          const orig = TRIGGERS.find(x => x.value === t);
          if (isActive) {
            selectedTriggers.add(t);
            iconEl.className = 'ph ph-check-circle';
            btn.style.background = 'var(--bg)';
            btn.style.borderColor = 'var(--trigger-clr)';
            btn.style.color = 'var(--trigger-clr)';
            iconEl.style.color = 'var(--trigger-clr)';
          } else {
            selectedTriggers.delete(t);
            iconEl.className = 'ph ' + (orig ? orig.icon : 'ph-check');
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.style.color = '';
            iconEl.style.color = '';
          }
          void btn.offsetHeight;
        });
      });
    }

    document.getElementById('mood-save')?.addEventListener('click', async () => {
      if (!selectedMood) return;
      const btn = document.getElementById('mood-save');
      btn.disabled = true;
      btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Menyimpan...';
      try {
        const note = document.getElementById('mood-note')?.value?.trim() || '';
        await save(selectedMood, [...selectedTriggers], note);
        UI.toast('Mood tersimpan!', 'success');
        renderPage();
      } catch (err) {
        UI.toast('Gagal menyimpan: ' + err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-check"></i> Simpan Mood';
      }
    });
  }

  function _bindChangeBtn() {
    document.getElementById('mood-change-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('mood-change-btn');
      btn.disabled = true;
      btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
      try {
        await Data().mood.remove();
        renderPage();
      } catch (err) {
        UI.toast('Gagal: ' + err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-pen"></i> Ubah Mood';
      }
    });
  }

  function _updateSaveBtn() {
    const btn = document.getElementById('mood-save');
    if (btn) btn.disabled = !document.querySelector('.mood-btn.active');
  }

  return { renderPage, getToday, getHistory, save };
})();
