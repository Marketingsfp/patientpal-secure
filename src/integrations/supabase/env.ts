// Resolve as variáveis PÚBLICAS do Supabase (URL + chave publicável/anon).
//
// O mesmo código roda em três ambientes que nomeiam as variáveis de formas
// diferentes, e cada um expõe uma fonte distinta:
//
//   - Browser (build do Vite): só existe `import.meta.env`, e apenas as chaves
//     com o prefixo configurado (normalmente VITE_) são embutidas no bundle.
//     Tocar em `process.env` aqui estoura "process is not defined".
//   - SSR / server functions: `process.env` com os nomes sem prefixo.
//   - Preview do Lovable: NÃO injeta nenhuma das duas no browser. O plugin
//     @lovable.dev/vite-tanstack-config só faz `loadEnv(mode, cwd, "VITE_")`
//     a partir de um .env do repositório — e o .env é gitignored, logo não
//     existe naquele build. Por isso os FALLBACK abaixo são obrigatórios.
//
// Por isso as duas fontes são lidas com guarda, os dois padrões de nome são
// aceitos, e há um valor fixo como último recurso. A chave anon também atende
// por VITE_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY, que é como o painel do
// Supabase a chama.
//
// Só entram aqui valores públicos (protegidos por RLS). Segredos de servidor —
// SUPABASE_SERVICE_ROLE_KEY à frente — continuam sendo lidos direto de
// process.env em código de servidor.

type EnvRecord = Record<string, string | undefined>;

/**
 * Valores públicos do projeto Supabase deste repositório.
 *
 * NÃO são segredos: a URL é um endereço público e a chave `role=anon` é
 * desenhada para ir no bundle do navegador de qualquer app Supabase — o que
 * protege os dados é o RLS, não o sigilo desta chave. Mantê-las aqui garante
 * que o app suba mesmo em ambientes que não definem variável nenhuma (o
 * preview do Lovable é exatamente esse caso).
 *
 * Uma variável de ambiente, quando existe, sempre tem precedência sobre estes
 * valores — então apontar o app para outro projeto Supabase continua sendo
 * questão de definir VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.
 *
 * NUNCA acrescente aqui service role key, tokens de webhook ou qualquer
 * credencial de servidor.
 */
const FALLBACK_URL = "https://odllhxwadsrnhphzoevl.supabase.co";
const FALLBACK_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbGxoeHdhZHNybmhwaHpvZXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NDA2MDIsImV4cCI6MjA5NDUxNjYwMn0.e-ovXl2WTkNqcah4e1muedN6cDT9zm-8AG6UGo2KGFc";

/**
 * Acessos literais a `import.meta.env.X` são substituídos em build time pelo
 * Vite; acesso dinâmico (`import.meta.env[nome]`) não é. Por isso cada nome
 * aceito aparece escrito por extenso. O try/catch cobre runtimes em que
 * `import.meta.env` não existe.
 */
function readViteEnv(): EnvRecord {
  try {
    return {
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
      SUPABASE_URL: import.meta.env.SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: import.meta.env.SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_ANON_KEY: import.meta.env.SUPABASE_ANON_KEY,
    };
  } catch {
    return {};
  }
}

function readProcessEnv(): EnvRecord {
  try {
    return typeof process !== "undefined" && process.env ? (process.env as EnvRecord) : {};
  } catch {
    return {};
  }
}

/** Nomes aceitos, em ordem de precedência. */
const URL_KEYS = ["VITE_SUPABASE_URL", "SUPABASE_URL"] as const;
const PUBLISHABLE_KEYS = [
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
] as const;

function pick(names: readonly string[]): string | undefined {
  const sources = [readViteEnv(), readProcessEnv()];
  for (const name of names) {
    for (const source of sources) {
      const value = source[name];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
  }
  return undefined;
}

export function getSupabaseUrl(): string | undefined {
  return pick(URL_KEYS) ?? FALLBACK_URL;
}

export function getSupabasePublishableKey(): string | undefined {
  return pick(PUBLISHABLE_KEYS) ?? FALLBACK_PUBLISHABLE_KEY;
}

/**
 * Mensagem única de erro, listando todos os nomes aceitos para cada variável
 * que faltou — assim o preview do Lovable e o localhost dizem exatamente o que
 * configurar, em vez de citar só um dos padrões.
 *
 * Com os FALLBACK acima isto na prática não dispara mais para a URL e a chave
 * pública; fica mantido como rede de segurança caso os fallbacks sejam
 * removidos ou esvaziados no futuro.
 */
export function missingSupabaseEnvMessage(url?: string, key?: string): string | undefined {
  const missing: string[] = [];
  if (!url) missing.push(URL_KEYS.join(" ou "));
  if (!key) missing.push(PUBLISHABLE_KEYS.join(" ou "));
  if (missing.length === 0) return undefined;
  return (
    `Missing Supabase environment variable(s): ${missing.join("; ")}. ` +
    `Configure no .env local (veja .env.example) ou conecte o Supabase no Lovable Cloud.`
  );
}

/** Retorna URL + chave pública, ou lança com uma mensagem acionável. */
export function requireSupabasePublicEnv(): { url: string; publishableKey: string } {
  const url = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();
  const message = missingSupabaseEnvMessage(url, publishableKey);

  if (message) {
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return { url: url!, publishableKey: publishableKey! };
}
