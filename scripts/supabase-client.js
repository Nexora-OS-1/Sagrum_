import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.SAGRUM_SUPABASE_CONFIG || {};
const hasKey = typeof config.publishableKey === 'string'
  && config.publishableKey.length > 20
  && !config.publishableKey.startsWith('PASTE_');

export const supabase = config.url && hasKey
  ? createClient(config.url, config.publishableKey)
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Doplň Supabase URL a publishable key v scripts/supabase-config.js.');
  }
  return supabase;
}
