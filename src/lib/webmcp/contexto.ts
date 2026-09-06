/**
 * WebMCP — Fase 2 (prova de funcionamento).
 *
 * Este módulo é PURO: não toca em `document`, `window` nem em rede, para que
 * possa ser avaliado no servidor (SSR) e coberto por teste. Ele apenas monta o
 * pequeno objeto de contexto que a única ferramenta de leitura devolve ao
 * agente do navegador.
 *
 * Regra de privacidade desta fase: nada de dado clínico, nada de credencial,
 * nada de outro paciente. Só ambiente, clínica autorizada, perfil autenticado,
 * conversa de teste selecionada (quando houver) e capacidades disponíveis.
 */

export type AmbienteWebmcp = "local" | "preview" | "producao" | "desconhecido";

/** Conversa de homologação atualmente aberta no console de testes da Nina. */
export interface SelecaoTesteWebmcp {
  leadId: string;
  leadNome: string;
  conversaId: string | null;
}

export interface EntradaContextoWebmcp {
  host: string;
  dentroDeIframe: boolean;
  autenticado: boolean;
  usuarioEmail: string | null;
  clinicaId: string | null;
  clinicaNome: string | null;
  papel: string | null;
  selecaoTeste: SelecaoTesteWebmcp | null;
}

export interface ContextoWebmcp {
  ambiente: AmbienteWebmcp;
  dentro_do_editor: boolean;
  autenticado: boolean;
  perfil: { email: string | null; papel: string | null } | null;
  clinica_autorizada: { id: string; nome: string | null } | null;
  conversa_teste_selecionada: {
    lead_id: string;
    lead_nome: string;
    conversa_id: string | null;
  } | null;
  escrita_permitida: boolean;
  capacidades: string[];
  observacao: string;
}

/**
 * Classifica o ambiente pelo host. Preview e produção são endereços distintos;
 * qualquer outro host é tratado como desconhecido — nunca como produção.
 */
export function classificarAmbiente(host: string): AmbienteWebmcp {
  const h = (host || "").toLowerCase();
  if (!h) return "desconhecido";
  if (h === "localhost" || h.startsWith("localhost:") || h.startsWith("127.0.0.1")) return "local";
  if (h.includes("id-preview--") || h.endsWith("-dev.lovable.app") || h.includes(".lovableproject.com")) {
    return "preview";
  }
  if (h.endsWith(".lovable.app")) return "producao";
  return "desconhecido";
}

/**
 * Em produção a automação é SOMENTE LEITURA (decisão registrada na Fase 1).
 * A escrita só é liberada fora de produção e apenas quando há uma conversa de
 * homologação selecionada — jamais sobre uma conversa real.
 */
export function escritaPermitida(ambiente: AmbienteWebmcp, selecao: SelecaoTesteWebmcp | null): boolean {
  if (ambiente === "producao" || ambiente === "desconhecido") return false;
  return Boolean(selecao?.conversaId);
}

export function montarContextoWebmcp(entrada: EntradaContextoWebmcp): ContextoWebmcp {
  const ambiente = classificarAmbiente(entrada.host);
  const podeEscrever = escritaPermitida(ambiente, entrada.selecaoTeste);
  const capacidades = ["contexto:leitura"];

  return {
    ambiente,
    dentro_do_editor: entrada.dentroDeIframe,
    autenticado: entrada.autenticado,
    perfil: entrada.autenticado
      ? { email: entrada.usuarioEmail, papel: entrada.papel }
      : null,
    clinica_autorizada:
      entrada.autenticado && entrada.clinicaId
        ? { id: entrada.clinicaId, nome: entrada.clinicaNome }
        : null,
    conversa_teste_selecionada: entrada.selecaoTeste
      ? {
          lead_id: entrada.selecaoTeste.leadId,
          lead_nome: entrada.selecaoTeste.leadNome,
          conversa_id: entrada.selecaoTeste.conversaId,
        }
      : null,
    escrita_permitida: podeEscrever,
    capacidades,
    observacao:
      "Fase 2: apenas leitura de contexto. Nenhuma outra ferramenta foi publicada e nenhum dado clínico é exposto aqui.",
  };
}
