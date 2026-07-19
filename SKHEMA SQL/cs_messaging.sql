/* ============================================
   NOTARA - Customer Service Messaging System
   ============================================
   Jalankan sekali di Supabase SQL Editor.
   ============================================ */

-- 1. TABEL cs_config (konfigurasi admin, PIN, dll)
CREATE TABLE IF NOT EXISTS public.cs_config (
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cs_config_pkey PRIMARY KEY (key)
);

-- Default admin PIN (bisa diganti dari panel admin)
INSERT INTO public.cs_config (key, value) VALUES
  ('admin_pin', '123456')
ON CONFLICT (key) DO NOTHING;

-- 2. TABEL cs_tickets (tiket laporan user)
CREATE TABLE IF NOT EXISTS public.cs_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL DEFAULT 'Laporan Baru',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cs_tickets_pkey PRIMARY KEY (id),
  CONSTRAINT cs_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- 3. TABEL cs_messages (pesan dalam tiket)
CREATE TABLE IF NOT EXISTS public.cs_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  sender text NOT NULL CHECK (sender IN ('user', 'cs')),
  sender_name text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cs_messages_pkey PRIMARY KEY (id),
  CONSTRAINT cs_messages_ticket_id_fkey FOREIGN KEY (ticket_id)
    REFERENCES public.cs_tickets(id) ON DELETE CASCADE
);

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_cs_tickets_user_id ON public.cs_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_cs_tickets_updated ON public.cs_tickets (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_messages_ticket_id ON public.cs_messages (ticket_id, created_at ASC);

-- 5. RLS - cs_config
ALTER TABLE public.cs_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read cs_config" ON public.cs_config;
DROP POLICY IF EXISTS "Service role can manage cs_config" ON public.cs_config;
DROP POLICY IF EXISTS "Authenticated users can update cs_config" ON public.cs_config;

CREATE POLICY "Authenticated users can read cs_config"
  ON public.cs_config FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update cs_config"
  ON public.cs_config FOR UPDATE
  USING (auth.role() = 'authenticated');

-- 6. RLS - cs_tickets
ALTER TABLE public.cs_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own tickets" ON public.cs_tickets;
DROP POLICY IF EXISTS "Authenticated users read all tickets" ON public.cs_tickets;
DROP POLICY IF EXISTS "Users create own tickets" ON public.cs_tickets;
DROP POLICY IF EXISTS "Authenticated users update any ticket" ON public.cs_tickets;
DROP POLICY IF EXISTS "Service role read all tickets" ON public.cs_tickets;
DROP POLICY IF EXISTS "Service role update tickets" ON public.cs_tickets;

CREATE POLICY "Users read own tickets"
  ON public.cs_tickets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users read all tickets"
  ON public.cs_tickets FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users create own tickets"
  ON public.cs_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users update any ticket"
  ON public.cs_tickets FOR UPDATE
  USING (auth.role() = 'authenticated');

-- 7. RLS - cs_messages
ALTER TABLE public.cs_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read messages in own tickets" ON public.cs_messages;
DROP POLICY IF EXISTS "Authenticated users read all messages" ON public.cs_messages;
DROP POLICY IF EXISTS "Users insert messages in own tickets" ON public.cs_messages;
DROP POLICY IF EXISTS "Authenticated users insert CS replies" ON public.cs_messages;
DROP POLICY IF EXISTS "Service role read all messages" ON public.cs_messages;
DROP POLICY IF EXISTS "Service role insert messages" ON public.cs_messages;

CREATE POLICY "Users read messages in own tickets"
  ON public.cs_messages FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM public.cs_tickets WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users read all messages"
  ON public.cs_messages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users insert messages in own tickets"
  ON public.cs_messages FOR INSERT
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM public.cs_tickets WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users insert CS replies"
  ON public.cs_messages FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
