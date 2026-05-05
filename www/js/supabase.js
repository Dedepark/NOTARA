/* js/supabase.js — Supabase client singleton */
'use strict';

window.Notara = window.Notara || {};

(() => {
  const SUPABASE_URL  = 'https://qsfeexaupchxcsvzsnds.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZmVleGF1cGNoeGNzdnpzbmRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3OTM3MzQsImV4cCI6MjA5MTM2OTczNH0.UZ11eU_d8mpoUamXY0PXxZGB_2EmmsXGpeyTrvaZSGc';

  window.Notara.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    }
  });
})();