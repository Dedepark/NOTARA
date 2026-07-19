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
    html += `<div class="tracker-header"><h2><i class="ph ph-wallet"></i> Keuangan</h2><div style="display:flex;align-items:center;gap:6px"><button class="icon-btn" id="finance-prev" style="width:28px;height:28px"><i class="ph ph-caret-left"></i></button><span style="font-size:0.85rem;font-weight:800;color:var(--text-1);min-width:140px;text-align:center">${_monthLabel(_currentYear, _currentMonth)}</span><button class="icon-btn" id="finance-next" style="width:28px;height:28px"><i class="ph ph-caret-right"></i></button></div></div>`;

    html += `<div class="finance-balance-card">`;
    html += `<div class="finance-balance-label">Saldo Bulan Ini</div>`;
    html += `<div class="finance-balance-amount">${_fmtRp(summary.balance)}</div>`;
    html += `<div class="finance-balance-row">`;
    html += `<div class="finance-balance-item income"><div class="label">Pemasukan</div><div class="amount">${_fmtRp(summary.income)}</div></div>`;
    html += `<div class="finance-balance-item expense"><div class="label">Pengeluaran</div><div class="amount">${_fmtRp(summary.expense)}</div></div>`;
    html += `</div></div>`;

    html += `<div class="finance-actions">`;
    html += `<button class="btn-primary" id="finance-add-btn"><i class="ph ph-plus"></i> Transaksi Baru</button>`;
    html += `</div>`;

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
        html += `<button class="finance-tx-delete" data-id="${tx.id}"><i class="ph ph-trash"></i></button>`;
        html += `</div>`;
      });
    }
    html += `</div></div>`;
    main.innerHTML = html;

    _bindDashboardEvents();
  }

  function _bindDashboardEvents() {
    document.getElementById('finance-prev')?.addEventListener('click', () => {
      _currentMonth--;
      if (_currentMonth < 0) { _currentMonth = 11; _currentYear--; }
      _renderDashboard();
    });
    document.getElementById('finance-next')?.addEventListener('click', () => {
      _currentMonth++;
      if (_currentMonth > 11) { _currentMonth = 0; _currentYear++; }
      _renderDashboard();
    });
    document.getElementById('finance-add-btn')?.addEventListener('click', _showAddForm);
    document.querySelectorAll('.finance-tx-delete').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const ok = await UI.confirm({ title: 'Hapus Transaksi', message: 'Transaksi ini akan dihapus permanen.', okLabel: 'Hapus', okClass: 'btn-primary' });
        if (ok) { try { await removeTransaction(btn.dataset.id); UI.toast('Transaksi dihapus', 'info'); _renderDashboard(); } catch (err) { UI.toast('Gagal: ' + err.message, 'error'); } }
      });
    });
  }

  function _showAddForm() {
    let txType = 'expense';
    const expenseCats = ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Pendidikan', 'Lainnya'];
    const incomeCats  = ['Gaji', 'Freelance', 'Investasi', 'Hadiah', 'Lainnya'];

    function catOptions(type) {
      const cats = type === 'income' ? incomeCats : expenseCats;
      return cats.map(c => `<option value="${c}">${c}</option>`).join('');
    }

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
          <select id="finance-category">${catOptions(txType)}</select>
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

      document.querySelectorAll('#finance-type-toggle .finance-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#finance-type-toggle .finance-type-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          txType = btn.dataset.type;
          const select = document.getElementById('finance-category');
          if (select) select.innerHTML = catOptions(txType);
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
        const category    = document.getElementById('finance-category')?.value;
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

  return { renderPage, addTransaction, removeTransaction, getByMonth, getMonthlySummary };
})();
