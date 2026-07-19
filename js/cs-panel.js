/* js/cs-panel.js - Stealth CS Panel (reuses sidebar+main layout) */
'use strict';
window.Notara = window.Notara || {};

window.Notara.CSPanel = (() => {
  var db = function() { return window.Notara.db; };
  var R = window.Notara.Router;
  var UI = window.Notara.UI;
  var Auth = window.Notara.Auth;
  var DEFAULT_PIN = '123456';
  var _isAdmin = false;
  var _activeTicketId = null;
  var _panelChannel = null;
  var _chatChannel = null;

  function _stopRealtime() {
    if (_panelChannel) { db().removeChannel(_panelChannel); _panelChannel = null; }
    if (_chatChannel) { db().removeChannel(_chatChannel); _chatChannel = null; }
  }

  function _updateCSTicketCard(ticketId) {
    var card = document.querySelector('.cs-ticket[data-tid="' + ticketId + '"]');
    if (!card) return;
    db().from('cs_tickets').select('*').eq('id', ticketId).single().then(function(res) {
      var t = res.data;
      if (!t) return;
      db().from('cs_messages').select('sender').eq('ticket_id', ticketId).then(function(mres) {
        var msgs = mres.data || [];
        var userSent = 0, csSent = 0;
        for (var i = 0; i < msgs.length; i++) {
          if (msgs[i].sender === 'user') userSent++;
          else csSent++;
        }
        var reddot = !t.cs_read ? '<span class="ticket-reddot"></span> ' : '';
        var recvInd = userSent > 0
          ? '<span class="ticket-ind ticket-done"><i class="fa-solid fa-check"></i> Diterima (' + userSent + ')</span>'
          : '<span class="ticket-ind ticket-waiting"><i class="fa-solid fa-xmark"></i> Belum ada pesan</span>';
        var replyInd = csSent > 0
          ? '<span class="ticket-ind ticket-done"><i class="fa-solid fa-check"></i> Dibalas (' + csSent + ')</span>'
          : '<span class="ticket-ind ticket-waiting"><i class="fa-solid fa-xmark"></i> Belum dibalas</span>';
        card.querySelector('.cs-ticket-time').innerHTML = reddot + UI.formatDate(t.updated_at);
        card.querySelector('.cs-ticket-meta').innerHTML = recvInd + replyInd;
      });
    });
  }

  function _startPanelRealtime() {
    if (_panelChannel) return;
    _panelChannel = db().channel('cs-panel-all')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cs_tickets'
      }, function(payload) {
        if (payload.eventType === 'UPDATE') {
          _updateCSTicketCard(payload.new.id);
        } else {
          _loadTickets();
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'cs_messages'
      }, function(payload) {
        if (_activeTicketId && payload.new.ticket_id === _activeTicketId) return;
        if (payload.new.sender === 'user') {
          db().from('cs_tickets').update({ cs_read: false }).eq('id', payload.new.ticket_id).then(function() {
            _updateCSTicketCard(payload.new.ticket_id);
          }).catch(function() {});
        } else {
          _updateCSTicketCard(payload.new.ticket_id);
        }
      })
      .subscribe();
  }

  function _startChatRealtime(ticketId) {
    if (_chatChannel) { db().removeChannel(_chatChannel); _chatChannel = null; }
    _chatChannel = db().channel('cs-chat-' + ticketId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'cs_messages',
        filter: 'ticket_id=eq.' + ticketId
      }, function(payload) {
        var body = document.querySelector('.cs-messages');
        if (!body) return;
        var m = payload.new;
        var isCS = m.sender === 'cs';
        var cls = isCS ? 'cs-out' : 'cs-in';
        var div = document.createElement('div');
        div.className = 'cs-bubble ' + cls;
        div.innerHTML =
          '<div class="cs-bubble-head">' +
            '<span class="cs-bubble-name">' + _esc(m.sender_name) + '</span>' +
            '<span class="cs-bubble-time">' + UI.formatDate(m.created_at) + '</span>' +
          '</div>' +
          '<div class="cs-bubble-text">' + _esc(m.content) + '</div>';
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
      })
      .subscribe();
  }

  function _getStoredPin() {
    return localStorage.getItem('notara_cs_pin') || DEFAULT_PIN;
  }

  function _setStoredPin(pin) {
    localStorage.setItem('notara_cs_pin', pin);
  }

  function initShortcutListener() {
    window.addEventListener('keydown', function(e) {
      var parts = [];
      if (e.ctrlKey) parts.push('Control');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      parts.push(e.code);
      var pressed = parts.join('+');
      if (pressed === 'Control+Shift+Alt+KeyA') {
        e.preventDefault();
        _openAuth();
      }
    });
  }

  async function _openAuth() {
    if (_isAdmin) { _enterPanel(); return; }
    var pin = window.prompt('Kode Akses Customer Service:');
    if (!pin) return;

    try {
      var result = await db().from('cs_config').select('value').eq('key', 'admin_pin').single();
      if (result.error) throw result.error;
      if (result.data.value !== pin) {
        UI.toast('PIN salah!', 'error');
        return;
      }
      _isAdmin = true;
      _enterPanel();
    } catch (err) {
      UI.toast('Verifikasi gagal: ' + err.message, 'error');
    }
  }

  function _enterPanel() {
    var app = document.getElementById('app');
    var sidebarNav = document.querySelector('.sidebar-nav');
    var sidebarFooter = document.querySelector('.sidebar-footer');
    var sidebarHeader = document.querySelector('.sidebar-header');
    var topbar = document.getElementById('topbar');
    var main = document.getElementById('app-main');

    app.setAttribute('data-cs-mode', 'true');
    var mobNav = document.getElementById('mobile-bottom-nav');
    if (mobNav) mobNav.style.display = 'none';

    if (sidebarNav) sidebarNav.style.display = 'none';
    if (sidebarFooter) sidebarFooter.style.display = 'none';

    if (topbar) {
      var normalItems = topbar.querySelectorAll('.topbar-normal-item');
      for (var i = 0; i < normalItems.length; i++) normalItems[i].style.display = 'none';
    }

    var csSidebar = document.createElement('div');
    csSidebar.className = 'cs-sidebar-wrap';
    csSidebar.id = 'cs-sidebar-wrap';
    csSidebar.innerHTML =
      '<div class="cs-sidebar-head">' +
        '<span class="cs-sidebar-label"><i class="fa-solid fa-inbox"></i> Tiket</span>' +
        '<button class="cs-icon-btn" id="cs-close" title="Keluar"><i class="fa-solid fa-arrow-left"></i></button>' +
      '</div>' +
      '<div class="cs-ticket-list" id="cs-tickets"></div>';

    if (sidebarNav) {
      sidebarNav.parentNode.insertBefore(csSidebar, sidebarNav.nextSibling);
    }

    var csTopbar = document.createElement('div');
    csTopbar.className = 'cs-topbar';
    csTopbar.id = 'cs-topbar';
    csTopbar.innerHTML =
      '<span class="topbar-title" style="flex:1"><i class="fa-solid fa-headset" style="color:var(--accent);margin-right:6px"></i> Panel CS</span>' +
      '<button class="btn-ghost" id="cs-change-pin" title="Ganti PIN"><i class="fa-solid fa-key"></i></button>';

    if (topbar) topbar.appendChild(csTopbar);

    main.innerHTML =
      '<div class="cs-empty-state">' +
        '<i class="fa-regular fa-comments"></i>' +
        '<span>Pilih tiket untuk membalas</span>' +
      '</div>';

    document.getElementById('cs-close').addEventListener('click', _exitPanel);
    document.getElementById('cs-change-pin').addEventListener('click', _showChangePinModal);

    _loadTickets();
    _startPanelRealtime();
  }

  function _exitPanel() {
    _isAdmin = false;
    _activeTicketId = null;
    _stopRealtime();

    var app = document.getElementById('app');
    var sidebarNav = document.querySelector('.sidebar-nav');
    var sidebarFooter = document.querySelector('.sidebar-footer');
    var topbar = document.getElementById('topbar');
    var csSidebar = document.getElementById('cs-sidebar-wrap');
    var csTopbar = document.getElementById('cs-topbar');

    app.removeAttribute('data-cs-mode');
    var mobNav = document.getElementById('mobile-bottom-nav');
    if (mobNav) mobNav.style.display = '';

    if (sidebarNav) sidebarNav.style.display = '';
    if (sidebarFooter) sidebarFooter.style.display = '';

    if (topbar) {
      var normalItems = topbar.querySelectorAll('.topbar-normal-item');
      for (var i = 0; i < normalItems.length; i++) normalItems[i].style.display = '';
    }

    if (csSidebar) csSidebar.remove();
    if (csTopbar) csTopbar.remove();

    R.go('home');
  }

  async function _getTicketCounts(ticketIds) {
    if (!ticketIds.length) return {};
    var { data: msgs } = await db().from('cs_messages').select('ticket_id, sender').in('ticket_id', ticketIds);
    var counts = {};
    if (msgs) {
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i];
        if (!counts[m.ticket_id]) counts[m.ticket_id] = { userSent: 0, csSent: 0 };
        if (m.sender === 'user') counts[m.ticket_id].userSent++;
        else counts[m.ticket_id].csSent++;
      }
    }
    return counts;
  }

  async function _loadTickets() {
    try {
      var result = await db().from('cs_tickets').select('*').order('updated_at', { ascending: false });
      if (result.error) throw result.error;
      var tickets = result.data;
      var container = document.getElementById('cs-tickets');
      if (!tickets || !tickets.length) {
        container.innerHTML = '<div class="cs-empty-list"><i class="fa-regular fa-folder-open"></i><span>Belum ada tiket</span></div>';
        return;
      }

      var ids = tickets.map(function(t) { return t.id; });
      var counts = await _getTicketCounts(ids);

      var html = '';
      for (var i = 0; i < tickets.length; i++) {
        var t = tickets[i];
        var c = counts[t.id] || { userSent: 0, csSent: 0 };
        var statusDot = t.status === 'open' ? '<span class="cs-dot cs-dot-active"></span>' : '<span class="cs-dot cs-dot-closed"></span>';
        var userName = t.user_name || 'User';

        var userSent = c.userSent || 0;
        var csSent = c.csSent || 0;

        var recvIndicator = userSent > 0
          ? '<span class="ticket-ind ticket-done"><i class="fa-solid fa-check"></i> Diterima (' + userSent + ')</span>'
          : '<span class="ticket-ind ticket-waiting"><i class="fa-solid fa-xmark"></i> Belum ada pesan</span>';
        var replyIndicator = csSent > 0
          ? '<span class="ticket-ind ticket-done"><i class="fa-solid fa-check"></i> Dibalas (' + csSent + ')</span>'
          : '<span class="ticket-ind ticket-waiting"><i class="fa-solid fa-xmark"></i> Belum dibalas</span>';

        var reddot = !t.cs_read ? '<span class="ticket-reddot"></span>' : '';

        html +=
          '<div class="cs-ticket' + (t.id === _activeTicketId ? ' active' : '') + '" data-tid="' + t.id + '">' +
            '<div class="cs-ticket-top">' +
              '<span class="cs-ticket-user">' + statusDot + _esc(userName) + '</span>' +
            '</div>' +
            '<div class="cs-ticket-subject">' + _esc(t.subject) + '</div>' +
            '<div class="cs-ticket-meta">' + recvIndicator + replyIndicator + '</div>' +
            '<div class="cs-ticket-time">' + reddot + UI.formatDate(t.updated_at) + '</div>' +
          '</div>';
      }
      container.innerHTML = html;
      var items = container.querySelectorAll('.cs-ticket');
      for (var j = 0; j < items.length; j++) {
        items[j].addEventListener('click', function() {
          var prev = container.querySelector('.cs-ticket.active');
          if (prev) prev.classList.remove('active');
          this.classList.add('active');
          _activeTicketId = this.dataset.tid;
          _openTicket(this.dataset.tid);
        });
      }
    } catch (err) {
      UI.toast('Gagal memuat tiket: ' + err.message, 'error');
    }
  }

  async function _openTicket(ticketId) {
    var main = document.getElementById('app-main');
    main.innerHTML = '<div class="page-loading"><div class="loader-ring"></div></div>';

    try {
      var ticketResult = await db().from('cs_tickets').select('*').eq('id', ticketId).single();
      if (ticketResult.error) throw ticketResult.error;
      var ticket = ticketResult.data;

      db().from('cs_tickets').update({ cs_read: true }).eq('id', ticketId).then(function() {
        _updateCSTicketCard(ticketId);
      }).catch(function() {});

      var result = await db().from('cs_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
      if (result.error) throw result.error;
      var msgs = result.data;
      var userName = ticket.user_name || 'User';

      await db().from('cs_tickets').update({ cs_replied: true }).eq('id', ticketId).catch(() => {});

      var html =
        '<div class="cs-chat-head">' +
          '<div class="cs-chat-user">' +
            '<span class="cs-dot cs-dot-active"></span>' +
            '<div class="cs-chat-user-info">' +
              '<span class="cs-chat-name">' + _esc(userName) + ' <button class="cs-copy-name" data-name="' + _esc(userName) + '" title="Salin nama"><i class="fa-solid fa-copy"></i></button></span>' +
              '<span class="cs-chat-subject">' + _esc(ticket.subject) + '</span>' +
            '</div>' +
          '</div>' +
          '<button class="cs-copy-greeting" data-name="' + _esc(userName) + '" title="Salin pesan sapaan"><i class="fa-solid fa-comment-dots"></i></button>' +
        '</div>' +
        '<div class="cs-chat-body">' +
          '<div class="cs-messages">';

      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i];
        var isCS = m.sender === 'cs';
        var cls = isCS ? 'cs-out' : 'cs-in';
        html +=
          '<div class="cs-bubble ' + cls + '">' +
            '<div class="cs-bubble-head">' +
              '<span class="cs-bubble-name">' + _esc(m.sender_name) + '</span>' +
              '<span class="cs-bubble-time">' + UI.formatDate(m.created_at) + '</span>' +
            '</div>' +
            '<div class="cs-bubble-text">' + _esc(m.content) + '</div>' +
          '</div>';
      }
      html += '</div>';
      html +=
        '<form class="cs-reply" data-tid="' + ticketId + '">' +
          '<textarea class="cs-reply-input" placeholder="Tulis balasan..." rows="1" required></textarea>' +
          '<button class="cs-reply-send" type="submit"><i class="fa-solid fa-paper-plane"></i></button>' +
        '</form>' +
        '</div>';

      main.innerHTML = html;

      var copyBtn = main.querySelector('.cs-copy-name');
      if (copyBtn) {
        copyBtn.addEventListener('click', function() {
          var name = this.dataset.name;
          navigator.clipboard.writeText(name).then(function() {
            UI.toast('Nama tersalin!', 'success');
          });
        });
      }

      var greetingBtn = main.querySelector('.cs-copy-greeting');
      if (greetingBtn) {
        greetingBtn.addEventListener('click', function() {
          var name = this.dataset.name;
          var msg = 'Halo Kak ' + name + ', terima kasih sudah menggunakan layanan Notara dan telah memberikan masukan serta saran yang berharga. Kami akan menampung dan mempertimbangkan setiap saran dari Kak ' + name + ' untuk kemajuan Notara ke depannya. Semoga Kak ' + name + ' selalu merasa nyaman dan betah menggunakan Notara ya. Jika ada pertanyaan atau bantuan lainnya, jangan ragu untuk menghubungi kami. Semoga harinya menyenangkan! 😊';
          navigator.clipboard.writeText(msg).then(function() {
            UI.toast('Pesan sapaan tersalin!', 'success');
          });
        });
      }

      var input = main.querySelector('.cs-reply-input');
      if (input) {
        input.addEventListener('input', function() {
          this.style.height = 'auto';
          this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
          }
        });
      }

      var form = main.querySelector('.cs-reply');
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        var content = input.value.trim();
        if (!content) return;

        var sendBtn = form.querySelector('.cs-reply-send');
        sendBtn.disabled = true;

        try {
          var insertResult = await db().from('cs_messages').insert({
            ticket_id: ticketId,
            sender: 'cs',
            sender_name: 'Admin',
            content: content
          });
          if (insertResult.error) throw insertResult.error;

          await db().from('cs_tickets').update({
            updated_at: new Date().toISOString(),
            user_read: false
          }).eq('id', ticketId).catch(() => {});

          input.value = '';
          input.style.height = 'auto';
          await _openTicket(ticketId);
          await _loadTickets();
        } catch (err) {
          UI.toast('Gagal kirim: ' + err.message, 'error');
        }
        sendBtn.disabled = false;
      });

      var msgsEl = main.querySelector('.cs-messages');
      if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

      _startChatRealtime(ticketId);
    } catch (err) {
      main.innerHTML = '<div class="cs-empty-state"><i class="fa-solid fa-circle-exclamation"></i><span>Gagal memuat pesan</span></div>';
    }
  }

  function _showChangePinModal() {
    UI.modal({
      title: '<i class="fa-solid fa-key"></i> Ganti PIN Admin',
      body:
        '<div class="cs-pin-form">' +
          '<div class="auth-field">' +
            '<label class="auth-label">PIN Saat Ini</label>' +
            '<div class="auth-input-wrap">' +
              '<i class="fa-solid fa-lock auth-input-icon"></i>' +
              '<input type="password" class="auth-input" id="pin-current" placeholder="PIN saat ini" maxlength="20">' +
            '</div>' +
          '</div>' +
          '<div class="auth-field">' +
            '<label class="auth-label">PIN Baru</label>' +
            '<div class="auth-input-wrap">' +
              '<i class="fa-solid fa-key auth-input-icon"></i>' +
              '<input type="password" class="auth-input" id="pin-new" placeholder="PIN baru (min 4 karakter)" maxlength="20">' +
            '</div>' +
          '</div>' +
          '<div class="auth-field">' +
            '<label class="auth-label">Konfirmasi PIN Baru</label>' +
            '<div class="auth-input-wrap">' +
              '<i class="fa-solid fa-key auth-input-icon"></i>' +
              '<input type="password" class="auth-input" id="pin-confirm" placeholder="Ulangi PIN baru" maxlength="20">' +
            '</div>' +
          '</div>' +
          '<div class="auth-error" id="pin-error"></div>' +
        '</div>',
      footer:
        '<button class="btn-ghost" id="pin-cancel">Batal</button>' +
        '<button class="btn-primary" id="pin-save"><i class="fa-solid fa-check"></i> Simpan</button>'
    });

    setTimeout(function() {
      document.getElementById('pin-cancel').addEventListener('click', function() {
        document.getElementById('modal-close').click();
      });

      document.getElementById('pin-save').addEventListener('click', async function() {
        var current = document.getElementById('pin-current').value;
        var newPin = document.getElementById('pin-new').value;
        var confirmPin = document.getElementById('pin-confirm').value;
        var errEl = document.getElementById('pin-error');
        var btn = document.getElementById('pin-save');

        if (current !== _getStoredPin()) {
          errEl.textContent = 'PIN saat ini salah.';
          return;
        }
        if (!newPin) {
          errEl.textContent = 'PIN baru wajib diisi.';
          return;
        }
        if (newPin.length < 4) {
          errEl.textContent = 'PIN minimal 4 karakter.';
          return;
        }
        if (newPin !== confirmPin) {
          errEl.textContent = 'Konfirmasi PIN tidak cocok.';
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

        try {
          var result = await db().from('cs_config').update({
            value: newPin,
            updated_at: new Date().toISOString()
          }).eq('key', 'admin_pin');

          if (result.error) throw result.error;

          _setStoredPin(newPin);
          document.getElementById('modal-close').click();
          UI.toast('PIN berhasil diganti!', 'success');
        } catch (err) {
          errEl.textContent = 'Gagal menyimpan: ' + err.message;
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Simpan';
        }
      });
    }, 60);
  }

  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  return { initShortcutListener: initShortcutListener };
})();
