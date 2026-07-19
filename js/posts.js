/* js/posts.js — Social Feed: Kata-kata & Quotes */
'use strict';

window.Notara = window.Notara || {};

window.Notara.Posts = (() => {
  const db = () => window.Notara.db;

  /* ── Ambil feed (paginasi) ────────────────── */
  // likes_count & comments_count dikelola oleh DB trigger — selalu akurat
  async function getFeed(page = 0, limit = 20) {
    const from = page * limit;
    const to   = from + limit - 1;
    const { data, error } = await db()
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    return data || [];
  }

  /* ── Buat post baru ───────────────────────── */
  async function create(content) {
    const userId     = window.Notara.Auth.getUser()?.id;
    const authorName = window.Notara.Auth.getName();
    if (!content.trim()) throw new Error('Konten tidak boleh kosong');
    const { data, error } = await db()
      .from('posts')
      .insert({
        user_id:     userId,
        content:     content.trim(),
        author_name: authorName,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /* ── Hapus post ───────────────────────────── */
  async function remove(id) {
    const { error } = await db()
      .from('posts')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  }

  /* ── Cek apakah user sudah like ──────────── */
  async function hasLiked(postId) {
    const userId = window.Notara.Auth.getUser()?.id;
    const { data } = await db()
      .from('post_likes')
      .select('post_id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();
    return !!data;
  }

  /* ── Ambil set postId yang sudah di-like ──── */
  async function getLikedIds(postIds) {
    if (!postIds.length) return new Set();
    const userId = window.Notara.Auth.getUser()?.id;
    const { data } = await db()
      .from('post_likes')
      .select('post_id')
      .in('post_id', postIds)
      .eq('user_id', userId);
    return new Set((data || []).map(r => r.post_id));
  }

  /* ── Toggle like ─────────────────────────────
     DB trigger (_notara_update_likes_count) otomatis
     update posts.likes_count saat INSERT / DELETE.
  ──────────────────────────────────────────────── */
  async function toggleLike(postId) {
    const userId = window.Notara.Auth.getUser()?.id;
    const liked  = await hasLiked(postId);

    if (liked) {
      const { error } = await db().from('post_likes').delete()
        .eq('post_id', postId).eq('user_id', userId);
      if (error) throw error;
    } else {
      const { error } = await db().from('post_likes')
        .insert({ post_id: postId, user_id: userId });
      if (error) throw error;
    }

    // Baca count terbaru dari posts (sudah diupdate trigger)
    const { data, error } = await db()
      .from('posts')
      .select('likes_count')
      .eq('id', postId)
      .single();
    if (error) throw error;

    return { liked: !liked, count: data.likes_count };
  }

  /* ── Ambil komentar ───────────────────────── */
  async function getComments(postId) {
    const { data, error } = await db()
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  /* ── Tambah komentar ──────────────────────────
     DB trigger (_notara_update_comments_count) otomatis
     update posts.comments_count saat INSERT.
  ──────────────────────────────────────────────── */
  async function addComment(postId, content) {
    const userId     = window.Notara.Auth.getUser()?.id;
    const authorName = window.Notara.Auth.getName();
    if (!content.trim()) throw new Error('Komentar tidak boleh kosong');

    const { data, error } = await db()
      .from('post_comments')
      .insert({
        post_id:     postId,
        user_id:     userId,
        author_name: authorName,
        content:     content.trim(),
      })
      .select()
      .single();
    if (error) throw error;

    // Baca count terbaru dari posts (sudah diupdate trigger)
    const { data: post } = await db()
      .from('posts')
      .select('comments_count')
      .eq('id', postId)
      .single();

    return { comment: data, count: post?.comments_count ?? 0 };
  }

  /* ── Hapus komentar ───────────────────────── */
  async function removeComment(id) {
    const { data: comment, error: fetchErr } = await db()
      .from('post_comments')
      .select('post_id')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    const { error } = await db()
      .from('post_comments')
      .delete()
      .eq('id', id);
    if (error) throw error;

    const postId = comment?.post_id;
    let newCount = 0;
    if (postId) {
      const { data: post } = await db()
        .from('posts')
        .select('comments_count')
        .eq('id', postId)
        .single();
      newCount = post?.comments_count ?? 0;
    }

    return { deleted: true, postId, count: newCount };
  }

  return {
    getFeed, create, remove,
    hasLiked, getLikedIds, toggleLike,
    getComments, addComment, removeComment,
  };
})();