// Fonte única de verdade que mapeia rotas do app (client-side) para
// chaves de módulo da tela de Perfis de Acesso. Consumida tanto pelo
// filtro do menu lateral quanto pelo guard de rota no AppShell.

/**
 * Mapa exato rota → módulo. Rotas com parâmetros usam o prefixo raiz
 * (ex.: /app/clientes/$id/editar → clientes) tratado por moduloDaRota.
 *
 * Rotas listadas com valor null são consideradas "sistema/livre" e
 * NUNCA são bloqueadas pelo guard de módulo (perfil próprio, index do
 * app, tela de "sem permissão", shells de dev, etc.).
 */
export const ROUTE_TO_MODULE: Record<string, string | null> = {
  // Operação
  "/app": null,
  "/app/agenda": "agenda",
  "/app/agenda-v2": "agenda",
  "/app/atendimento-multiplo": "atendimento-multiplo",
  "/app/checkin": "checkin",
  "/app/caixa": "caixa",
  "/app/chat": "chat",
  "/app/clientes": "clientes",
  "/app/clientes/duplicados": "clientes",
  // O sidebar rotula esta rota "Dashboard" (LayoutDashboard) e ela é a
  // página de indicadores — nada a ver com o módulo "painel" (Painel de
  // Senhas, painel público de chamadas em src/routes/painel.tsx, fora da
  // árvore autenticada). Usa a chave "dashboard" da tela de Perfis de
  // Acesso, que antes não estava amarrada a rota nenhuma.
  "/app/painel": "dashboard",
  "/app/painel-executivo": "painel-executivo",
  "/app/fluxo": "fluxo",
  "/app/orcamentos": "orcamentos",
  "/app/orcamentos-agenda": "orcamentos",
  "/app/recepcao": "recepcao",
  "/app/triagem-enfermagem": "triagem-enfermagem",
  "/app/cartao-beneficios": "cartao-beneficios",
  "/app/cartao-beneficios/contratos": "cartao-beneficios",
  "/app/cartao-beneficios/beneficios": "cartao-beneficios",
  "/app/cartao-beneficios/convenios": "cartao-beneficios",
  "/app/cartao-beneficios/dependentes": "cartao-beneficios",
  "/app/cartao-beneficios/modelos": "cartao-beneficios",
  "/app/cartao-beneficios/relatorios": "cartao-beneficios",
  "/app/imprimir": "agenda",
  "/app/documentos": "documentos",

  // Inteligência
  "/app/atendimento-ia": "atendimento-ia",
  "/app/crm": "crm",
  "/app/alertas-enfermagem": "alertas-enfermagem",
  "/app/consulta-rapida": "consulta-rapida",
  "/app/nina": "nina",
  "/app/odontologia": "odontologia",
  "/app/prontuarios": "prontuarios",
  "/app/anamneses": "anamneses",
  "/app/exames-resultados": "exames-resultados",

  // Marketing
  "/app/mkt-leads": "mkt-leads",
  "/app/campanhas": "campanhas",
  "/app/mkt-envios": "mkt-envios",
  "/app/mkt-landing": "mkt-landing",
  "/app/mkt-segmentos": "mkt-segmentos",

  // Cadastros
  "/app/equipe": "equipe",
  "/app/funcionario": "equipe",
  "/app/medico": "medicos",
  "/app/especialidades": "especialidades",
  "/app/procedimentos": "procedimentos",
  "/app/tipos-servico": "tipos-servico",
  "/app/disponibilidades": "disponibilidades",
  "/app/prontuario-modelos": "prontuario-modelos",
  "/app/modelos-documentos": "modelos-documentos",
  "/app/perfis": "perfis",
  "/app/unidades": "unidades",
  "/app/medicos": "medicos",
  "/app/planos": "planos",
  "/app/estoque": "estoque",
  "/app/clinicas": "clinicas",

  // RH
  "/app/hr-ponto": "hr-ponto",
  "/app/hr-contratos": "hr-contratos",
  "/app/hr-ferias": "hr-ferias",
  "/app/hr-holerites": "hr-holerites",
  "/app/treinamentos": "treinamentos",
  "/app/lms-admin": "lms-admin",

  // Gestão
  "/app/cargos": "cargos",
  "/app/financeiro": "financeiro",
  "/app/financeiro/alertas": "financeiro",
  "/app/financeiro/analitico": "financeiro",
  "/app/financeiro/atendimentos": "financeiro",
  "/app/atendimentos": "financeiro",
  "/app/financeiro/bi": "financeiro",
  "/app/financeiro/categorias": "financeiro",
  "/app/financeiro/contas": "financeiro",
  "/app/financeiro/empresas": "financeiro",
  "/app/financeiro/estatisticas": "financeiro",
  "/app/financeiro/estorno": "financeiro",
  "/app/financeiro/lembretes": "financeiro",
  "/app/financeiro/movimento": "financeiro",
  "/app/financeiro/notas": "financeiro",
  "/app/financeiro/regras-ia": "financeiro",
  "/app/financeiro/relatorios": "financeiro",
  "/app/funcionarios": "funcionarios",
  "/app/configuracoes/nfse": "nfse",
  "/app/configuracoes/painel-totem": "clinicas",
  "/app/nfse": "nfse",
  "/app/relatorios": "relatorios",
  "/app/auditoria": "auditoria",
  "/app/setores": "setores",
  "/app/boletos": "boletos",
  "/app/contratos": "contratos",
  "/app/integration-secrets": "integration-secrets",
  "/app/lgpd": "lgpd",
  "/app/backups": "auditoria",

  // Sistema / livre
  "/app/dev-caixa-shell": null,
  "/app/dev-clientes-shell": null,
  "/app/dev-hhp": null,
  "/app/dev-list-shell": null,
  "/app/dev-orcamentos-shell": null,
  "/app/sem-permissao": null,
};

/**
 * Lista de prefixos ordenada do mais específico para o mais genérico.
 * Usada para casar rotas com parâmetros dinâmicos (ex.: /app/clientes/abc/editar).
 */
const PREFIX_ENTRIES: ReadonlyArray<readonly [string, string | null]> = Object
  .entries(ROUTE_TO_MODULE)
  .sort((a, b) => b[0].length - a[0].length);

/**
 * Retorna a chave de módulo (`agenda`, `financeiro`, ...) da rota atual,
 * `null` para rotas de sistema/livres e `undefined` quando a rota não é
 * reconhecida (comportamento seguro: o guard trata como bloqueada).
 */
export function moduloDaRota(pathname: string): string | null | undefined {
  // remove trailing slash (exceto raiz)
  const p = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
  // match exato primeiro
  if (p in ROUTE_TO_MODULE) return ROUTE_TO_MODULE[p];
  // prefix mais longo primeiro (para segmentos dinâmicos)
  for (const [rota, modulo] of PREFIX_ENTRIES) {
    if (p === rota || p.startsWith(rota + "/")) return modulo;
  }
  return undefined;
}

/**
 * True quando a rota é considerada "livre" (sempre acessível) ou está fora
 * do controle de permissões. False quando a rota tem módulo mapeado.
 */
export function rotaLivre(pathname: string): boolean {
  const m = moduloDaRota(pathname);
  return m === null;
}