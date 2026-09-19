import { supabase } from "@/integrations/supabase/client";

export type TelaProtegida = "prova" | "roleplay";

export type TipoEventoSeguranca =
  | "print_screen"
  | "copiar"
  | "recortar"
  | "menu_contexto"
  | "imprimir"
  | "saida_de_aba";

export const LABEL_EVENTO: Record<TipoEventoSeguranca, string> = {
  print_screen: "Tentativa de print da tela",
  copiar: "Tentativa de copiar conteúdo",
  recortar: "Tentativa de recortar conteúdo",
  menu_contexto: "Clique direito bloqueado",
  imprimir: "Tentativa de imprimir",
  saida_de_aba: "Saiu da aba durante a atividade",
};

const ultimoEnvio = new Map<string, number>();

/**
 * Agrupamento por sessão: o mesmo tipo de evento na mesma tela só gera um
 * registro a cada 10 minutos. Antes um print repetido virava dezenas de linhas
 * e o painel da gestora ficava impossível de ler.
 */
const JANELA_MS = 10 * 60 * 1000;

/** Registra uma tentativa suspeita, agrupada por sessão. */
export async function registrarEventoSeguranca(params: {
  atendente: string;
  clinicaId: string | null;
  tela: TelaProtegida;
  tipo: TipoEventoSeguranca;
  detalhe?: string;
}) {
  const chave = `${params.tela}:${params.tipo}`;
  const agora = Date.now();
  const anterior = ultimoEnvio.get(chave) ?? 0;
  if (agora - anterior < JANELA_MS) return;
  ultimoEnvio.set(chave, agora);

  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!params.clinicaId) return;
    await supabase.from("coach_eventos_seguranca").insert({
      user_id: auth.user?.id ?? null,
      atendente: params.atendente,
      clinica_id: params.clinicaId,
      tela: params.tela,
      tipo: params.tipo,
      detalhe: params.detalhe ?? null,
    });
  } catch {
    // registro é best-effort: nunca deve interromper o treinamento
  }
}
