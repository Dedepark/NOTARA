-- ============================================
-- Tabel app_config untuk menyimpan konfigurasi
-- termasuk versi terbaru yang tersedia
-- ============================================

CREATE TABLE public.app_config (
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT app_config_pkey PRIMARY KEY (key)
);

-- Insert versi terbaru yang tersedia
-- Ubah value ini setiap kali ada update baru
INSERT INTO public.app_config (key, value) VALUES
  ('latest_version', '2.3.0'),
  ('update_title', 'Notara v2.3.0'),
  ('update_message', 'Versi baru tersedia dengan perbaikan dan peningkatan fitur.'),
  ('update_url', 'https://notara-app.vercel.app');

-- ============================================
-- RLS (Row Level Security)
-- Semua user bisa baca, hanya admin yang bisa update
-- ============================================

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Semua user yang login bisa membaca konfigurasi
CREATE POLICY "Authenticated users can read app_config"
  ON public.app_config
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Hanya service role (admin) yang bisa insert/update/delete
CREATE POLICY "Service role can manage app_config"
  ON public.app_config
  FOR ALL
  USING (auth.role() = 'service_role');
