/* ============================================
   NOTARA - Tracker System Schema
   Mood, Habits & Finance Tracker
   ============================================ */

-- 1. MOOD TRACKER
CREATE TABLE IF NOT EXISTS public.mood_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  mood text NOT NULL CHECK (mood IN ('very_happy', 'happy', 'neutral', 'sad', 'very_sad')),
  triggers text[] DEFAULT '{}',
  note text DEFAULT '',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mood_entries_pkey PRIMARY KEY (id),
  CONSTRAINT mood_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT mood_entries_user_date_unique UNIQUE (user_id, date)
);

-- 2. HABIT TRACKER - Master List
CREATE TABLE IF NOT EXISTS public.habit_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT habit_lists_pkey PRIMARY KEY (id),
  CONSTRAINT habit_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- 3. HABIT TRACKER - Daily Logs
CREATE TABLE IF NOT EXISTS public.habit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  habit_id uuid NOT NULL,
  date date NOT NULL,
  completed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT habit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT habit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT habit_logs_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES public.habit_lists(id),
  CONSTRAINT habit_logs_user_habit_date_unique UNIQUE (user_id, habit_id, date)
);

-- 4. FINANCE TRACKER - Transactions
CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  amount numeric(15, 2) NOT NULL CHECK (amount > 0),
  category text NOT NULL,
  description text DEFAULT '',
  transaction_date timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT finance_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT finance_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- 5. FINANCE TRACKER - Categories
CREATE TABLE IF NOT EXISTS public.finance_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  icon text DEFAULT 'tag',
  color text DEFAULT '#7c6af7',
  type text NOT NULL CHECK (type IN ('income', 'expense', 'both')),
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT finance_categories_pkey PRIMARY KEY (id),
  CONSTRAINT finance_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- RLS Polices
ALTER TABLE public.mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

-- Mood
CREATE POLICY "Users can view own mood" ON mood_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mood" ON mood_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mood" ON mood_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own mood" ON mood_entries FOR DELETE USING (auth.uid() = user_id);

-- Habits
CREATE POLICY "Users can view own habits" ON habit_lists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own habits" ON habit_lists FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view own habit logs" ON habit_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own habit logs" ON habit_logs FOR ALL USING (auth.uid() = user_id);

-- Finance
CREATE POLICY "Users can view own transactions" ON finance_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own transactions" ON finance_transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view own categories" ON finance_categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own categories" ON finance_categories FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mood_entries_user_date ON mood_entries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_habit_lists_user ON habit_lists(user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date ON habit_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, date);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_user_date ON finance_transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_categories_user ON finance_categories(user_id, sort_order);

-- Default Finance Categories (insert via migration)
