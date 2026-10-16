import { supabase } from "@/integrations/supabase/client";

/**
 * "Clínica do acesso": a clínica ligada ao endereço pelo qual o sistema foi
 * aberto (ex.: sistema.clinicax.com.br) ou, para testar antes do DNS, ao
 * `?clinica=<id>` da tela de login. Serve SÓ para visual e pré-seleção da
 * unidade — nunca libera acesso; quem decide acesso continua sendo o RLS.
 */
export interface ClinicaAcesso {
  clinica_id: string;
  nome: string;
  logo_url: string | null;
  primary: string | null;
  accent: string | null;
}

const CHAVE = "clinica_acesso_v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Minúsculas, sem porta, sem "www." e sem ponto final. */
export function normalizarHostname(h: string | null | undefined): string {
  return (h ?? "")
    .trim()
    .toLowerCase()
    .split(":")[0]
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

/** Endereços padrão do projeto nunca consultam: ficam exatamente como hoje. */
export function hostnamePadrao(h: string): boolean {
  return (
    !h ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.endsWith(".lovable.app") ||
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".lovableproject-dev.com")
  );
}

export function idClinicaValido(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

function lerCache(): { chave: string; valor: ClinicaAcesso | null } | null {
  try {
    const raw = window.sessionStorage.getItem(CHAVE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function gravarCache(chave: string, valor: ClinicaAcesso | null) {
  try {
    window.sessionStorage.setItem(CHAVE, JSON.stringify({ chave, valor }));
  } catch {
    /* sem armazenamento: só não guarda */
  }
}

/** Valor já guardado nesta sessão do navegador (sem rede). */
export function clinicaAcessoEmCache(): ClinicaAcesso | null {
  if (typeof window === "undefined") return null;
  return lerCache()?.valor ?? null;
}

let emAndamento: Promise<ClinicaAcesso | null> | null = null;

/**
 * Resolve a clínica do acesso. `clinicaParam` (do `?clinica=`) tem prioridade
 * e fica guardado na sessão; sem ele vale o endereço do navegador.
 */
export async function resolverClinicaAcesso(clinicaParam?: string): Promise<ClinicaAcesso | null> {
  if (typeof window === "undefined") return null;
  const host = normalizarHostname(window.location.hostname);
  const cache = lerCache();
  let chave: string;
  if (idClinicaValido(clinicaParam)) chave = `id:${clinicaParam.toLowerCase()}`;
  else if (cache?.chave.startsWith("id:")) chave = cache.chave;
  else if (!hostnamePadrao(host)) chave = `host:${host}`;
  else return null;
  if (cache && cache.chave === chave) return cache.valor;
  if (emAndamento) return emAndamento;
  emAndamento = (async () => {
    try {
      const res = chave.startsWith("id:")
        ? await supabase.rpc("clinica_acesso_por_id", { _clinica_id: chave.slice(3) })
        : await supabase.rpc("clinica_por_dominio", { _hostname: chave.slice(5) });
      if (res.error) return null; // falha não é guardada: tenta de novo depois
      const linha = ((res.data ?? []) as ClinicaAcesso[])[0] ?? null;
      gravarCache(chave, linha);
      return linha;
    } catch {
      return null;
    } finally {
      emAndamento = null;
    }
  })();
  return emAndamento;
}

/** Título e ícone da aba com a marca da clínica. */
export function aplicarMarcaNaAba(c: ClinicaAcesso | null, prefixo?: string) {
  if (typeof document === "undefined" || !c) return;
  document.title = prefixo ? `${prefixo} – ${c.nome}` : c.nome;
  if (c.logo_url) {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = c.logo_url;
  }
}

/**
 * Variáveis de cor para aplicar a cor da clínica só no trecho da tela que
 * recebe o estilo (login/recuperação). Sem marca devolve undefined: nada muda.
 */
export function estiloCoresMarca(
  c: ClinicaAcesso | null,
): Record<string, string> | undefined {
  if (!c?.primary || !/^#[0-9a-f]{3,8}$/i.test(c.primary)) return undefined;
  return {
    "--primary": c.primary,
    "--primary-foreground": "#ffffff",
    "--ring": c.primary,
  };
}

/**
 * Domínio com "restringir acesso": decide se o usuário logado pode usar o
 * endereço e em qual clínica a unidade fica travada. Espelha a função do
 * banco `acesso_por_dominio` (que é quem decide de fato). Só UX/política:
 * o isolamento real continua no RLS.
 */
export interface AcessoDominio {
  restrito: boolean;
  pode: boolean;
  clinica_id: string | null;
  clinica_nome: string | null;
}

export function decidirAcessoDominio(p: {
  restrito: boolean;
  temVinculo: boolean;
  adminPlataforma: boolean;
}): boolean {
  return !p.restrito || p.temVinculo || p.adminPlataforma;
}

export const CHAVE_BLOQUEIO_DOMINIO = "clinica_dominio_bloqueio_v1";

export function mensagemBloqueioDominio(nome: string): string {
  return `Este endereço é exclusivo da equipe da ${nome}. Use o endereço da sua clínica.`;
}

/**
 * Consulta sempre (sem cache) para revalidar a cada sessão/recarga.
 * Prévia/localhost/lovable.app e o `?clinica=` de teste nunca restringem.
 * Falha na consulta = sem restrição (nunca travar o balcão por rede).
 */
export async function verificarAcessoDominio(): Promise<AcessoDominio | null> {
  if (typeof window === "undefined") return null;
  const host = normalizarHostname(window.location.hostname);
  if (hostnamePadrao(host)) return null;
  try {
    const { data, error } = await supabase.rpc("acesso_por_dominio", { _hostname: host });
    if (error) return null;
    const linha = ((data ?? []) as AcessoDominio[])[0];
    return linha?.restrito ? linha : null;
  } catch {
    return null;
  }
}
