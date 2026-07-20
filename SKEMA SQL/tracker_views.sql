/* ============================================
   NOTARA - Tracker Performance Views
   RPC Functions untuk mengurangi client-side queries
   ============================================ */

-- ============================================
-- 1. get_habit_completion_by_date_range
-- Menghitung completion % per hari dalam rentang tanggal
-- Menggantikan loop 7x getLogsByDate di weekly calendar
-- ============================================
CREATE OR REPLACE FUNCTION public.get_habit_completion_by_date_range(
  p_user_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  log_date date,
  total_habits bigint,
  completed_habits bigint,
  completion_pct numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d::date AS log_date,
    COALESCE(hl.total, 0) AS total_habits,
    COALESCE(hl.completed, 0) AS completed_habits,
    CASE
      WHEN COALESCE(hl.total, 0) = 0 THEN 0
      ELSE ROUND((COALESCE(hl.completed, 0)::numeric / hl.total::numeric) * 100, 0)
    END AS completion_pct
  FROM
    generate_series(p_start_date, p_end_date, '1 day'::interval) d
  LEFT JOIN (
    SELECT
      hl2.date,
      COUNT(DISTINCT hl2.habit_id) AS total,
      COUNT(DISTINCT CASE WHEN hl2.completed THEN hl2.habit_id END) AS completed
    FROM habit_logs hl2
    JOIN habit_lists hlist ON hlist.id = hl2.habit_id
    WHERE hl2.user_id = p_user_id
      AND hlist.active = true
      AND hl2.date >= p_start_date
      AND hl2.date <= p_end_date
    GROUP BY hl2.date
  ) hl ON hl.date = d::date
  ORDER BY d::date;
$$;

COMMENT ON FUNCTION public.get_habit_completion_by_date_range IS 'Menghitung persentase completion habit per hari dalam rentang tanggal. Input: user_id, start_date, end_date. Output: log_date, total_habits, completed_habits, completion_pct.';

-- ============================================
-- 2. get_habit_monthly_stats
-- Statistik bulanan: hari aktif, rata-rata completion, streak terpanjang
-- Menggantikan _renderMonthlyStats client-side
-- ============================================
CREATE OR REPLACE FUNCTION public.get_habit_monthly_stats(
  p_user_id uuid,
  p_year integer,
  p_month integer
)
RETURNS TABLE (
  active_days bigint,
  avg_completion numeric,
  max_streak integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date date;
  v_end_date date;
  v_days_in_month integer;
  v_total_habits bigint;
  v_total_completed bigint;
  v_streak RECORD;
  v_current_streak integer := 0;
  v_max_streak integer := 0;
  v_check_date date;
  v_has_completed boolean;
BEGIN
  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (v_start_date + interval '1 month - 1 day')::date;
  v_days_in_month := EXTRACT(DAY FROM v_end_date)::integer;

  -- Hitung jumlah habit aktif
  SELECT COUNT(*) INTO v_total_habits
  FROM habit_lists
  WHERE user_id = p_user_id AND active = true;

  -- Hitung hari aktif (tanggal unik dengan minimal 1 completed)
  SELECT COUNT(DISTINCT date) INTO active_days
  FROM habit_logs
  WHERE user_id = p_user_id
    AND completed = true
    AND date >= v_start_date
    AND date <= v_end_date;

  -- Hitung total completed
  SELECT COUNT(*) INTO v_total_completed
  FROM habit_logs hl
  JOIN habit_lists hlist ON hlist.id = hl.habit_id
  WHERE hl.user_id = p_user_id
    AND hl.completed = true
    AND hlist.active = true
    AND hl.date >= v_start_date
    AND hl.date <= v_end_date;

  -- Hitung rata-rata completion
  IF v_total_habits > 0 AND v_days_in_month > 0 THEN
    avg_completion := ROUND((v_total_completed::numeric / (v_total_habits::numeric * v_days_in_month::numeric)) * 100, 0);
  ELSE
    avg_completion := 0;
  END IF;

  -- Hitung streak terpanjang (dari semua habit digabung)
  v_check_date := v_end_date;
  v_current_streak := 0;
  v_max_streak := 0;

  WHILE v_check_date >= v_start_date LOOP
    SELECT EXISTS(
      SELECT 1 FROM habit_logs hl
      JOIN habit_lists hlist ON hlist.id = hl.habit_id
      WHERE hl.user_id = p_user_id
        AND hl.completed = true
        AND hlist.active = true
        AND hl.date = v_check_date
    ) INTO v_has_completed;

    IF v_has_completed THEN
      v_current_streak := v_current_streak + 1;
      IF v_current_streak > v_max_streak THEN
        v_max_streak := v_current_streak;
      END IF;
    ELSE
      v_current_streak := 0;
    END IF;

    v_check_date := v_check_date - 1;
  END LOOP;

  max_streak := v_max_streak;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.get_habit_monthly_stats IS 'Statistik habit bulanan: active_days, avg_completion, max_streak. Input: user_id, year, month. Output: active_days, avg_completion, max_streak.';

-- ============================================
-- 3. get_finance_monthly_trend
-- Tren income/expense beberapa bulan terakhir
-- Menggantikan loop 6x getMonthlySummary di trend chart
-- ============================================
CREATE OR REPLACE FUNCTION public.get_finance_monthly_trend(
  p_user_id uuid,
  p_months integer DEFAULT 6
)
RETURNS TABLE (
  year integer,
  month integer,
  total_income numeric,
  total_expense numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH months AS (
    SELECT
      EXTRACT(YEAR FROM (CURRENT_DATE - (n || ' months')::interval))::integer AS yr,
      EXTRACT(MONTH FROM (CURRENT_DATE - (n || ' months')::interval))::integer AS mn
    FROM generate_series(0, p_months - 1) AS n
  )
  SELECT
    m.yr AS year,
    m.mn AS month,
    COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) AS total_income,
    COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS total_expense
  FROM months m
  LEFT JOIN finance_transactions ft
    ON ft.user_id = p_user_id
    AND EXTRACT(YEAR FROM ft.transaction_date) = m.yr
    AND EXTRACT(MONTH FROM ft.transaction_date) = m.mn
  GROUP BY m.yr, m.mn
  ORDER BY m.yr ASC, m.mn ASC;
$$;

COMMENT ON FUNCTION public.get_finance_monthly_trend IS 'Tren income/expense beberapa bulan terakhir. Input: user_id, p_months (default 6). Output: year, month, total_income, total_expense.';

-- ============================================
-- 4. get_mood_calendar_data
-- Data mood untuk kalender bulanan
-- Optimasi ringan tapi konsisten dengan pattern RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.get_mood_calendar_data(
  p_user_id uuid,
  p_year integer,
  p_month integer
)
RETURNS TABLE (
  entry_date date,
  mood text,
  triggers text[],
  note text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    me.date AS entry_date,
    me.mood,
    me.triggers,
    me.note
  FROM mood_entries me
  WHERE me.user_id = p_user_id
    AND EXTRACT(YEAR FROM me.date) = p_year
    AND EXTRACT(MONTH FROM me.date) = p_month
  ORDER BY me.date ASC;
$$;

COMMENT ON FUNCTION public.get_mood_calendar_data IS 'Data mood untuk kalender bulanan. Input: user_id, year, month. Output: entry_date, mood, triggers, note.';
