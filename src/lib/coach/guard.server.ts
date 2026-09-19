/**
 * Guarda das funções de servidor do Coach.
 *
 * Antes cada função só exigia estar logado: qualquer usuário autenticado podia
 * chamar a IA, de qualquer clínica, mandando a própria "tabela de serviços" no
 * corpo da requisição. Agora toda chamada informa a clínica, é conferida contra
 * a permissão do módulo Coach, tem o conteúdo da clínica lido no servidor e
 * fica registrada em `coach_uso_ia`, com limite diário por pessoa e por clínica.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { selecionarParaIA } from "./base-conhecimento";

export type ClienteCoach = SupabaseClient<any, any, any>;

export type ConfigCoachServidor = {
  /** Base gerada do sistema (sem o complemento). */
  base: string;
  scripts: { titulo: string; conteudo: string }[];
  checklist: string[];
  complemento: string;
  reterAudioDias: number;
};

/** Confere o acesso ao módulo Coach na clínica informada. */
export async function garantirAcessoCoach(
  db: ClienteCoach,
  clinicaId: string,
  nivel: "read" | "write",
): Promise<string> {
  if (!clinicaId) throw new Error("Selecione uma clínica.");
  const { data: sessao } = await db.auth.getUser();
  const userId = sessao?.user?.id;
  if (!userId) throw new Error("Sessão expirada. Entre novamente.");
  const { data, error } = await db.rpc("has_module_access", {
    _user_id: userId,
    _clinica_id: clinicaId,
    _modulo: "coach",
    _nivel: nivel,
  });
  if (error) {
    console.error("[coach] permissão", error.message);
    throw new Error("Não foi possível conferir seu acesso ao Coach.");
  }
  if (!data) {
    throw new Error(
      nivel === "write"
        ? "Só a gestão do Coach pode fazer isso nesta clínica."
        : "Você não tem acesso ao Coach nesta clínica.",
    );
  }
  return userId;
}

/**
 * Conteúdo da clínica (tabela de serviços, scripts, checklist) lido SEMPRE no
 * servidor — nunca aceito do navegador.
 */
export async function configDaClinica(
  db: ClienteCoach,
  clinicaId: string,
): Promise<ConfigCoachServidor> {
  const { data } = await db
    .from("coach_config_clinica")
    .select("tabela_servicos, scripts, checklist, complemento, reter_audio_dias")
    .eq("clinica_id", clinicaId)
    .maybeSingle();

  const scriptsBrutos = Array.isArray(data?.scripts) ? data?.scripts : [];
  const scripts = (scriptsBrutos as { titulo?: string; conteudo?: string }[])
    .filter((s) => (s?.conteudo ?? "").trim())
    .slice(0, 10)
    .map((s) => ({
      titulo: String(s.titulo ?? "").slice(0, 160),
      conteudo: String(s.conteudo ?? "").slice(0, 4000),
    }));

  const checklistBruto = Array.isArray(data?.checklist) ? data?.checklist : [];
  const checklist = (checklistBruto as unknown[])
    .map((i) => String(i ?? "").trim())
    .filter(Boolean)
    .slice(0, 30);

  const complemento = String(data?.complemento ?? "").trim();
  const base = String(data?.tabela_servicos ?? "").trim();

  return {
    base,
    scripts,
    checklist,
    complemento,
    reterAudioDias: Number(data?.reter_audio_dias ?? 30) || 30,
  };
}

/**
 * Recorte da base pelo assunto, com teto de caracteres. O prompt nunca leva a
 * base inteira: no treino o teto é bem menor, porque a base vai em TODO turno.
 */
export function baseParaPrompt(
  config: ConfigCoachServidor,
  contexto: string,
  teto: number,
): string {
  return selecionarParaIA(config.base, {
    contexto,
    complemento: config.complemento,
    teto,
  });
}

/** Texto plano dos scripts, do jeito que os prompts esperam. */
export function scriptsEmTexto(scripts: { titulo: string; conteudo: string }[]): string {
  return scripts
    .map((s, i) => `Script ${i + 1} — ${s.titulo || "Sem título"}:\n${s.conteudo.trim()}`)
    .join("\n\n");
}

/**
 * Registra o uso e aplica o limite diário. Levanta erro (mensagem pronta para
 * o usuário) quando o limite da pessoa ou da clínica foi atingido.
 */
export async function registrarUsoIA(
  db: ClienteCoach,
  entrada: { clinicaId: string; funcao: string; atendente?: string | null },
): Promise<string | null> {
  const { data, error } = await db.rpc("coach_registrar_uso_ia", {
    _clinica_id: entrada.clinicaId,
    _funcao: entrada.funcao.slice(0, 60),
    _tokens_in: 0,
    _tokens_out: 0,
    _custo: 0,
    _atendente: entrada.atendente ?? null,
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/** Fecha o registro com o tamanho realmente consumido (não conta de novo). */
export async function fecharUsoIA(
  db: ClienteCoach,
  id: string | null,
  json: unknown,
): Promise<void> {
  if (!id) return;
  const { tokensIn, tokensOut } = tokensDaResposta(json);
  if (!tokensIn && !tokensOut) return;
  try {
    await db.rpc("coach_fechar_uso_ia", {
      _id: id,
      _tokens_in: tokensIn,
      _tokens_out: tokensOut,
      _custo: custoEstimado(tokensIn, tokensOut),
    });
  } catch {
    /* acompanhamento de custo nunca derruba a análise */
  }
}

/** Custo aproximado em dólares (Gemini Flash), só para acompanhamento. */
export function custoEstimado(tokensIn: number, tokensOut: number): number {
  const entrada = (tokensIn / 1_000_000) * 0.1;
  const saida = (tokensOut / 1_000_000) * 0.4;
  return Number((entrada + saida).toFixed(6));
}

/** Tokens informados pelo gateway, quando vierem. */
export function tokensDaResposta(json: unknown): { tokensIn: number; tokensOut: number } {
  const u = (json as { usage?: { prompt_tokens?: number; completion_tokens?: number } })?.usage;
  return {
    tokensIn: Number(u?.prompt_tokens ?? 0) || 0,
    tokensOut: Number(u?.completion_tokens ?? 0) || 0,
  };
}

/**
 * Mensagem de erro que a atendente pode ver: nada de detalhe interno do
 * provedor nem instrução de painel da Lovable.
 */
export async function erroGenericoIA(res: Response, contexto: string): Promise<never> {
  const bruto = await res.text().catch(() => "");
  console.error(`[coach] ${contexto} — IA ${res.status}: ${bruto.slice(0, 500)}`);
  if (res.status === 429) {
    throw new Error("A IA está ocupada agora. Aguarde alguns segundos e tente de novo.");
  }
  if (res.status === 402 || res.status === 403) {
    throw new Error("O recurso de IA está indisponível no momento. Avise a gestão da clínica.");
  }
  throw new Error("Não foi possível concluir agora. Tente novamente em instantes.");
}
