/* ============================================
   NOTARA - CS Ticket Status & User Name
   ============================================
   Jalankan sekali di Supabase SQL Editor.
   ============================================ */

-- 1. Tambah kolom
ALTER TABLE public.cs_tickets
  ADD COLUMN IF NOT EXISTS user_read boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cs_replied boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cs_read boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS user_name text NOT NULL DEFAULT 'User';

-- 2. Update tiket existing berdasarkan pesan terakhir
UPDATE public.cs_tickets t
SET user_read = (
  SELECT CASE WHEN m.sender = 'cs' THEN false ELSE true END
  FROM public.cs_messages m
  WHERE m.ticket_id = t.id
  ORDER BY m.created_at DESC LIMIT 1
),
cs_replied = (
  SELECT CASE WHEN m.sender = 'user' THEN false ELSE true END
  FROM public.cs_messages m
  WHERE m.ticket_id = t.id
  ORDER BY m.created_at DESC LIMIT 1
),
cs_read = (
  SELECT CASE WHEN m.sender = 'user' THEN false ELSE true END
  FROM public.cs_messages m
  WHERE m.ticket_id = t.id
  ORDER BY m.created_at DESC LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM public.cs_messages m WHERE m.ticket_id = t.id);
