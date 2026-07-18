/* js/mood.js — Mood Tracker Module */
'use strict';
window.Notara = window.Notara || {};
window.Notara.MoodTracker = (() => {
  const db = () => window.Notara.db;
  const UI = window.Notara.UI;
  const Au = window.Notara.Auth;

  const MOODS = [
    { value: 'very_happy', icon: 'ph-smiley-wink',  label: 'Hebat',  color: 'green' },
    { value: 'happy',      icon: 'ph-smiley',       label: 'Senang', color: 'blue' },
    { value: 'neutral',    icon: 'ph-smiley-meh',   label: 'Biasa',  color: 'yellow' },
    { value: 'sad',        icon: 'ph-smiley-sad',   label: 'Sedih',  color: 'orange' },
    { value: 'very_sad',   icon: 'ph-smiley-angry', label: 'Buruk',  color: 'red' },
  ];

  const TRIGGERS = ['Pekerjaan', 'Kesehatan', 'Keluarga', 'Teman', 'Cuaca', 'Lainnya'];

  function _userId() { return Au.getUser()?.id; }
  function _today() { return new Date().toISOString().slice(0, 10); }

  function _moodIcon(moodValue, filled) {
    const m = MOODS.find(x => x.value === moodValue);
    if (!m) return '<i class="ph ph-question"></i>';
    return filled
      ? `<i class="ph-fill ${m.icon}"></i>`
      : `<i class="ph ${m.icon}"></i>`;
  }

  function _moodLabel(moodValue) {
    const m = MOODS.find(x => x.value === moodValue);
    return m ? m.label : moodValue;
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Supabase CRUD ── */
  async function getToday(userId) {
    const uid = userId || _userId();
    if (!uid) return null;
    const { data, error } = await db()
      .from('mood_entries')
      .select('*')
      .eq('user_id', uid)
      .eq('date', _today())
      .maybeSingle();
    if (error) { console.warn('[Mood] getToday error:', error.message); return null; }
    return data || null;
  }

  async function getHistory(userId, days = 7) {
    const uid = userId || _userId();
    if (!uid) return [];
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    const startStr = start.toISOString().slice(0, 10);
    const { data, error } = await db()
      .from('mood_entries')
      .select('*')
      .eq('user_id', uid)
      .gte('date', startStr)
      .lte('date', _today())
      .order('date', { ascending: true });
    if (error) { console.warn('[Mood] getHistory error:', error.message); return []; }
    return data || [];
  }

  async function save(userId, mood, triggers, note) {
    const uid = userId || _userId();
    if (!uid) throw new Error('User not logged in');
    const today = _today();
    const { data, error } = await db()
      .from('mood_entries')
      .upsert({
        user_id: uid,
        date: today,
        mood: mood,
        triggers: triggers || [],
        note: note || '',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /* ── Page Render ── */
  async function renderPage() {
    const main = document.getElementById('app-main');
    UI.setTitle('Mood Tracker');
    UI.setActiveNav('mood');
    main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;

    const todayMood = await getToday();
    const history = await getHistory();

    let html = '<div class="tracker-page page-enter">';
    html += `<div class="tracker-header"><h2><i class="ph ph-smiley"></i> Mood Tracker</h2></div>`;

    if (todayMood) {
      html += _renderSummary(todayMood);
    } else {
      html += _renderForm();
    }

    html += _renderHistory(history);
    html += '</div>';
    main.innerHTML = html;

    if (!todayMood) {
      _bindFormEvents();
    }
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
    html += `</div>`;

    html += `<div class="mood-triggers">`;
    html += `<div class="mood-triggers-label"><i class="ph ph-push-pin"></i> Pemicu (opsional)</div>`;
    html += `<div class="mood-trigger-grid" id="mood-triggers">`;
    TRIGGERS.forEach(t => {
      html += `<button class="mood-trigger-btn" data-trigger="${t}">${t}</button>`;
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
      mood.triggers.forEach(t => {
        html += `<span class="mood-summary-trigger">${_esc(t)}</span>`;
      });
      html += `</div>`;
    }

    if (mood.note) {
      html += `<div class="mood-summary-note">${_esc(mood.note)}</div>`;
    }

    html += `<div style="margin-top:var(--space-md)"><button class="btn-ghost" id="mood-change-btn"><i class="ph ph-pen"></i> Ubah Mood</button></div>`;
    html += `</div>`;

    return html;
  }

  function _renderHistory(history) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
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
          _updateSaveBtn();
        });
      });
    }

    const triggerGrid = document.getElementById('mood-triggers');
    if (triggerGrid) {
      triggerGrid.querySelectorAll('.mood-trigger-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          btn.classList.toggle('active');
          const t = btn.dataset.trigger;
          if (selectedTriggers.has(t)) selectedTriggers.delete(t);
          else selectedTriggers.add(t);
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
        await save(null, selectedMood, [...selectedTriggers], note);
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
      const uid = _userId();
      if (!uid) { UI.toast('Login dulu', 'warning'); return; }
      const btn = document.getElementById('mood-change-btn');
      btn.disabled = true;
      btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
      try {
        const { error } = await db().from('mood_entries').delete().eq('user_id', uid).eq('date', _today());
        if (error) throw error;
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
