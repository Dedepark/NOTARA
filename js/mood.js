/* js/mood.js — Mood Tracker Module */
'use strict';
window.Notara = window.Notara || {};
window.Notara.MoodTracker = (() => {
  const db   = () => window.Notara.db;
  const Auth = () => window.Notara.Auth;
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
  function _userId() { return Auth()?.getUser()?.id; }
  function _uuid() { return crypto.randomUUID(); }
  function _now()  { return new Date().toISOString(); }

  let _calYear = new Date().getFullYear();
  let _calMonth = new Date().getMonth();
  let _selectedCalDate = null;

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

  async function getToday() {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const today = _today();
    const { data, error } = await db().from('mood_entries')
      .select('*')
      .eq('user_id', uid)
      .eq('date', today);
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  }

  async function getHistory(days = 7) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);
    const { data, error } = await db().from('mood_entries')
      .select('*')
      .eq('user_id', uid)
      .gte('date', sinceStr)
      .order('date', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function getMonthEntries(year, month) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const { data, error } = await db().rpc('get_mood_calendar_data', {
      p_user_id: uid,
      p_year: year,
      p_month: month + 1,
    });
    if (error) throw error;
    return (data || []).map(row => ({
      date: row.entry_date,
      mood: row.mood,
      triggers: row.triggers,
      note: row.note,
    }));
  }

  async function save(moodValue, triggers, note) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const today = _today();
    const existing = await getToday();
    const entry = {
      id: existing?.id || _uuid(),
      user_id: uid,
      date: today,
      mood: moodValue,
      triggers: triggers || [],
      note: note || null,
      created_at: existing?.created_at || _now(),
      updated_at: _now(),
    };
    const { error } = await db().from('mood_entries').upsert(entry, { onConflict: 'user_id,date' });
    if (error) throw error;
    return entry;
  }

  async function remove() {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const today = _today();
    const { error } = await db().from('mood_entries')
      .delete()
      .eq('user_id', uid)
      .eq('date', today);
    if (error) throw error;
  }

  async function renderPage() {
    const main = document.getElementById('app-main');
    UI.setTitle('Mood Tracker');
    UI.setActiveNav('mood');
    main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;

    const todayMood = await getToday();

    let html = '<div class="tracker-page page-enter">';
    html += `<div class="tracker-header"><h2><i class="ph ph-smiley"></i> Mood Tracker</h2></div>`;
    if (todayMood) { html += _renderSummary(todayMood); } else { html += _renderForm(); }
    html += `<div id="mood-weekly-chart-wrap"></div>`;
    html += `<div id="mood-calendar-wrap"></div>`;
    html += `<div id="mood-detail-wrap"></div>`;
    html += '</div>';
    main.innerHTML = html;

    if (!todayMood) _bindFormEvents();
    _bindChangeBtn();

    const chartWrap = document.getElementById('mood-weekly-chart-wrap');
    if (chartWrap) chartWrap.innerHTML = _renderWeeklyChart();
    _drawMoodChart();

    const calWrap = document.getElementById('mood-calendar-wrap');
    if (calWrap) calWrap.innerHTML = await _renderCalendar();

    _bindCalendarEvents();
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

  function _renderWeeklyChart() {
    return `<div class="mood-chart-wrap"><div class="mood-chart-title"><i class="ph ph-chart-bar"></i> Grafik 7 Hari</div><canvas id="mood-weekly-chart" style="width:100%;height:150px"></canvas></div>`;
  }

  async function _drawMoodChart() {
    const canvas = document.getElementById('mood-weekly-chart');
    if (!canvas) return;
    const history = await getHistory(7);
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const moodColorMap = { very_happy: '#4caf82', happy: '#3b82f6', neutral: '#eab308', sad: '#f97316', very_sad: '#ef4444' };
    const moodValues = { very_happy: 5, happy: 4, neutral: 3, sad: 2, very_sad: 1 };

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const entry = history.find(h => h.date === iso);
      const label = d.toLocaleDateString('id-ID', { weekday: 'short' });
      days.push({ iso, label, entry });
    }

    const padding = { top: 10, bottom: 30, left: 10, right: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barW = chartW / 7 * 0.6;
    const gap = chartW / 7;

    const getCSVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const text3 = getCSVar('--text-3') || '#666';

    ctx.font = '600 10px var(--font-body, sans-serif)';
    ctx.textAlign = 'center';

    days.forEach((day, i) => {
      const x = padding.left + i * gap + gap / 2;
      const val = day.entry ? moodValues[day.entry.mood] || 3 : 0;
      const maxVal = 5;
      const barH = val > 0 ? (val / maxVal) * chartH : 0;
      const y = padding.top + chartH - barH;

      if (val > 0) {
        const color = moodColorMap[day.entry.mood] || text3;
        ctx.fillStyle = color;
        ctx.beginPath();
        const r = 3;
        ctx.moveTo(x - barW / 2 + r, y);
        ctx.arcTo(x + barW / 2, y, x + barW / 2, y + barH, r);
        ctx.arcTo(x + barW / 2, y + barH, x - barW / 2, y + barH, r);
        ctx.arcTo(x - barW / 2, y + barH, x - barW / 2, y, r);
        ctx.arcTo(x - barW / 2, y, x + barW / 2, y, r);
        ctx.fill();
      } else {
        ctx.fillStyle = text3;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(x - barW / 2, padding.top + chartH - 4, barW, 4);
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = text3;
      ctx.fillText(day.label, x, h - 8);
    });
  }

  async function _renderCalendar() {
    const entries = await getMonthEntries(_calYear, _calMonth);
    const entryMap = {};
    entries.forEach(e => { entryMap[e.date] = e; });

    const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    const todayStr = _today();

    const firstDay = new Date(_calYear, _calMonth, 1);
    const lastDay = new Date(_calYear, _calMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    let html = '<div class="mood-calendar">';
    html += `<div class="habit-week-title"><i class="ph ph-calendar-blank"></i> ${monthNames[_calMonth]} ${_calYear}</div>`;
    html += '<div class="mood-calendar-nav" style="display:flex;justify-content:space-between;margin-bottom:var(--space-md)">';
    html += '<button class="icon-btn" id="mood-cal-prev" style="width:28px;height:28px"><i class="ph ph-caret-left"></i></button>';
    html += `<span style="font-size:0.85rem;font-weight:800;color:var(--text-1)">${monthNames[_calMonth]} ${_calYear}</span>`;
    html += '<button class="icon-btn" id="mood-cal-next" style="width:28px;height:28px"><i class="ph ph-caret-right"></i></button>';
    html += '</div>';

    html += '<div class="mood-calendar-grid">';
    dayNames.forEach(d => {
      html += `<div class="mood-calendar-header">${d}</div>`;
    });

    for (let i = 0; i < startOffset; i++) {
      html += '<div class="mood-calendar-day empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${_calYear}-${String(_calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const entry = entryMap[dateStr];
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === _selectedCalDate;

      html += `<div class="mood-calendar-day" data-date="${dateStr}" ${isToday ? 'data-today="true"' : ''} ${isSelected ? 'data-selected="true"' : ''}>`;
      html += `<span class="mood-calendar-day-num">${day}</span>`;
      if (entry) {
        const mc = (MOODS.find(x => x.value === entry.mood) || {}).color || '';
        html += `<div class="mood-calendar-day-icon" data-color="${mc}">${_moodIcon(entry.mood, true)}</div>`;
      }
      html += '</div>';
    }

    html += '</div></div>';
    return html;
  }

  async function _renderDayDetail(dateStr) {
    const uid = _userId();
    const { data: entries } = await db().from('mood_entries')
      .select('*')
      .eq('user_id', uid)
      .eq('date', dateStr);

    const entry = entries && entries.length > 0 ? entries[0] : null;
    const d = new Date(dateStr + 'T00:00:00');
    const dateLabel = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    let html = '<div class="mood-detail-area">';
    html += `<div style="font-size:0.8rem;font-weight:700;color:var(--text-3);margin-bottom:var(--space-md)">${dateLabel}</div>`;

    if (entry) {
      const mc = (MOODS.find(x => x.value === entry.mood) || {}).color || '';
      html += `<div class="mood-detail-icon" data-color="${mc}">${_moodIcon(entry.mood, true)}</div>`;
      html += `<div class="mood-detail-label">${_moodLabel(entry.mood)}</div>`;

      if (entry.triggers && entry.triggers.length > 0) {
        html += '<div class="mood-detail-triggers">';
        entry.triggers.forEach(t => {
          html += `<span class="mood-detail-trigger">${_esc(t)}</span>`;
        });
        html += '</div>';
      }

      if (entry.note) {
        html += `<div class="mood-detail-note">"${_esc(entry.note)}"</div>`;
      }
    } else {
      html += '<div style="font-size:0.85rem;color:var(--text-3)">Tidak ada mood tercatat di hari ini</div>';
    }

    html += '</div>';
    return html;
  }

  function _bindCalendarEvents() {
    document.getElementById('mood-cal-prev')?.addEventListener('click', async () => {
      _calMonth--;
      if (_calMonth < 0) { _calMonth = 11; _calYear--; }
      _selectedCalDate = null;
      const calWrap = document.getElementById('mood-calendar-wrap');
      if (calWrap) calWrap.innerHTML = await _renderCalendar();
      _bindCalendarEvents();
      const detailWrap = document.getElementById('mood-detail-wrap');
      if (detailWrap) detailWrap.innerHTML = '';
    });

    document.getElementById('mood-cal-next')?.addEventListener('click', async () => {
      _calMonth++;
      if (_calMonth > 11) { _calMonth = 0; _calYear++; }
      _selectedCalDate = null;
      const calWrap = document.getElementById('mood-calendar-wrap');
      if (calWrap) calWrap.innerHTML = await _renderCalendar();
      _bindCalendarEvents();
      const detailWrap = document.getElementById('mood-detail-wrap');
      if (detailWrap) detailWrap.innerHTML = '';
    });

    document.querySelectorAll('.mood-calendar-day[data-date]').forEach(el => {
      el.addEventListener('click', async () => {
        _selectedCalDate = el.dataset.date;
        document.querySelectorAll('.mood-calendar-day').forEach(d => d.removeAttribute('data-selected'));
        el.setAttribute('data-selected', 'true');
        const detailWrap = document.getElementById('mood-detail-wrap');
        if (detailWrap) detailWrap.innerHTML = await _renderDayDetail(el.dataset.date);
      });
    });
  }

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
        await remove();
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

  return { renderPage, getToday, getHistory, save, getMonthEntries };
})();
