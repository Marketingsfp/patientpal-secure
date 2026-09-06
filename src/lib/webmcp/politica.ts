/**
 * WebMCP — Fase 3: política de acesso das ferramentas.
 *
 * Este módulo é PURO (sem `document`, `window` ou rede) para poder ser testado
 * e avaliado no servidor. Ele concentra as decisões de "pode ou não pode":
 *
 * - Produção é SOMENTE LEITURA para a automação.
 * - Toda alteração sobre conversa exige uma conversa de HOMOLOGAÇÃO,
 *   confirmada pela lista real de leads de teste vinda do backend — nunca por
 *   um campo enviado pelo próprio agente.
 * - O agente informa sempre o identificador da conversa; a seleção da tela não
 *   é usada como alvo implícito de nenhuma alteração.
 * - Notas internas do catálogo nunca saem daqui.
 */
import type { AmbienteWebmcp } from "./contexto";

/** Erro previsto de ferramenta: vira resposta explícita, não exceção solta. */
export class ErroWebmcp extends Error {
  readonly codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "ErroWebmcp";
    this.codigo = codigo;
  }
}

/** Classificação do efeito, para o agente distinguir início de conclusão. */
export type EfeitoWebmcp = "leitura" | "operacao_iniciada" | "operacao_concluida";

export function exigirAmbienteDeTeste(ambiente: AmbienteWebmcp): void {
  if (ambiente === "producao") {
    throw new ErroWebmcp(
      "ambiente_somente_leitura",
      "Em produção a automação é somente leitura. Nenhuma alteração é executada por aqui.",
    );
  }
  if (ambiente !== "local" && ambiente !== "preview") {
    throw new ErroWebmcp(
      "ambiente_desconhecido",
      "Ambiente não reconhecido como homologação. Alterações bloqueadas por segurança.",
    );
  }
}

export function exigirSessao(clinicaId: string | null, autenticado: boolean): string {
  if (!autenticado) throw new ErroWebmcp("sessao_expirada", "Sessão não autenticada.");
  if (!clinicaId) throw new ErroWebmcp("sem_clinica", "Nenhuma clínica autorizada selecionada.");
  return clinicaId;
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function exigirUuid(valor: unknown, campo: string): string {
  if (typeof valor !== "string" || !RE_UUID.test(valor.trim())) {
    throw new ErroWebmcp("entrada_invalida", `Campo "${campo}" deve ser um identificador válido.`);
  }
  return valor.trim();
}

export interface LeadTesteResumo {
  id: string;
  conversaId: string | null;
}

/**
 * Confirma que a conversa alvo pertence à homologação. A lista de leads vem do
 * backend a cada chamada: nada aqui aceita "é teste" informado pelo agente.
 */
export function exigirConversaDeTeste(conversaId: string, leads: LeadTesteResumo[]): string {
  const alvo = leads.find((l) => l.conversaId === conversaId);
  if (!alvo) {
    throw new ErroWebmcp(
      "conversa_nao_autorizada",
      "Esta conversa não é de homologação. Alterações só são permitidas em conversas de teste.",
    );
  }
  return conversaId;
}

const CAMPOS_PRIVADOS = ["nota_interna", "criado_por", "publicado_por"] as const;

/** Remove nota interna e campos administrativos dos registros do catálogo. */
export function sanitizarRegistroCatalogo<T extends Record<string, unknown>>(
  registro: T,
): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...registro };
  for (const campo of CAMPOS_PRIVADOS) delete copia[campo];
  return copia;
}

export function sanitizarListaCatalogo(lista: unknown): Record<string, unknown>[] {
  if (!Array.isArray(lista)) return [];
  return lista.map((r) => sanitizarRegistroCatalogo((r ?? {}) as Record<string, unknown>));
}

/**
 * Texto vindo de paciente, mensagem ou catálogo é DADO, nunca instrução.
 * O conteúdo é devolvido dentro de um campo rotulado e truncado.
 */
export function comoDado(texto: unknown, limite = 4000): string {
  const s = typeof texto === "string" ? texto : texto == null ? "" : String(texto);
  return s.length > limite ? `${s.slice(0, limite)}…` : s;
}

/** Filtra em memória a lista do catálogo por tipo, termo e status. */
export function filtrarCatalogo(
  lista: Record<string, unknown>[],
  filtro: { termo?: string; status?: string; limite: number },
): Record<string, unknown>[] {
  const termo = (filtro.termo ?? "").trim().toLowerCase();
  const normal = (v: unknown) =>
    String(v ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const alvo = normal(termo);
  return lista
    .filter((r) => (filtro.status ? r["status"] === filtro.status : true))
    .filter((r) => (alvo ? normal(r["nome"]).includes(alvo) : true))
    .slice(0, filtro.limite);
}
