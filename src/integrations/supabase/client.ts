// Gerado automaticamente pelo Lovable; a leitura de env foi movida para
// ./env.ts para aceitar tanto VITE_SUPABASE_* quanto SUPABASE_*.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { brokeredPreviewStorage } from "./previewAuthStorage";
import { requireSupabasePublicEnv } from "./env";

function createSupabaseClient() {
  // Aceita os nomes do Vite (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
  // ou _ANON_KEY) e os do Lovable (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY),
  // vindos de import.meta.env no browser ou de process.env no SSR.
  const { url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY } =
    requireSupabasePublicEnv();

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
