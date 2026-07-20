/* js/finance.js — Finance Tracker Module */
'use strict';
window.Notara = window.Notara || {};
window.Notara.FinanceTracker = (() => {
  const db   = () => window.Notara.db;
  const Auth = () => window.Notara.Auth;
  const UI   = window.Notara.UI;

  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function _fmtRp(n) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  }

  function _monthLabel(year, month) {
    const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    return `${months[month]} ${year}`;
  }

  function _isCurrentMonth() {
    const now = new Date();
    return _currentMonth === now.getMonth() && _currentYear === now.getFullYear();
  }

  function _userId() { return Auth()?.getUser()?.id; }
  function _uuid() { return crypto.randomUUID(); }
  function _now()  { return new Date().toISOString(); }

  const CATEGORY_ICONS = {
    'Makanan': 'hamburger', 'Transportasi': 'bus', 'Belanja': 'shopping-cart',
    'Tagihan': 'receipt', 'Hiburan': 'game-controller', 'Kesehatan': 'heartbeat',
    'Pendidikan': 'graduation-cap', 'Lainnya': 'dots-three',
    'Gaji': 'money', 'Freelance': 'laptop',
    'Investasi': 'chart-line-up', 'Hadiah': 'gift',
  };

  const CATEGORY_COLORS = {
    'Makanan': '#ff6b6b', 'Transportasi': '#4ecdc4', 'Belanja': '#ffe66d',
    'Tagihan': '#a8e6cf', 'Hiburan': '#ffd93d', 'Kesehatan': '#6bcb77',
    'Pendidikan': '#4d96ff', 'Lainnya': '#8b91a8',
    'Gaji': '#4ecdc4', 'Freelance': '#6bcb77',
    'Investasi': '#4d96ff', 'Hadiah': '#ffd93d',
  };

  function _catDropdownHtml(type, selected) {
    const cats = type === 'income' ? ['Gaji','Freelance','Investasi','Hadiah','Lainnya'] : ['Makanan','Transportasi','Belanja','Tagihan','Hiburan','Kesehatan','Pendidikan','Lainnya'];
    return `<div class="dropdown-wrap" data-dropdown="finance-category-add"><button class="dropdown-trigger" data-dropdown-toggle="finance-category-add" type="button"><span class="dropdown-value">${selected || cats[0]}</span><i class="fa-solid fa-chevron-down dropdown-arrow"></i></button><div class="dropdown-menu" id="dropdown-finance-category-add">${cats.map(c => `<div class="dropdown-item${c === selected ? ' active' : ''}" data-cat-pick="${c}">${c}</div>`).join('')}</div></div>`;
  }

  function _catDropdownHtmlEdit(type, selected) {
    const cats = type === 'income' ? ['Gaji','Freelance','Investasi','Hadiah','Lainnya'] : ['Makanan','Transportasi','Belanja','Tagihan','Hiburan','Kesehatan','Pendidikan','Lainnya'];
    return `<div class="dropdown-wrap" data-dropdown="finance-category-edit"><button class="dropdown-trigger" data-dropdown-toggle="finance-category-edit" type="button"><span class="dropdown-value">${selected || cats[0]}</span><i class="fa-solid fa-chevron-down dropdown-arrow"></i></button><div class="dropdown-menu" id="dropdown-finance-category-edit">${cats.map(c => `<div class="dropdown-item${c === selected ? ' active' : ''}" data-cat-pick="${c}">${c}</div>`).join('')}</div></div>`;
  }

  function _bindDropdownEvents(container) {
    const wrap = container.querySelector('.dropdown-wrap');
    if (!wrap) return;
    const trigger = wrap.querySelector('.dropdown-trigger');
    const menu = wrap.querySelector('.dropdown-menu');
    if (!trigger || !menu) return;

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = wrap.classList.contains('open');
      document.querySelectorAll('.dropdown-wrap.open').forEach(w => w.classList.remove('open'));
      if (!isOpen) wrap.classList.add('open');
    });

    menu.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const val = item.dataset.catPick;
        wrap.querySelector('.dropdown-value').textContent = item.textContent;
        menu.querySelectorAll('.dropdown-item').forEach(x => x.classList.remove('active'));
        item.classList.add('active');
        wrap.classList.remove('open');

        const filterInput = document.getElementById('finance-search');
        _applyFinanceFilters(val, filterInput?.value || '');
      });
    });
  }

  function _applyFinanceFilters(cat, q) {
    const query = (q || '').toLowerCase();
    document.querySelectorAll('.finance-tx').forEach(el => {
      const matchCat = !cat || el.querySelector('.finance-tx-category')?.textContent === cat;
      const matchQ = !query || el.querySelector('.finance-tx-category')?.textContent.toLowerCase().includes(query) || (el.querySelector('.finance-tx-desc')?.textContent || '').toLowerCase().includes(query);
      el.style.display = (matchCat && matchQ) ? '' : 'none';
    });
  }

  async function addTransaction(data) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const tx = {
      id: _uuid(),
      user_id: uid,
      type: data.type,
      category: data.category,
      amount: data.amount,
      description: data.description || null,
      transaction_date: data.transaction_date || _now(),
      created_at: _now(),
      updated_at: _now(),
    };
    const { error } = await db().from('finance_transactions').insert(tx);
    if (error) throw error;
    return tx;
  }

  async function removeTransaction(id) {
    const { error } = await db().from('finance_transactions').delete().eq('id', id);
    if (error) throw error;
  }

  async function updateTransaction(id, changes) {
    const updated = { ...changes, updated_at: _now() };
    const { data, error } = await db().from('finance_transactions').update(updated).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async function getByMonth(year, month) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endMonth = month + 1 > 11 ? 0 : month + 1;
    const endYear  = month + 1 > 11 ? year + 1 : year;
    const endDate  = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-01`;
    const { data, error } = await db().from('finance_transactions')
      .select('*')
      .eq('user_id', uid)
      .gte('transaction_date', startDate)
      .lt('transaction_date', endDate)
      .order('transaction_date', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function getCategories() {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const { data, error } = await db().from('finance_categories')
      .select('*')
      .eq('user_id', uid)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function getMonthlySummary(year, month) {
    const tx = await getByMonth(year, month);
    let income = 0, expense = 0;
    const catMap = {};
    tx.forEach(t => {
      if (t.type === 'income') { income += Number(t.amount); } else { expense += Number(t.amount); }
      if (t.type === 'expense') { catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount); }
    });
    return { income, expense, balance: income - expense, transactions: tx, categoryBreakdown: catMap };
  }

  let _currentYear, _currentMonth;

  async function renderPage() {
    const main = document.getElementById('app-main');
    UI.setTitle('Keuangan');
    UI.setActiveNav('finance');
    main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;

    const now = new Date();
    _currentYear  = now.getFullYear();
    _currentMonth = now.getMonth();
    await _renderDashboard();
  }

  async function _renderDashboard() {
    const main    = document.getElementById('app-main');
    const summary = await getMonthlySummary(_currentYear, _currentMonth);

    let html = '<div class="tracker-page page-enter">';
    const monthBtnLabel = _isCurrentMonth() ? _monthLabel(_currentYear, _currentMonth) : 'Kembali ke Bulan Ini';
    const monthBtnIcon = _isCurrentMonth() ? 'ph-caret-down' : 'ph-arrow-left';
    html += `<div class="tracker-header"><h2><i class="ph ph-wallet"></i> Keuangan</h2><div style="display:flex;gap:6px"><button class="btn-ghost" id="finance-month-btn" style="font-size:0.8rem;padding:0.35rem 0.7rem;display:flex;align-items:center;gap:4px"><i class="ph ${monthBtnIcon}"></i> ${monthBtnLabel}</button><button class="btn-primary" id="finance-add-btn" style="font-size:0.75rem;padding:0.35rem 0.7rem"><i class="ph ph-plus"></i> Transaksi Baru</button></div></div>`;

    html += `<div class="finance-balance-card">`;
    html += `<div class="finance-balance-label">Saldo Bulan Ini</div>`;
    html += `<div class="finance-balance-amount">${_fmtRp(summary.balance)}</div>`;
    html += `<div class="finance-balance-row">`;
    html += `<div class="finance-balance-item income"><div class="label">Pemasukan</div><div class="amount">${_fmtRp(summary.income)}</div></div>`;
    html += `<div class="finance-balance-item expense"><div class="label">Pengeluaran</div><div class="amount">${_fmtRp(summary.expense)}</div></div>`;
    html += `</div></div>`;

    const daysInMonth = new Date(_currentYear, _currentMonth + 1, 0).getDate();
    const avgExpense = summary.expense > 0 ? Math.round(summary.expense / daysInMonth) : 0;
    html += `<div class="finance-summary-row">`;
    html += `<div class="finance-summary-item"><strong>${summary.transactions.length}</strong> <span>transaksi</span></div>`;
    html += `<div class="finance-summary-item"><strong>${_fmtRp(avgExpense)}</strong> <span>/hari</span></div>`;
    html += `</div>`;

    html += `<div id="finance-trend-wrap"></div>`;

    if (summary.transactions.length) {
      const cats = Object.entries(summary.categoryBreakdown).sort((a, b) => b[1] - a[1]);
      const totalExpense = summary.expense || 1;

      html += `<div class="finance-category-breakdown">`;
      cats.forEach(([cat, amount]) => {
        const pct   = Math.round((amount / totalExpense) * 100);
        const color = CATEGORY_COLORS[cat] || '#8b91a8';
        html += `<div class="finance-cat-row">`;
        html += `<div class="finance-cat-color" style="background:${color}"></div>`;
        html += `<span class="finance-cat-name">${cat}</span>`;
        html += `<div class="finance-cat-bar"><div class="finance-cat-fill" style="width:${pct}%;background:${color}"></div></div>`;
        html += `<span class="finance-cat-amount">${_fmtRp(amount)}</span>`;
        html += `</div>`;
      });
      html += `</div>`;
    }

    html += `<h3 style="font-size:0.75rem;font-weight:800;text-transform:uppercase;margin-bottom:var(--space-sm);margin-top:var(--space-lg);display:flex;align-items:center;gap:6px"><i class="ph ph-list"></i> Riwayat Transaksi</h3>`;

    if (summary.transactions.length) {
      const uniqueCats = [...new Set(summary.transactions.map(t => t.category))];
      html += `<div class="finance-filter-bar">`;
      html += `<div class="dropdown-wrap" data-dropdown="finance-cat"><button class="dropdown-trigger" data-dropdown-toggle="finance-cat" type="button"><span class="dropdown-value">Semua Kategori</span><i class="fa-solid fa-chevron-down dropdown-arrow"></i></button><div class="dropdown-menu" id="dropdown-finance-cat"><div class="dropdown-item active" data-cat-pick="">Semua Kategori</div>${uniqueCats.map(c => `<div class="dropdown-item" data-cat-pick="${c}">${c}</div>`).join('')}</div></div>`;
      html += `<input type="text" id="finance-search" placeholder="Cari transaksi...">`;
      html += `</div>`;
    }

    html += `<div class="finance-transaction-list" id="finance-tx-list">`;
    if (!summary.transactions.length) {
      html += `<div class="empty-state" style="min-height:25vh"><span class="empty-icon"><i class="ph ph-wallet" style="font-size:2.5rem;color:var(--accent);opacity:0.35"></i></span><h3>Belum ada transaksi</h3><p>Tambahkan transaksi pertama kamu bulan ini</p></div>`;
    } else {
      summary.transactions.forEach(tx => {
        const d       = new Date(tx.transaction_date);
        const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const icon    = CATEGORY_ICONS[tx.category] || 'tag';
        const sign    = tx.type === 'income' ? '+' : '-';
        html += `<div class="finance-tx" data-id="${tx.id}">`;
        html += `<div class="finance-tx-icon ${tx.type}"><i class="ph ph-${icon}"></i></div>`;
        html += `<div class="finance-tx-info"><div class="finance-tx-category">${_esc(tx.category)}</div>${tx.description ? `<div class="finance-tx-desc">${_esc(tx.description)}</div>` : ''}<div class="finance-tx-date">${dateStr} ${timeStr}</div></div>`;
        html += `<div class="finance-tx-amount ${tx.type}">${sign}${_fmtRp(tx.amount)}</div>`;
        html += `<button class="finance-tx-edit" data-id="${tx.id}"><i class="ph ph-pen"></i></button>`;
        html += `<button class="finance-tx-delete" data-id="${tx.id}"><i class="ph ph-trash"></i></button>`;
        html += `</div>`;
      });
    }
    html += `</div></div>`;
    main.innerHTML = html;

    _bindDashboardEvents();
  }

  function _showMonthPicker() {
    const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const now = new Date();
    let pickerYear = _currentYear;

    function renderPickerBody() {
      let grid = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">';
      months.forEach((name, i) => {
        const isActive = i === _currentMonth && pickerYear === _currentYear;
        const isNow = i === now.getMonth() && pickerYear === now.getFullYear();
        const style = isActive
          ? 'background:var(--accent);color:var(--bg);border-color:var(--accent)'
          : isNow
            ? 'border-color:var(--accent);color:var(--accent)'
            : '';
        grid += `<button class="btn-ghost finance-month-option" data-month="${i}" data-year="${pickerYear}" style="padding:10px 6px;font-size:0.8rem;font-weight:700;${style}">${name.substring(0,3)}</button>`;
      });
      grid += '</div>';
      return grid;
    }

    const m = UI.modal({
      title: '<i class="ph ph-calendar-blank"></i> Pilih Bulan',
      body: `
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:var(--space-md)">
          <button class="icon-btn" id="mp-prev" style="width:28px;height:28px"><i class="ph ph-caret-left"></i></button>
          <span style="font-size:1rem;font-weight:800;color:var(--text-1)">${pickerYear}</span>
          <button class="icon-btn" id="mp-next" style="width:28px;height:28px"><i class="ph ph-caret-right"></i></button>
        </div>
        <div id="mp-grid">${renderPickerBody()}</div>
      `,
      footer: '',
    });

    setTimeout(() => {
      document.getElementById('mp-prev')?.addEventListener('click', () => {
        pickerYear--;
        document.getElementById('mp-grid').innerHTML = renderPickerBody();
        bindMonthClicks();
      });
      document.getElementById('mp-next')?.addEventListener('click', () => {
        pickerYear++;
        document.getElementById('mp-grid').innerHTML = renderPickerBody();
        bindMonthClicks();
      });
      bindMonthClicks();

      function bindMonthClicks() {
        document.querySelectorAll('.finance-month-option').forEach(btn => {
          btn.addEventListener('click', () => {
            _currentMonth = parseInt(btn.dataset.month);
            _currentYear = parseInt(btn.dataset.year);
            m.close();
            _renderDashboard();
          });
        });
      }
    }, 60);
  }

  function _bindDashboardEvents() {
    document.getElementById('finance-month-btn')?.addEventListener('click', _showMonthPicker);
    document.getElementById('finance-add-btn')?.addEventListener('click', _showAddForm);

    document.querySelectorAll('.finance-tx-edit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const txList = document.getElementById('finance-tx-list');
        const txEl = txList?.querySelector(`.finance-tx[data-id="${btn.dataset.id}"]`);
        if (!txEl) return;
        const summary = await getMonthlySummary(_currentYear, _currentMonth);
        const tx = summary.transactions.find(t => t.id === btn.dataset.id);
        if (tx) _showEditForm(tx);
      });
    });

    document.querySelectorAll('.finance-tx-delete').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const ok = await UI.confirm({ title: 'Hapus Transaksi', message: 'Transaksi ini akan dihapus permanen.', okLabel: 'Hapus', okClass: 'btn-primary' });
        if (ok) { try { await removeTransaction(btn.dataset.id); UI.toast('Transaksi dihapus', 'info'); _renderDashboard(); } catch (err) { UI.toast('Gagal: ' + err.message, 'error'); } }
      });
    });

    const searchInput = document.getElementById('finance-search');
    const filterWrap = document.querySelector('[data-dropdown="finance-cat"]');
    if (filterWrap) _bindDropdownEvents(filterWrap.parentElement);
    searchInput?.addEventListener('input', () => {
      const activeCat = document.querySelector('[data-dropdown="finance-cat"] .dropdown-value')?.textContent;
      _applyFinanceFilters(activeCat === 'Semua Kategori' ? '' : activeCat || '', searchInput.value);
    });
    document.addEventListener('click', () => { document.querySelectorAll('.dropdown-wrap.open').forEach(w => w.classList.remove('open')); });

    const trendWrap = document.getElementById('finance-trend-wrap');
    if (trendWrap) {
      trendWrap.innerHTML = '<div class="mood-chart-wrap"><div class="mood-chart-title"><i class="ph ph-chart-line"></i> Tren 6 Bulan</div><canvas id="finance-trend-chart" style="width:100%;height:200px"></canvas></div>';
      setTimeout(() => _renderTrendChart(), 50);
    }
  }

  async function _renderTrendChart() {
    const canvas = document.getElementById('finance-trend-chart');
    if (!canvas) return;

    const { data: trendData } = await db().rpc('get_finance_monthly_trend', {
      p_user_id: _userId(),
      p_months: 6,
    });

    const months = (trendData || []).map(row => {
      const d = new Date(row.year, row.month - 1, 1);
      const label = d.toLocaleDateString('id-ID', { month: 'short' });
      return { label, income: Number(row.total_income), expense: Number(row.total_expense) };
    });

    if (!months.length) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const padding = { top: 15, bottom: 30, left: 10, right: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const allVals = months.flatMap(m => [m.income, m.expense]);
    const maxVal = Math.max(...allVals, 1);

    const getCSVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const text3 = getCSVar('--text-3') || '#666';
    const labelEasy = getCSVar('--label-easy') || '#4caf82';
    const labelHard = getCSVar('--label-hard') || '#ef4444';

    const gap = chartW / months.length;

    ctx.font = '600 9px var(--font-body, sans-serif)';
    ctx.textAlign = 'center';

    months.forEach((m, i) => {
      const x = padding.left + i * gap + gap / 2;

      const yIncome = padding.top + chartH - (m.income / maxVal) * chartH;
      const yExpense = padding.top + chartH - (m.expense / maxVal) * chartH;

      if (i > 0) {
        const prevX = padding.left + (i - 1) * gap + gap / 2;
        const prevIncome = padding.top + chartH - (months[i - 1].income / maxVal) * chartH;
        const prevExpense = padding.top + chartH - (months[i - 1].expense / maxVal) * chartH;

        ctx.strokeStyle = labelEasy;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(prevX, prevIncome);
        ctx.lineTo(x, yIncome);
        ctx.stroke();

        ctx.strokeStyle = labelHard;
        ctx.beginPath();
        ctx.moveTo(prevX, prevExpense);
        ctx.lineTo(x, yExpense);
        ctx.stroke();
      }

      ctx.fillStyle = labelEasy;
      ctx.beginPath();
      ctx.arc(x, yIncome, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = labelHard;
      ctx.beginPath();
      ctx.arc(x, yExpense, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = text3;
      ctx.fillText(m.label, x, h - 8);
    });
  }

  function _showEditForm(tx) {
    let txType = tx.type;

    UI.modal({
      title: '<i class="ph ph-pen"></i> Edit Transaksi',
      body: `
        <div class="finance-type-toggle" id="finance-type-toggle">
          <button class="finance-type-btn expense ${txType === 'expense' ? 'active' : ''}" data-type="expense"><i class="ph ph-trend-down"></i> Pengeluaran</button>
          <button class="finance-type-btn income ${txType === 'income' ? 'active' : ''}" data-type="income"><i class="ph ph-trend-up"></i> Pemasukan</button>
        </div>
        <div class="finance-field">
          <label>Nominal</label>
          <div class="finance-amount-wrap" id="finance-amount-wrap">
            <span class="finance-amount-prefix" id="finance-amount-prefix">${txType === 'expense' ? '-' : '+'}</span>
            <input type="number" id="finance-amount" placeholder="0" min="0" step="1000" value="${tx.amount}">
          </div>
        </div>
        <div class="finance-field">
          <label>Kategori</label>
          ${_catDropdownHtmlEdit(txType, tx.category)}
        </div>
        <div class="finance-field">
          <label>Keterangan (opsional)</label>
          <input type="text" id="finance-desc" placeholder="Misal: Beli makan siang" maxlength="100" value="${_esc(tx.description || '')}">
        </div>
        <div class="auth-error" id="finance-error"></div>
      `,
      footer: `<button class="btn-ghost" id="finance-form-cancel">Batal</button><button class="btn-primary" id="finance-form-save" style="margin-left:8px"><i class="ph ph-check"></i> Simpan</button>`,
    });

    setTimeout(() => {
      document.getElementById('finance-form-cancel')?.addEventListener('click', () => document.getElementById('modal-close')?.click());

      const amountInput = document.getElementById('finance-amount');
      if (amountInput) {
        amountInput.addEventListener('input', _updateAmountStyle);
        _updateAmountStyle();
      }

      const editFieldWrap = document.querySelector('[data-dropdown="finance-category-edit"]')?.closest('.finance-field') || document.querySelector('[data-dropdown="finance-category-edit"]')?.parentElement;
      if (editFieldWrap) _bindDropdownEvents(editFieldWrap);

      document.querySelectorAll('#finance-type-toggle .finance-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#finance-type-toggle .finance-type-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          txType = btn.dataset.type;
          const wrap = document.querySelector('[data-dropdown="finance-category-edit"]');
          if (wrap) {
            const parent = wrap.closest('.finance-field') || wrap.parentElement;
            parent.innerHTML = `<label>Kategori</label>${_catDropdownHtmlEdit(txType, null)}`;
            _bindDropdownEvents(parent);
          }
          _updateAmountStyle();
        });
      });

      function _updateAmountStyle() {
        const input  = document.getElementById('finance-amount');
        const prefix = document.getElementById('finance-amount-prefix');
        if (!input || !prefix) return;
        if (txType === 'expense') {
          input.style.color = 'var(--label-hard)';
          prefix.textContent = '-';
          prefix.style.color = 'var(--label-hard)';
        } else {
          input.style.color = 'var(--label-easy)';
          prefix.textContent = '+';
          prefix.style.color = 'var(--label-easy)';
        }
      }

      document.getElementById('finance-form-save')?.addEventListener('click', async () => {
        const amount      = parseFloat(document.getElementById('finance-amount')?.value);
        const category    = document.querySelector('[data-dropdown="finance-category-edit"] .dropdown-value')?.textContent?.trim();
        const description = document.getElementById('finance-desc')?.value?.trim() || '';

        if (!amount || amount <= 0) { document.getElementById('finance-error').textContent = 'Nominal wajib diisi.'; return; }
        if (!category) { document.getElementById('finance-error').textContent = 'Pilih kategori.'; return; }

        const btn = document.getElementById('finance-form-save');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Menyimpan...';
        try {
          await updateTransaction(tx.id, {
            type: txType,
            amount,
            category,
            description,
          });
          UI.toast('Transaksi diperbarui!', 'success');
          document.getElementById('modal-close')?.click();
          _renderDashboard();
        } catch (err) {
          document.getElementById('finance-error').textContent = err.message;
          btn.disabled = false;
          btn.innerHTML = '<i class="ph ph-check"></i> Simpan';
        }
      });
    }, 60);
  }

  function _showAddForm() {
    let txType = 'expense';

    UI.modal({
      title: '<i class="ph ph-plus-circle"></i> Transaksi Baru',
      body: `
        <div class="finance-type-toggle" id="finance-type-toggle">
          <button class="finance-type-btn expense active" data-type="expense"><i class="ph ph-trend-down"></i> Pengeluaran</button>
          <button class="finance-type-btn income" data-type="income"><i class="ph ph-trend-up"></i> Pemasukan</button>
        </div>
        <div class="finance-field">
          <label>Nominal</label>
          <div class="finance-amount-wrap" id="finance-amount-wrap">
            <span class="finance-amount-prefix" id="finance-amount-prefix">-</span>
            <input type="number" id="finance-amount" placeholder="0" min="0" step="1000">
          </div>
        </div>
        <div class="finance-field">
          <label>Kategori</label>
          ${_catDropdownHtml(txType, null)}
        </div>
        <div class="finance-field">
          <label>Keterangan (opsional)</label>
          <input type="text" id="finance-desc" placeholder="Misal: Beli makan siang" maxlength="100">
        </div>
        <div class="auth-error" id="finance-error"></div>
      `,
      footer: `<button class="btn-ghost" id="finance-form-cancel">Batal</button><button class="btn-primary" id="finance-form-save" style="margin-left:8px"><i class="ph ph-check"></i> Simpan</button>`,
    });

    setTimeout(() => {
      document.getElementById('finance-form-cancel')?.addEventListener('click', () => document.getElementById('modal-close')?.click());

      const addFormField = document.querySelector('.finance-field');
      const addFormContainer = addFormField?.closest('.modal-body, .finance-field')?.parentElement || document.getElementById('app-main');
      const addFieldWrap = document.querySelector('[data-dropdown="finance-category-add"]')?.closest('.finance-field') || document.querySelector('[data-dropdown="finance-category-add"]')?.parentElement;
      if (addFieldWrap) _bindDropdownEvents(addFieldWrap);

      document.querySelectorAll('#finance-type-toggle .finance-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#finance-type-toggle .finance-type-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          txType = btn.dataset.type;
          const wrap = document.querySelector('[data-dropdown="finance-category-add"]');
          if (wrap) {
            const parent = wrap.closest('.finance-field') || wrap.parentElement;
            parent.innerHTML = `<label>Kategori</label>${_catDropdownHtml(txType, null)}`;
            _bindDropdownEvents(parent);
          }
          _updateAmountStyle();
        });
      });

      const amountInput = document.getElementById('finance-amount');
      if (amountInput) {
        amountInput.addEventListener('input', _updateAmountStyle);
        _updateAmountStyle();
      }

      function _updateAmountStyle() {
        const input  = document.getElementById('finance-amount');
        const prefix = document.getElementById('finance-amount-prefix');
        if (!input || !prefix) return;
        if (txType === 'expense') {
          input.style.color = 'var(--label-hard)';
          prefix.textContent = '-';
          prefix.style.color = 'var(--label-hard)';
        } else {
          input.style.color = 'var(--label-easy)';
          prefix.textContent = '+';
          prefix.style.color = 'var(--label-easy)';
        }
      }

      document.getElementById('finance-form-save')?.addEventListener('click', async () => {
        const amount      = parseFloat(document.getElementById('finance-amount')?.value);
        const category    = document.querySelector('[data-dropdown="finance-category-add"] .dropdown-value')?.textContent?.trim();
        const description = document.getElementById('finance-desc')?.value?.trim() || '';

        if (!amount || amount <= 0) { document.getElementById('finance-error').textContent = 'Nominal wajib diisi.'; return; }
        if (!category) { document.getElementById('finance-error').textContent = 'Pilih kategori.'; return; }

        const btn = document.getElementById('finance-form-save');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Menyimpan...';
        try {
          await addTransaction({
            type: txType,
            amount,
            category,
            description,
            transaction_date: new Date().toISOString(),
          });
          UI.toast('Transaksi tersimpan!', 'success');
          document.getElementById('modal-close')?.click();
          _renderDashboard();
        } catch (err) {
          document.getElementById('finance-error').textContent = err.message;
          btn.disabled = false;
          btn.innerHTML = '<i class="ph ph-check"></i> Simpan';
        }
      });
    }, 60);
  }

  return { renderPage, addTransaction, removeTransaction, updateTransaction, getByMonth, getMonthlySummary };
})();
