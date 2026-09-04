import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Detecta quando um novo bundle foi publicado (novo deploy) enquanto a aba
 * está aberta e avisa a pessoa, para que ninguém siga usando código antigo.
 *
 * POR QUE ISSO IMPORTA: os computadores da recepção ficam com o sistema aberto
 * o dia inteiro, às vezes por dias. Sem esta detecção, uma correção publicada
 * de manhã só chega àquela máquina quando alguém fecha o navegador — e a
 * equipe relata que "o sistema continua com o problema" olhando para uma tela
 * que é, literalmente, a versão antiga.
 *
 * Como funciona:
 * - Faz um fetch do `index.html` (com `cache: "no-store"`) na montagem e
 *   periodicamente enquanto a aba está visível.
 * - Junta os nomes de TODOS os arquivos `/assets/*.js` citados no HTML — eles
 *   carregam o hash do build e mudam a cada publicação — e compara com o
 *   primeiro conjunto visto na sessão.
 *
 * CUIDADO AO MEXER NA EXTRAÇÃO: a versão anterior procurava apenas por
 * `<script src="...js">`. Este app injeta o bundle por
 * `<link rel="modulepreload">` e por um `import("/assets/...")` inline, então
 * a única tag `<script src>` da página é a do script de analytics — que nunca
 * muda. Resultado: a comparação dava sempre igual e a atualização nunca era
 * detectada, em nenhuma máquina. Por isso a busca hoje é no HTML inteiro, e
 * não só dentro de tags de script.
 */
const STORAGE_KEY = "__build_hash_seen__";
const CHECK_INTERVAL_MS = 60_000;

function extractMainScript(html: string): string | null {
  // Todos os bundles com hash citados na página (modulepreload, import(),
  // <script src>): qualquer publicação nova troca esses nomes.
  const matches = Array.from(html.matchAll(/\/assets\/[A-Za-z0-9._-]+\.js/g));
  if (matches.length === 0) return null;
  return Array.from(new Set(matches.map((m) => m[0])))
    .sort()
    .join("|");
}

/** Já avisamos nesta aba? Evita repetir o aviso a cada checagem. */
let avisado = false;

function recarregar() {
  // reload(true) foi descontinuado; forçamos com cache-bust na URL
  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(Date.now()));
  window.location.replace(url.toString());
}

export function useAutoReloadOnNewBuild(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;

    const check = async () => {
      if (avisado || document.hidden) return;
      try {
        const res = await fetch(`/?_cb=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const html = await res.text();
        const current = extractMainScript(html);
        if (!current) return;
        const seen = sessionStorage.getItem(STORAGE_KEY);
        if (!seen) {
          sessionStorage.setItem(STORAGE_KEY, current);
          return;
        }
        if (seen !== current && !cancelled) {
          avisado = true;
          sessionStorage.setItem(STORAGE_KEY, current);
          // AVISO, e não recarga automática: a tela pode estar no meio de um
          // agendamento ou de um recebimento, com campos preenchidos que uma
          // recarga silenciosa jogaria fora. O aviso fica na tela até alguém
          // clicar — sem tempo para sumir sozinho, porque quem está de olho no
          // paciente não vê um alerta de cinco segundos.
          toast.info("Há uma versão nova do sistema.", {
            description: "Atualize quando terminar o que está fazendo.",
            duration: Infinity,
            action: { label: "Atualizar agora", onClick: () => recarregar() },
          });
        }
      } catch {
        // silencioso — offline ou rede instável não deve incomodar o usuário
      }
    };

    void check();
    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}
