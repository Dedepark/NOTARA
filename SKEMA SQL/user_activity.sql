-- ============================================
-- Tabel user_activity untuk menyimpan data
-- aktivitas menulis harian (heatmap & stats)
-- ============================================

CREATE TABLE public.user_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity_date date NOT NULL,
  words integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_activity_pkey PRIMARY KEY (id),
  CONSTRAINT user_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_activity_user_date_unique UNIQUE (user_id, activity_date)
);

-- Index untuk query cepat
CREATE INDEX idx_user_activity_user_date ON public.user_activity (user_id, activity_date DESC);

-- ============================================
-- RLS (Row Level Security)
-- ============================================

ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

-- User hanya bisa baca data sendiri
CREATE POLICY "Users can read own activity"
  ON public.user_activity
  FOR SELECT
  USING (auth.uid() = user_id);

-- User hanya bisa insert data sendiri
CREATE POLICY "Users can insert own activity"
  ON public.user_activity
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User hanya bisa update data sendiri
CREATE POLICY "Users can update own activity"
  ON public.user_activity
  FOR UPDATE
  USING (auth.uid() = user_id);

-- User tidak bisa hapus (data activity bersifat append-only)
