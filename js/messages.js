/* js/messages.js - User Message Inbox & New Report */
'use strict';
window.Notara = window.Notara || {};

window.Notara.Messages = (() => {
  const db = () => window.Notara.db;
  const R  = window.Notara.Router;
  const UI = window.Notara.UI;
  const Auth = window.Notara.Auth;
  var _inboxChannel = null;
  var _chatChannel = null;
  var _activeTicketId = null;

  function _stopInboxRealtime() {
    if (_inboxChannel) { db().removeChannel(_inboxChannel); _inboxChannel = null; }
  }

  function _stopChatRealtime() {
    if (_chatChannel) { db().removeChannel(_chatChannel); _chatChannel = null; }
  }

  async function _updateNavBadge() {
    var userId = Auth.getUser()?.id;
    if (!userId) return;
    var { data: tickets } = await db().from('cs_tickets').select('user_read').eq('user_id', userId);
    var unread = 0;
    if (tickets) {
      for (var i = 0; i < tickets.length; i++) {
        if (!tickets[i].user_read) unread++;
      }
    }
    var navMsg = document.querySelector('.nav-item[data-page="messages"]');
    if (!navMsg) return;
    var existing = navMsg.querySelector('.nav-reddot');
    if (unread > 0 && !existing) {
      var dot = document.createElement('span');
      dot.className = 'nav-reddot';
      navMsg.appendChild(dot);
    } else if (unread === 0 && existing) {
      existing.remove();
    }
  }

  function _updateTicketCard(ticketId) {
    var card = document.querySelector('.msg-ticket-card[data-tid="' + ticketId + '"]');
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
        var time = UI.formatDate(t.updated_at);
        var reddot = !t.user_read ? '<span class="ticket-reddot"></span>' : '';
        var sentInd = userSent > 0
          ? '<span class="ticket-ind ticket-done"><i class="fa-solid fa-check"></i> Terkirim</span>'
          : '<span class="ticket-ind ticket-waiting"><i class="fa-solid fa-xmark"></i> Belum terkirim</span>';
        var readInd = t.user_read
          ? '<span class="ticket-ind ticket-done"><i class="fa-solid fa-check"></i> Dibaca</span>'
          : '<span class="ticket-ind ticket-waiting"><i class="fa-solid fa-xmark"></i> Belum dibaca</span>';
        var replyInd = csSent > 0
          ? '<span class="ticket-ind ticket-done"><i class="fa-solid fa-check"></i> Dibalas (' + csSent + ')</span>'
          : '<span class="ticket-ind ticket-waiting"><i class="fa-solid fa-xmark"></i> Belum dibalas</span>';
        if (card) {
          card.querySelector('.msg-ticket-time').innerHTML = reddot + time;
          card.querySelector('.msg-ticket-meta').innerHTML = sentInd + readInd + replyInd;
        }
        _updateNavBadge();
      });
    });
  }

  function _startInboxRealtime(userId) {
    _stopInboxRealtime();
    _inboxChannel = db().channel('user-inbox-' + userId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cs_tickets',
        filter: 'user_id=eq.' + userId
      }, function(payload) {
        if (_activeTicketId) return;
        if (payload.eventType === 'UPDATE') {
          _updateTicketCard(payload.new.id);
        } else {
          renderInbox();
        }
        _updateNavBadge();
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'cs_messages'
      }, function(payload) {
        if (_activeTicketId && payload.new.ticket_id === _activeTicketId) return;
        _updateTicketCard(payload.new.ticket_id);
        _updateNavBadge();
      })
      .subscribe();
  }

  function _startChatRealtime(ticketId) {
    _stopChatRealtime();
    _chatChannel = db().channel('user-chat-' + ticketId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'cs_messages',
        filter: 'ticket_id=eq.' + ticketId
      }, function(payload) {
        var body = document.getElementById('msg-detail-body');
        if (!body) return;
        var m = payload.new;
        var isCS = m.sender === 'cs';
        var cls = isCS ? 'msg-left' : 'msg-right';
        var d = new Date(m.created_at);
        var time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        var div = document.createElement('div');
        div.className = 'msg-bubble ' + cls;
        div.innerHTML = '<div class="msg-text">' + _esc(m.content) + '</div><div class="msg-time">' + time + '</div>';
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
        db().from('cs_tickets').update({ user_read: false }).eq('id', ticketId).then(function() {
          _updateTicketCard(ticketId);
          _updateNavBadge();
        });
      })
      .subscribe();
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

  async function renderInbox() {
    _stopChatRealtime();
    _activeTicketId = null;
    var main = document.getElementById('app-main');
    UI.setTitle('Pesan');
    UI.setActiveNav('messages');
    main.innerHTML = '<div class="page-loading"><div class="loader-ring"></div></div>';

    var mobNav = document.getElementById('mobile-bottom-nav');
    if (mobNav) mobNav.style.display = '';

    var userId = Auth.getUser()?.id;
    var { data: tickets, error } = await db()
      .from('cs_tickets').select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      main.innerHTML = '<div class="empty-state" style="min-height:60vh"><h3>Gagal memuat</h3><p>' + _esc(error.message) + '</p></div>';
      return;
    }
    if (!tickets || !tickets.length) {
      main.innerHTML = '<div class="messages-page page-enter"><div class="messages-header"><h2><i class="fa-solid fa-envelope"></i> Pesan</h2></div><div class="empty-state" style="min-height:50vh"><i class="fa-solid fa-envelope-open empty-icon" style="opacity:0.25"></i><h3>Belum ada pesan</h3><p>Kirim laporan dari menu Pengaturan</p></div></div>';
      _startInboxRealtime(userId);
      _updateNavBadge();
      return;
    }

    var ids = tickets.map(function(t) { return t.id; });
    var counts = await _getTicketCounts(ids);
    for (var i = 0; i < tickets.length; i++) {
      var c = counts[tickets[i].id] || { userSent: 0, csSent: 0 };
      tickets[i]._userSent = c.userSent;
      tickets[i]._csSent = c.csSent;
    }

    main.innerHTML = '<div class="messages-page page-enter"><div class="messages-header"><h2><i class="fa-solid fa-envelope"></i> Pesan</h2><span class="messages-count">' + tickets.length + ' laporan</span></div><div class="messages-list" id="messages-list">' + tickets.map(_buildTicketCard).join('') + '</div></div>';

    document.querySelectorAll('.msg-ticket-card').forEach(function(c) {
      c.addEventListener('click', function() { _openDetail(c.dataset.tid); });
    });

    _startInboxRealtime(userId);
    _updateNavBadge();
  }

  function _buildTicketCard(t) {
    var statusHtml = t.status === 'open'
      ? '<i class="fa-solid fa-circle" style="color:var(--label-easy);font-size:0.5rem"></i> Aktif'
      : '<i class="fa-solid fa-circle-check" style="color:var(--text-3);font-size:0.55rem"></i> Selesai';
    var time = UI.formatDate(t.updated_at);
    var reddot = !t.user_read ? '<span class="ticket-reddot"></span>' : '';

    var userSent = t._userSent || 0;
    var csSent = t._csSent || 0;

    var sentIndicator = userSent > 0
      ? '<span class="ticket-ind ticket-done"><i class="fa-solid fa-check"></i> Terkirim</span>'
      : '<span class="ticket-ind ticket-waiting"><i class="fa-solid fa-xmark"></i> Belum terkirim</span>';
    var readIndicator = t.user_read
      ? '<span class="ticket-ind ticket-done"><i class="fa-solid fa-check"></i> Dibaca</span>'
      : '<span class="ticket-ind ticket-waiting"><i class="fa-solid fa-xmark"></i> Belum dibaca</span>';
    var replyIndicator = csSent > 0
      ? '<span class="ticket-ind ticket-done"><i class="fa-solid fa-check"></i> Dibalas (' + csSent + ')</span>'
      : '<span class="ticket-ind ticket-waiting"><i class="fa-solid fa-xmark"></i> Belum dibalas</span>';

    return '<div class="msg-ticket-card" data-tid="' + t.id + '">' +
      '<div class="msg-ticket-top">' +
        '<span class="msg-ticket-status">' + statusHtml + '</span>' +
        '<span class="msg-ticket-time">' + reddot + time + '</span>' +
      '</div>' +
      '<div class="msg-ticket-subject">' + _esc(t.subject) + '</div>' +
      '<div class="msg-ticket-meta">' + sentIndicator + readIndicator + replyIndicator + '</div>' +
    '</div>';
  }

  async function _openDetail(ticketId) {
    _activeTicketId = ticketId;
    var main = document.getElementById('app-main');
    main.innerHTML = '<div class="page-loading"><div class="loader-ring"></div></div>';
    var mobNav = document.getElementById('mobile-bottom-nav');
    if (mobNav) mobNav.style.display = 'none';

    var result = await Promise.all([
      db().from('cs_tickets').select('*').eq('id', ticketId).single(),
      db().from('cs_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true })
    ]);
    var ticket = result[0].data;
    var msgs = result[1].data;

    if (!ticket) { R.go('messages'); return; }

    await db().from('cs_tickets').update({ user_read: true }).eq('id', ticketId);

    var messagesHtml = '';
    if (msgs && msgs.length) {
      for (var i = 0; i < msgs.length; i++) {
        messagesHtml += _buildBubble(msgs[i]);
      }
    }

    main.innerHTML =
      '<div class="msg-detail-page page-enter">' +
        '<div class="msg-detail-header">' +
          '<button class="icon-btn" id="msg-back"><i class="fa-solid fa-arrow-left"></i></button>' +
          '<div class="msg-detail-info">' +
            '<div class="msg-detail-status"><i class="fa-solid fa-headset" style="color:var(--accent);margin-right:4px"></i> Customer Service</div>' +
            '<div class="msg-detail-subject">' + _esc(ticket.subject) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="msg-detail-body" id="msg-detail-body">' + messagesHtml + '</div>' +
        '<div class="msg-detail-footer">' +
          '<div class="msg-read-only-notice">' +
            '<i class="fa-solid fa-lock"></i> Percakapan ini bersifat read-only. Hubungi Customer Service untuk merespons.' +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('msg-back').addEventListener('click', function() {
      _activeTicketId = null;
      _stopChatRealtime();
      var mobNav = document.getElementById('mobile-bottom-nav');
      if (mobNav) mobNav.style.display = '';
      renderInbox();
    });
    var body = document.getElementById('msg-detail-body');
    if (body) body.scrollTop = body.scrollHeight;

    _startChatRealtime(ticketId);
  }

  function _buildBubble(m) {
    var isCS = m.sender === 'cs';
    var cls = isCS ? 'msg-left' : 'msg-right';
    var d = new Date(m.created_at);
    var time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    return '<div class="msg-bubble ' + cls + '">' +
      '<div class="msg-text">' + _esc(m.content) + '</div>' +
      '<div class="msg-time">' + time + '</div>' +
    '</div>';
  }

  function showNewReportModal() {
    UI.modal({
      title: '<i class="fa-solid fa-headset"></i> Kirim Laporan',
      body:
        '<div style="display:flex;flex-direction:column;gap:var(--space-md)">' +
          '<div class="auth-field">' +
            '<label class="auth-label">Judul Laporan</label>' +
            '<div class="auth-input-wrap">' +
              '<i class="fa-solid fa-heading auth-input-icon"></i>' +
              '<input type="text" class="auth-input" id="cs-report-subject" placeholder="Ringkasan masalah..." maxlength="100">' +
            '</div>' +
          '</div>' +
          '<div class="auth-field">' +
            '<label class="auth-label">Pesan</label>' +
            '<textarea class="new-post-textarea" id="cs-report-content" placeholder="Jelaskan masalah, kritik, atau saran..." rows="5" maxlength="1000" style="min-height:120px"></textarea>' +
            '<div style="font-size:0.75rem;color:var(--text-3);margin-top:4px" id="cs-report-count">0 / 1000</div>' +
          '</div>' +
          '<div class="auth-error" id="cs-report-error"></div>' +
        '</div>',
      footer:
        '<button class="btn-ghost" id="cs-report-cancel">Batal</button>' +
        '<button class="btn-primary" id="cs-report-submit" style="margin-left:8px"><i class="fa-solid fa-paper-plane"></i> Kirim</button>'
    });

    setTimeout(function() {
      var ta = document.getElementById('cs-report-content');
      if (ta) {
        ta.addEventListener('input', function() {
          document.getElementById('cs-report-count').textContent = ta.value.length + ' / 1000';
        });
      }

      document.getElementById('cs-report-cancel').addEventListener('click', function() {
        document.getElementById('modal-close').click();
      });

      document.getElementById('cs-report-submit').addEventListener('click', async function() {
        var subject = document.getElementById('cs-report-subject').value.trim();
        var content = document.getElementById('cs-report-content').value.trim();
        var errEl = document.getElementById('cs-report-error');
        var btn = document.getElementById('cs-report-submit');

        if (window.Notara.Auth.isGuest()) { errEl.textContent = 'Masuk dulu untuk mengirim laporan.'; return; }
        if (!subject) { errEl.textContent = 'Judul wajib diisi.'; return; }
        if (!content) { errEl.textContent = 'Pesan wajib diisi.'; return; }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';

        try {
          var userId = Auth.getUser().id;
          var userName = Auth.getName();

          var ticketResult = await db().from('cs_tickets').insert({
            user_id: userId,
            subject: subject,
            user_name: userName,
            cs_replied: false
          }).select().single();

          if (ticketResult.error) throw ticketResult.error;

          var msgResult = await db().from('cs_messages').insert({
            ticket_id: ticketResult.data.id,
            sender: 'user',
            sender_name: userName,
            content: content
          });

          if (msgResult.error) throw msgResult.error;

          document.getElementById('modal-close').click();
          UI.toast('Laporan berhasil dikirim!', 'success');
        } catch (err) {
          errEl.textContent = 'Gagal: ' + err.message;
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Kirim';
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

  return { renderInbox: renderInbox, showNewReportModal: showNewReportModal };
})();
