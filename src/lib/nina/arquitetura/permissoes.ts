/**
 * FASE 8 — Capacidades do módulo Arquitetura.
 *
 * Não é um segundo sistema de autorização: o acesso à tela continua sendo dado
 * pelo módulo "nina" em `permissoes-rotas.ts` e pelo papel gravado em
 * `user_roles`. Aqui apenas traduzimos o papel real da clínica no que cada
 * pessoa pode ver dentro do módulo.
 */

export const CAPACIDADES_ARQUITETURA = [
  /** Ver o mapa geral dos componentes. */
  "arquitetura.visualizar",
  /** Rastrear a execução de mensagens reais. */
  "arquitetura.execucao",
  /** Ver arquivo, função e trecho de código. */
  "arquitetura.codigo",
  /** Ver instruções/prompt usados pela Nina. */
  "arquitetura.instrucoes",
  /** Ver detalhes adicionais (contexto enviado, conteúdo recuperado, argumentos). */
  "arquitetura.detalhes",
  // FASE 7 — Instruções da Nina. Edição e publicação são SEPARADAS de
  // propósito: dá para deixar alguém escrever rascunho sem poder publicar.
  /** Ver o conteúdo das Instruções da Nina. */
  "nina.instrucoes.ver",
  /** Escrever/salvar rascunho (não altera o atendimento). */
  "nina.instrucoes.editar",
  /** Publicar uma versão — passa a valer para as próximas execuções. */
  "nina.instrucoes.publicar",
  /** Ver o histórico de versões, comparar e abrir versões antigas. */
  "nina.instrucoes.historico",
] as const;

export type CapacidadeArquitetura = (typeof CAPACIDADES_ARQUITETURA)[number];

export const ROTULOS_CAPACIDADE: Record<CapacidadeArquitetura, string> = {
  "arquitetura.visualizar": "Visualizar arquitetura geral",
  "arquitetura.execucao": "Visualizar execução de mensagens",
  "arquitetura.codigo": "Visualizar referências e trechos de código",
  "arquitetura.instrucoes": "Visualizar instruções da Nina",
  "arquitetura.detalhes": "Visualizar detalhes adicionais autorizados",
  "nina.instrucoes.ver": "Ver as Instruções da Nina",
  "nina.instrucoes.editar": "Editar e salvar rascunho das Instruções da Nina",
  "nina.instrucoes.publicar": "Publicar uma nova versão das Instruções da Nina",
  "nina.instrucoes.historico": "Ver histórico e comparar versões das Instruções",
};

/**
 * Papel na clínica → capacidades. Atendimento comum (recepção, caixa, clínico,
 * financeiro) NÃO recebe nada aqui automaticamente.
 */
const POR_PAPEL: Record<string, CapacidadeArquitetura[]> = {
  admin: [...CAPACIDADES_ARQUITETURA],
  // Gestor escreve rascunho, mas NÃO publica: publicar muda o comportamento
  // real da Nina no atendimento.
  gestor: [
    "arquitetura.visualizar",
    "arquitetura.execucao",
    "nina.instrucoes.ver",
    "nina.instrucoes.editar",
    "nina.instrucoes.historico",
  ],
  supervisor: [
    "arquitetura.visualizar",
    "arquitetura.execucao",
    "nina.instrucoes.ver",
    "nina.instrucoes.historico",
  ],
};

export function capacidadesDoPapel(papel: string | null | undefined): CapacidadeArquitetura[] {
  if (!papel) return [];
  return POR_PAPEL[papel] ?? [];
}

export function podeArquitetura(
  capacidades: readonly CapacidadeArquitetura[] | null | undefined,
  capacidade: CapacidadeArquitetura,
): boolean {
  return !!capacidades?.includes(capacidade);
}

/** Nível usado pelos detalhes de IA: só quem pode ver instruções é "admin". */
export function nivelAcessoDe(
  capacidades: readonly CapacidadeArquitetura[] | null | undefined,
): "admin" | "operacional" {
  return podeArquitetura(capacidades, "arquitetura.instrucoes") &&
    podeArquitetura(capacidades, "arquitetura.detalhes")
    ? "admin"
    : "operacional";
}
