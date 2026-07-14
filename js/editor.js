/* js/editor.js — Rich Text Editor (Font Awesome + Supabase) */
'use strict';

window.Notara = window.Notara || {};

window.Notara.Editor = (() => {
  let _noteId        = null;
  let _saveTimer     = null;
  let _undoStack     = [];
  let _redoStack     = [];
  let _lastSaved     = '';
  let _globalSaveFn  = null;
  let _zenActive     = false;

  /* ── Toolbar definitions ─────────────────── */
  const TOOLBAR = [
    {
      group: 'history',
      btns: [
        { cmd: '_undo', icon: '<i class="fa-solid fa-rotate-left"></i>',  title: 'Undo (Ctrl+Z)' },
        { cmd: '_redo', icon: '<i class="fa-solid fa-rotate-right"></i>', title: 'Redo (Ctrl+Y)' },
      ]
    },
    {
      group: 'format',
      btns: [
        { cmd: 'bold',          icon: '<i class="fa-solid fa-bold"></i>',          title: 'Bold (Ctrl+B)' },
        { cmd: 'italic',        icon: '<i class="fa-solid fa-italic"></i>',        title: 'Italic (Ctrl+I)' },
        { cmd: 'underline',     icon: '<i class="fa-solid fa-underline"></i>',     title: 'Underline (Ctrl+U)' },
        { cmd: 'strikeThrough', icon: '<i class="fa-solid fa-strikethrough"></i>', title: 'Strikethrough' },
      ]
    },
    {
      group: 'heading',
      btns: [
        { cmd: 'formatBlock', value: 'h1', icon: '<span class="tb-text">H1</span>', title: 'Heading 1' },
        { cmd: 'formatBlock', value: 'h2', icon: '<span class="tb-text">H2</span>', title: 'Heading 2' },
        { cmd: 'formatBlock', value: 'h3', icon: '<span class="tb-text">H3</span>', title: 'Heading 3' },
        { cmd: 'formatBlock', value: 'p',  icon: '<i class="fa-solid fa-paragraph"></i>', title: 'Paragraph' },
      ]
    },
    {
      group: 'list',
      btns: [
        { cmd: 'insertUnorderedList', icon: '<i class="fa-solid fa-list-ul"></i>',   title: 'Bullet list' },
        { cmd: 'insertOrderedList',   icon: '<i class="fa-solid fa-list-ol"></i>',   title: 'Numbered list' },
        { cmd: '_checklist',          icon: '<i class="fa-solid fa-list-check"></i>', title: 'Checklist (Ctrl+L)' },
      ]
    },
    {
      group: 'align',
      btns: [
        { cmd: 'justifyLeft',   icon: '<i class="fa-solid fa-align-left"></i>',    title: 'Rata kiri' },
        { cmd: 'justifyCenter', icon: '<i class="fa-solid fa-align-center"></i>',  title: 'Tengah' },
        { cmd: 'justifyRight',  icon: '<i class="fa-solid fa-align-right"></i>',   title: 'Rata kanan' },
        { cmd: 'justifyFull',   icon: '<i class="fa-solid fa-align-justify"></i>', title: 'Justify' },
      ]
    },
    {
      group: 'color',
      btns: [
        { cmd: '_highlight', icon: '<i class="fa-solid fa-highlighter"></i>', title: 'Highlight' },
      ]
    },
  ];

  /* ── Build toolbar HTML ─────────────────── */
  function _buildToolbar() {
    const parts = [];
    TOOLBAR.forEach((g, gi) => {
      if (gi > 0) parts.push('<span class="toolbar-sep"></span>');
      parts.push('<div class="toolbar-group">');
      g.btns.forEach(b => {
        parts.push(`<button type="button" class="toolbar-btn" data-cmd="${b.cmd}" ${b.value ? `data-value="${b.value}"` : ''} title="${b.title}">${b.icon}</button>`);
      });
      parts.push('</div>');
    });

    parts.push('<span class="toolbar-sep"></span>');
    parts.push(`
      <select class="toolbar-select" id="font-size-select" title="Ukuran font">
        <option value="1">Kecil</option>
        <option value="3" selected>Normal</option>
        <option value="5">Besar</option>
        <option value="7">XL</option>
      </select>
    `);

    parts.push('<span class="toolbar-sep"></span>');
    parts.push(`
      <input type="color" id="text-color-input" title="Warna teks"
        style="width:26px;height:26px;border-radius:var(--radius-sm);border:1px solid var(--border);cursor:pointer;background:none;padding:1px;"
        value="#7c6af7">
    `);

    return parts.join('');
  }

  /* ── Exec command ────────────────────────── */
  function _exec(cmd, value = null) {
    const editor  = document.getElementById('editor-body');
    const titleEl = document.getElementById('editor-title');
    if (!editor) return;

    const focusIsInTitle = document.activeElement === titleEl;
    if (!focusIsInTitle) editor.focus({ preventScroll: true });

    if (cmd === '_undo')      { _undo(); return; }
    if (cmd === '_redo')      { _redoFn(); return; }
    if (cmd === '_highlight') { document.execCommand('hiliteColor', false, '#ffd60066'); return; }
    if (cmd === '_checklist') { _insertChecklist(); return; }
    document.execCommand(cmd, false, value);
    _updateToolbarState();
  }

  /* ── Insert Checklist Item ───────────────── */
  function _insertChecklist() {
    const editor = document.getElementById('editor-body');
    if (!editor) return;
    editor.focus({ preventScroll: true });

    const item = document.createElement('div');
    item.className = 'todo-item';
    item.innerHTML = `<span class="todo-check" contenteditable="false"></span><span class="todo-text"> Tugas baru</span>`;

    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.collapse(false);
      let node = range.commonAncestorContainer;
      while (node && node !== editor && node.parentNode !== editor) node = node.parentNode;
      if (node && node !== editor) {
        node.after(item);
      } else {
        editor.appendChild(item);
      }
    } else {
      editor.appendChild(item);
    }

    // Place cursor in the todo text
    const textSpan = item.querySelector('.todo-text');
    const r = document.createRange();
    r.selectNodeContents(textSpan);
    r.collapse(false);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);

    _snapshot();
    _scheduleSave();
  }

  /* ── Bind checklist click events ─────────── */
  function _bindChecklistEvents(editor) {
    editor.addEventListener('click', e => {
      const check = e.target.closest('.todo-check');
      if (!check) return;
      const item = check.closest('.todo-item');
      if (item) {
        item.classList.toggle('done');
        _scheduleSave();
      }
    });
  }

  function _updateToolbarState() {
    document.querySelectorAll('.toolbar-btn[data-cmd]').forEach(btn => {
      const cmd = btn.dataset.cmd;
      if (['bold','italic','underline','strikeThrough',
           'insertUnorderedList','insertOrderedList',
           'justifyLeft','justifyCenter','justifyRight','justifyFull'].includes(cmd)) {
        btn.classList.toggle('active', document.queryCommandState(cmd));
      }
    });
  }

  /* ── Undo / Redo ─────────────────────────── */
  function _snapshot() {
    const editor = document.getElementById('editor-body');
    if (!editor) return;
    const snap = editor.innerHTML;
    if (_undoStack[_undoStack.length - 1] !== snap) {
      _undoStack.push(snap);
      if (_undoStack.length > 60) _undoStack.shift();
      _redoStack = [];
    }
  }

  function _undo() {
    const editor = document.getElementById('editor-body');
    if (!editor || _undoStack.length < 2) return;
    _redoStack.push(_undoStack.pop());
    editor.innerHTML = _undoStack[_undoStack.length - 1] || '';
    _placeCursorEnd(editor);
  }

  function _redoFn() {
    const editor = document.getElementById('editor-body');
    if (!editor || !_redoStack.length) return;
    const snap = _redoStack.pop();
    _undoStack.push(snap);
    editor.innerHTML = snap;
    _placeCursorEnd(editor);
  }

  function _placeCursorEnd(el) {
    const range = document.createRange();
    const sel   = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    el.focus({ preventScroll: true });
  }

  /* ── Word Count ──────────────────────────── */
  function _countWords(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    const text = (d.textContent || '').trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }

  function _updateWordCount() {
    const bodyEl = document.getElementById('editor-body');
    const wcEl   = document.getElementById('editor-wordcount');
    if (!bodyEl || !wcEl) return;
    const words = _countWords(bodyEl.innerHTML);
    const chars = (bodyEl.textContent || '').length;
    wcEl.textContent = `${words} kata · ${chars} karakter`;

    // Track activity for streak
    _trackActivity(words);
  }

  function _trackActivity(words) {
    if (words <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const key   = `notara_activity_${today}`;
    try {
      const prev = parseInt(localStorage.getItem(key) || '0', 10);
      localStorage.setItem(key, Math.max(prev, words));
    } catch {}
  }

  /* ── Auto-save ───────────────────────────── */
  function _scheduleSave() {
    _updateWordCount();
    const statusEl = document.getElementById('editor-status');
    if (statusEl) {
      statusEl.className = 'editor-status saving saving-pulse';
      statusEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Menyimpan...';
    }
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_doSave, 900);
  }

  async function _doSave() {
    if (!_noteId) return;
    const titleEl = document.getElementById('editor-title');
    const bodyEl  = document.getElementById('editor-body');
    const labelEl = document.querySelector('.label-btn.active-easy, .label-btn.active-medium, .label-btn.active-hard');

    const title   = titleEl?.value?.trim() || 'Catatan baru';
    const content = bodyEl?.innerHTML || '';
    const label   = labelEl?.dataset.label || 'medium';

    const sig = title + '|' + content + '|' + label;
    if (sig === _lastSaved) return;
    _lastSaved = sig;

    try {
      // Save version before updating
      window.Notara.Notes.saveVersion(_noteId, title, content, label);

      await window.Notara.Notes.update(_noteId, { title, content, label });
      const statusEl = document.getElementById('editor-status');
      if (statusEl) {
        statusEl.className = 'editor-status saved';
        statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Tersimpan';
        setTimeout(() => {
          if (statusEl.classList.contains('saved')) {
            statusEl.textContent = '';
            statusEl.className   = 'editor-status';
          }
        }, 2000);
      }
      window.Notara.UI.updateStorageIndicator();
    } catch (err) {
      const statusEl = document.getElementById('editor-status');
      if (statusEl) {
        statusEl.className = 'editor-status';
        statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Gagal simpan';
      }
    }
  }

  /* ── Build deadline/reminder row HTML ──────── */
  function _buildDeadlineRow(note) {
    const hasDeadline  = !!note?.deadline;
    const hasReminder  = !!note?.reminderAt;
    const showAddDeadline  = !hasDeadline;
    const showAddReminder  = !hasReminder;

    function minDT() {
      const d = new Date(Date.now() + 60_000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    }

    const existingBadge = `<div id="editor-deadline-wrap" class="editor-deadline-wrap"></div>`;

    const addButtons = (showAddDeadline || showAddReminder) ? `
      <div class="editor-add-dt-row">
        ${showAddDeadline ? `
          <button type="button" class="btn-ghost editor-add-dt-btn" id="btn-add-deadline" style="font-size:0.78rem;padding:0.3rem 0.7rem">
            <i class="fa-solid fa-hourglass-half"></i> Tambah Tenggat
          </button>
        ` : ''}
        ${showAddReminder ? `
          <button type="button" class="btn-ghost editor-add-dt-btn" id="btn-add-reminder" style="font-size:0.78rem;padding:0.3rem 0.7rem">
            <i class="fa-solid fa-bell"></i> Tambah Pengingat
          </button>
        ` : ''}
      </div>
    ` : '';

    return existingBadge + addButtons;
  }

  /* ── Zen Mode ────────────────────────────── */
  function _toggleZen() {
    _zenActive = !_zenActive;
    document.documentElement.dataset.zen = _zenActive ? 'true' : 'false';

    const zenBtn = document.getElementById('editor-zen-btn');
    if (zenBtn) {
      zenBtn.innerHTML = _zenActive
        ? '<i class="fa-solid fa-compress"></i>'
        : '<i class="fa-solid fa-expand"></i>';
      zenBtn.title = _zenActive ? 'Keluar Zen Mode (Esc)' : 'Zen Mode (F11)';
    }

    if (_zenActive) {
      window.Notara.UI.toast('Zen Mode — Esc untuk keluar', 'info', 2000);
    }
  }

  function _exitZen() {
    if (_zenActive) _toggleZen();
  }

  /* ── Version History Modal ───────────────── */
  function _showVersionHistory() {
    if (!_noteId) return;
    const versions = window.Notara.Notes.getVersions(_noteId);

    if (!versions.length) {
      window.Notara.UI.toast('Belum ada riwayat versi untuk catatan ini.', 'info');
      return;
    }

    const itemsHtml = versions.map((v, i) => {
      const dt = new Date(v.savedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      const preview = (v.title || 'Tanpa judul').slice(0, 50);
      return `
        <div class="version-item" data-idx="${i}">
          <div class="version-item-left">
            <div class="version-title">${_escAttr(preview)}</div>
            <div class="version-time"><i class="fa-regular fa-clock"></i> ${dt}</div>
          </div>
          <button class="btn-ghost version-restore-btn" data-idx="${i}" style="font-size:0.75rem;padding:0.3rem 0.7rem;flex-shrink:0">
            Pulihkan
          </button>
        </div>
      `;
    }).join('');

    window.Notara.UI.modal({
      title: 'Riwayat Versi',
      body: `
        <p style="color:var(--text-3);font-size:0.8rem;margin-bottom:var(--space-md)">
          <i class="fa-solid fa-circle-info"></i>
          ${versions.length} versi tersimpan (max 10). Klik "Pulihkan" untuk kembali ke versi tersebut.
        </p>
        <div class="version-list">${itemsHtml}</div>
      `,
    });

    setTimeout(() => {
      document.querySelectorAll('.version-restore-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.dataset.idx, 10);
          const ver = versions[idx];
          if (!ver) return;

          const ok = await window.Notara.UI.confirm({
            title: 'Pulihkan Versi',
            message: `Konten editor akan diganti dengan versi ini (${new Date(ver.savedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}). Lanjutkan?`,
            okLabel: '<i class="fa-solid fa-rotate-left"></i> Pulihkan',
          });
          if (!ok) return;

          document.getElementById('modal-close')?.click();

          const titleEl = document.getElementById('editor-title');
          const bodyEl  = document.getElementById('editor-body');
          if (titleEl) titleEl.value = ver.title;
          if (bodyEl)  bodyEl.innerHTML = ver.content;

          _snapshot();
          _scheduleSave();
          window.Notara.UI.toast('Versi dipulihkan!', 'success');
        });
      });
    }, 60);
  }

  /* ── Mount editor ────────────────────────── */
  async function mount(noteId) {
    unmount();

    _noteId    = noteId;
    _undoStack = [];
    _redoStack = [];
    _lastSaved = '';
    _zenActive = false;

    const main = document.getElementById('app-main');
    main.classList.add('editor-mode');
    main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;

    const note = noteId ? await window.Notara.Notes.getById(noteId) : null;

    main.innerHTML = `
      <div class="editor-page">
        <div class="editor-header">
          <button type="button" class="btn-ghost" id="editor-back">
            <i class="fa-solid fa-arrow-left"></i> Kembali
          </button>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="editor-wordcount" id="editor-wordcount"></span>
            <span class="editor-status" id="editor-status"></span>
          </div>
          <div style="display:flex;gap:4px">
            <button type="button" class="icon-btn" id="editor-version-btn" title="Riwayat Versi">
              <i class="fa-solid fa-clock-rotate-left"></i>
            </button>
            <button type="button" class="icon-btn" id="editor-zen-btn" title="Zen Mode (F11)">
              <i class="fa-solid fa-expand"></i>
            </button>
          </div>
        </div>

        <input class="editor-title-input" id="editor-title"
          placeholder="Judul catatan..."
          value="${_escAttr(note?.title || '')}">

        <div class="editor-toolbar" id="editor-toolbar">
          ${_buildToolbar()}
        </div>

        <div class="editor-body" id="editor-body"
          contenteditable="true"
          spellcheck="false"
          data-placeholder="Mulai menulis...">
          ${note?.content || ''}
        </div>

        <div class="editor-bottom">
          <div class="label-selector">
            <button type="button" class="label-btn ${note?.label === 'easy'   ? 'active-easy'   : ''}" data-label="easy">
              <i class="fa-solid fa-circle" style="color:var(--label-easy);font-size:0.6rem"></i> Easy
            </button>
            <button type="button" class="label-btn ${note?.label === 'medium' ? 'active-medium' : ''}" data-label="medium">
              <i class="fa-solid fa-circle" style="color:var(--label-medium);font-size:0.6rem"></i> Medium
            </button>
            <button type="button" class="label-btn ${note?.label === 'hard'   ? 'active-hard'   : ''}" data-label="hard">
              <i class="fa-solid fa-circle" style="color:var(--label-hard);font-size:0.6rem"></i> Hard
            </button>
          </div>
          <div style="margin-left:auto;display:flex;gap:8px">
            <button type="button" class="btn-ghost" id="editor-export-txt">
              <i class="fa-solid fa-file-lines"></i> TXT
            </button>
            <button type="button" class="btn-ghost" id="editor-export-pdf">
              <i class="fa-solid fa-file-pdf"></i> PDF
            </button>
            <button type="button" class="btn-primary" id="editor-save">
              <i class="fa-solid fa-floppy-disk"></i> Simpan
            </button>
          </div>
        </div>

        <!-- Deadline / Reminder section -->
        <div class="editor-dt-section">
          ${_buildDeadlineRow(note)}
        </div>

        <!-- Zen Mode Exit Hint -->
        <div class="zen-exit-hint" id="zen-exit-hint">
          <i class="fa-solid fa-compress"></i> Tekan <kbd>Esc</kbd> untuk keluar Zen Mode
        </div>
      </div>
    `;

    if (note) window.Notara.Reminders.renderDeadlineBadge(note);

    const bodyEl = document.getElementById('editor-body');
    if (bodyEl) _bindChecklistEvents(bodyEl);

    _bindEvents(note);
    _snapshot();
    _updateWordCount();
  }

  function _escAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Bind events ─────────────────────────── */
  function _bindEvents(note) {
    const toolbar = document.getElementById('editor-toolbar');
    const bodyEl  = document.getElementById('editor-body');
    const titleEl = document.getElementById('editor-title');
    const sizeEl  = document.getElementById('font-size-select');
    const colorEl = document.getElementById('text-color-input');

    toolbar?.addEventListener('pointerdown', e => {
      const btn = e.target.closest('.toolbar-btn');
      if (btn) e.preventDefault();
    });

    toolbar?.addEventListener('click', e => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;
      e.preventDefault();
      _exec(btn.dataset.cmd, btn.dataset.value || null);
    });

    sizeEl?.addEventListener('pointerdown', e => e.preventDefault());
    sizeEl?.addEventListener('change',  e => { e.preventDefault(); _exec('fontSize', e.target.value); });
    colorEl?.addEventListener('input',  e => _exec('foreColor', e.target.value));

    bodyEl?.addEventListener('input', () => { _updateToolbarState(); _scheduleSave(); _checkWikilink(); });
    bodyEl?.addEventListener('keydown', e => {
      // Wikilink dropdown keyboard nav
      if (_wikilinkDropdownActive()) {
        if (e.key === 'ArrowDown')  { e.preventDefault(); _wikilinkMove(1);  return; }
        if (e.key === 'ArrowUp')    { e.preventDefault(); _wikilinkMove(-1); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); _wikilinkSelect(); return; }
        if (e.key === 'Escape')     { _wikilinkClose(); return; }
      }
      if (e.key === 'Enter' || e.key === ' ' || e.ctrlKey) setTimeout(_snapshot, 0);
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); _undo(); }
        if (e.key === 'y') { e.preventDefault(); _redoFn(); }
        if (e.key === 'b') { e.preventDefault(); _exec('bold'); }
        if (e.key === 'i') { e.preventDefault(); _exec('italic'); }
        if (e.key === 'u') { e.preventDefault(); _exec('underline'); }
        if (e.key === 'l') { e.preventDefault(); _insertChecklist(); }
      }
    });
    bodyEl?.addEventListener('mouseup', _updateToolbarState);
    bodyEl?.addEventListener('keyup',   _updateToolbarState);

    titleEl?.addEventListener('input', _scheduleSave);

    document.querySelectorAll('.label-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.label-btn').forEach(b => { b.className = 'label-btn'; });
        btn.classList.add('active-' + btn.dataset.label);
        _scheduleSave();
      });
    });

    document.getElementById('editor-back')?.addEventListener('click', () => {
      _exitZen();
      _doSave();
      window.Notara.Router.go('home');
    });

    document.getElementById('editor-save')?.addEventListener('click', async () => {
      await _doSave();
      window.Notara.UI.toast('Catatan disimpan!', 'success');
    });

    document.getElementById('editor-export-txt')?.addEventListener('click', async () => {
      await _doSave();
      window.Notara.Notes.exportTxt(_noteId);
    });
    document.getElementById('editor-export-pdf')?.addEventListener('click', async () => {
      await _doSave();
      window.Notara.Notes.exportPdf(_noteId);
    });

    document.getElementById('btn-add-deadline')?.addEventListener('click', () => _showDatetimePicker('deadline'));
    document.getElementById('btn-add-reminder')?.addEventListener('click', () => _showDatetimePicker('reminder'));

    // Zen Mode
    document.getElementById('editor-zen-btn')?.addEventListener('click', _toggleZen);

    // Version History
    document.getElementById('editor-version-btn')?.addEventListener('click', _showVersionHistory);

    // Global shortcuts for this page
    if (_globalSaveFn) {
      document.removeEventListener('keydown', _globalSaveFn);
      _globalSaveFn = null;
    }
    _globalSaveFn = function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        _doSave().then(() => window.Notara.UI.toast('Tersimpan', 'success'));
      }
      if (e.key === 'F11') {
        e.preventDefault();
        _toggleZen();
      }
      if (e.key === 'Escape' && _zenActive) {
        _exitZen();
      }
    };
    document.addEventListener('keydown', _globalSaveFn);
  }

  /* ── DateTime Picker Modal ─────────────────── */
  function _showDatetimePicker(type) {
    if (!_noteId) return;
    const isDeadline = type === 'deadline';

    if (!isDeadline && !window.Notara.Reminders.hasPermission()) {
      window.Notara.UI.toast('Aktifkan notifikasi di Pengaturan agar pengingat bekerja.', 'warning', 5000);
    }

    function minDT() {
      const d = new Date(Date.now() + 60_000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    }
    const minVal = minDT();

    window.Notara.UI.modal({
      title: isDeadline ? 'Tambah Tenggat Waktu' : 'Tambah Pengingat',
      body: `
        <p style="color:var(--text-2);font-size:0.88rem;margin-bottom:var(--space-md)">
          ${isDeadline
            ? 'Catatan ini akan menampilkan hitung mundur menuju batas waktu yang ditentukan.'
            : 'Kamu akan mendapat notifikasi pada waktu yang dipilih.'}
        </p>
        <div class="dt-field-wrap">
          <label class="dt-label">
            <i class="fa-solid fa-${isDeadline ? 'hourglass-half' : 'bell'}"></i>
            ${isDeadline ? 'Batas Waktu Pengerjaan' : 'Waktu Pengingat'}
          </label>
          <input type="datetime-local" id="dt-modal-input" class="dt-input"
            min="${minVal}" value="${minVal}">
        </div>
        <div id="dt-modal-error" class="auth-error" style="margin-top:8px"></div>
      `,
      footer: `
        <button class="btn-ghost" id="dt-modal-cancel">Batal</button>
        <button class="btn-primary" id="dt-modal-ok" style="margin-left:8px">
          <i class="fa-solid fa-check"></i> Simpan
        </button>
      `,
    });

    setTimeout(() => {
      document.getElementById('dt-modal-cancel')?.addEventListener('click', () => {
        document.getElementById('modal-close')?.click();
      });

      document.getElementById('dt-modal-ok')?.addEventListener('click', async () => {
        const val   = document.getElementById('dt-modal-input')?.value;
        const errEl = document.getElementById('dt-modal-error');
        if (!val) { errEl.textContent = 'Pilih tanggal & waktu terlebih dahulu.'; return; }

        const iso = new Date(val).toISOString();
        if (new Date(iso).getTime() < Date.now() + 30_000) {
          errEl.textContent = 'Waktu harus di masa depan.'; return;
        }

        try {
          let updated;
          if (isDeadline) updated = await window.Notara.Notes.setDeadline(_noteId, iso);
          else            updated = await window.Notara.Notes.setReminderAt(_noteId, iso);
          document.getElementById('modal-close')?.click();
          window.Notara.Reminders.renderDeadlineBadge(updated);

          if (isDeadline) document.getElementById('btn-add-deadline')?.remove();
          else            document.getElementById('btn-add-reminder')?.remove();

          window.Notara.UI.toast(isDeadline ? 'Tenggat waktu ditambahkan!' : 'Pengingat ditambahkan!', 'success');
        } catch(err) {
          document.getElementById('dt-modal-error').textContent = 'Gagal menyimpan: ' + err.message;
        }
      });
    }, 60);
  }

  /* ── Wikilink [[...]] Autocomplete ──────── */
  let _wikilinkIdx = -1;
  let _wikilinkItems = [];

  function _wikilinkDropdownActive() {
    return !!document.getElementById('wikilink-dropdown');
  }

  function _wikilinkClose() {
    document.getElementById('wikilink-dropdown')?.remove();
    _wikilinkItems = [];
    _wikilinkIdx   = -1;
  }

  function _wikilinkMove(dir) {
    const items = document.querySelectorAll('.wl-item');
    if (!items.length) return;
    items[_wikilinkIdx]?.classList.remove('active');
    _wikilinkIdx = (_wikilinkIdx + dir + items.length) % items.length;
    items[_wikilinkIdx]?.classList.add('active');
    items[_wikilinkIdx]?.scrollIntoView({ block: 'nearest' });
  }

  function _wikilinkSelect() {
    const items = document.querySelectorAll('.wl-item');
    const target = items[_wikilinkIdx] || items[0];
    if (target) target.click();
  }

  async function _checkWikilink() {
    const bodyEl = document.getElementById('editor-body');
    if (!bodyEl) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;

    // Walk up to get text node
    let node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent.slice(0, range.startOffset);

    // Check for [[ trigger
    const m = text.match(/\[\[([^\]]*)$/);
    if (!m) { _wikilinkClose(); return; }
    const query = m[1];

    // Fetch notes matching query
    try {
      const all = await window.Notara.Notes.getAll();
      const results = all.filter(n =>
        n.id !== _noteId &&
        n.title.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8);

      if (!results.length) { _wikilinkClose(); return; }
      _wikilinkItems = results;

      // Position dropdown near cursor
      const rect = range.getBoundingClientRect();
      let dropdown = document.getElementById('wikilink-dropdown');
      if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'wikilink-dropdown';
        dropdown.className = 'wikilink-dropdown';
        document.body.appendChild(dropdown);
      }

      dropdown.innerHTML = results.map((n, i) => `
        <div class="wl-item${i === 0 ? ' active' : ''}" data-id="${n.id}" data-title="${n.title.replace(/"/g,'&quot;')}">
          <span class="wl-icon"><i class="fa-solid fa-note-sticky"></i></span>
          <span class="wl-title">${n.title}</span>
          <span class="wl-date">${window.Notara.UI.formatDate(n.updatedAt)}</span>
        </div>
      `).join('');
      _wikilinkIdx = 0;

      // Position
      const top  = rect.bottom + window.scrollY + 4;
      const left = Math.min(rect.left + window.scrollX, window.innerWidth - 260);
      dropdown.style.top  = top + 'px';
      dropdown.style.left = left + 'px';

      // Bind click
      dropdown.querySelectorAll('.wl-item').forEach((el, i) => {
        el.addEventListener('mouseenter', () => {
          dropdown.querySelectorAll('.wl-item').forEach(x => x.classList.remove('active'));
          el.classList.add('active');
          _wikilinkIdx = i;
        });
        el.addEventListener('mousedown', e => {
          e.preventDefault();
          _insertWikilinkNode(el.dataset.id, el.dataset.title, node, range, query);
        });
      });

      // Close on outside click
      setTimeout(() => {
        document.addEventListener('mousedown', function handler(e) {
          if (!dropdown.contains(e.target)) {
            _wikilinkClose();
            document.removeEventListener('mousedown', handler);
          }
        });
      }, 0);
    } catch { _wikilinkClose(); }
  }

  function _insertWikilinkNode(noteId, noteTitle, textNode, range, query) {
    _wikilinkClose();
    const bodyEl = document.getElementById('editor-body');
    if (!bodyEl) return;

    // Replace [[query with the link
    const fullText = textNode.textContent;
    const triggerIdx = fullText.lastIndexOf('[[' + query);
    if (triggerIdx === -1) return;

    // Build the anchor element
    const link = document.createElement('a');
    link.className   = 'note-wikilink';
    link.href        = '#read/' + noteId;
    link.dataset.id  = noteId;
    link.textContent = '[[' + noteTitle + ']]';
    link.contentEditable = 'false';

    // Split text node and insert link
    const before = document.createTextNode(fullText.slice(0, triggerIdx));
    const after  = document.createTextNode(fullText.slice(triggerIdx + 2 + query.length) || '\u00A0');
    textNode.parentNode.insertBefore(before, textNode);
    textNode.parentNode.insertBefore(link, textNode);
    textNode.parentNode.insertBefore(after, textNode);
    textNode.remove();

    // Move cursor after link
    const r = document.createRange();
    r.setStart(after, after.length);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);

    _snapshot();
    _scheduleSave();
  }

  function unmount() {
    _wikilinkClose();
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
      const bodyEl = document.getElementById('editor-body');
      if (bodyEl && _noteId) _doSave();
    }

    if (_globalSaveFn) {
      document.removeEventListener('keydown', _globalSaveFn);
      _globalSaveFn = null;
    }

    // Exit zen mode on unmount
    if (_zenActive) {
      _zenActive = false;
      document.documentElement.dataset.zen = 'false';
    }

    const main = document.getElementById('app-main');
    if (main) {
      main.classList.remove('editor-mode');
      main.style.removeProperty('overflow');
      main.style.removeProperty('padding');
    }

    _noteId    = null;
    _undoStack = [];
    _redoStack = [];
    _lastSaved = '';
  }

  return { mount, unmount };
})();