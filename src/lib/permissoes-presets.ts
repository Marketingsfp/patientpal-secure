// Compartilhado entre a tela de Perfis e o filtro de menu da AppShell.
// Define os módulos do sistema e os acessos padrão por perfil.

export type PerfilKey =
  | "admin"
  | "gestor"
  | "medico"
  | "recepcao"
  | "caixa"
  | "financeiro"
  | "enfermeiro";

export type Acesso = "none" | "read" | "write";

export const TODOS_MODULOS: ReadonlyArray<string> = [
  // Operação
  "agenda",
  "checkin",
  "caixa",
  "chat",
  "clientes",
  "dashboard",
  "fluxo",
  "orcamentos",
  "recepcao",
  "triagem-enfermagem",
  "cartao-beneficios",
  "painel",
  "documentos",
  "atendimento-multiplo",
  // Inteligência
  "atendimento-ia",
  "crm",
  "alertas-enfermagem",
  "consulta-rapida",
  "nina",
  "odontologia",
  "fisioterapia",
  "prontuarios",
  "anamneses",
  "exames-resultados",
  "hiperdia",
  "consulta-ia",
  // Marketing
  "mkt-leads",
  "campanhas",
  "mkt-envios",
  "mkt-landing",
  "mkt-segmentos",
  // Cadastros
  "equipe",
  "clientes-duplicados",
  "especialidades",
  "disponibilidades",
  "prontuario-modelos",
  "perfis",
  "unidades",
  "medicos",
  "procedimentos",
  "planos",
  "estoque",
  "modelos-documentos",
  "clinicas",
  "painel-totem",
  "backups",
  "tipos-servico",
  // RH
  "hr-ponto",
  "hr-contratos",
  "hr-ferias",
  "hr-holerites",
  "treinamentos",
  "lms-admin",
  // Gestão
  "cargos",
  "financeiro",
  "funcionarios",
  "relatorios",
  "auditoria",
  "setores",
  "boletos",
  "contratos",
  "nfse",
  "integration-secrets",
  "lgpd",
  "painel-executivo",
];

export const PRESETS: Record<PerfilKey, Partial<Record<string, Acesso>>> = {
  admin: Object.fromEntries(TODOS_MODULOS.map((k) => [k, "write" as Acesso])),
  gestor: {
    dashboard: "write",
    agenda: "write",
    fluxo: "write",
    clientes: "write",
    chat: "write",
    checkin: "read",
    recepcao: "read",
    orcamentos: "read",
    caixa: "read",
    financeiro: "write",
    boletos: "read",
    contratos: "read",
    nfse: "read",
    relatorios: "write",
    auditoria: "read",
    lgpd: "read",
    equipe: "write",
    "hr-contratos": "read",
    "hr-ponto": "read",
    "hr-ferias": "read",
    "hr-holerites": "read",
    treinamentos: "read",
    cargos: "read",
    setores: "read",
    unidades: "read",
    medicos: "read",
    especialidades: "read",
    procedimentos: "read",
    disponibilidades: "write",
    // "write": desde a migration 20260820160000 a função merge_pacientes segue
    // esta matriz em vez de exigir admin. Gestor já pode excluir paciente pela
    // policy do banco, e mesclar é a operação mais conservadora das duas.
    "clientes-duplicados": "write",
    "prontuario-modelos": "read",
    "modelos-documentos": "read",
    planos: "read",
    estoque: "read",
    crm: "read",
    campanhas: "read",
    "mkt-leads": "read",
    "consulta-rapida": "read",
    "alertas-enfermagem": "read",
    "cartao-beneficios": "read",
    "painel-executivo": "write",
    "atendimento-multiplo": "read",
    "tipos-servico": "read",
  },
  medico: {
    agenda: "write",
    "atendimento-ia": "write",
    "exames-resultados": "read",
    "consulta-rapida": "read",
    "prontuario-modelos": "read",
    odontologia: "write",
    fisioterapia: "write",
    prontuarios: "write",
    anamneses: "write",
    hiperdia: "write",
    documentos: "write",
    "consulta-ia": "write",
    clientes: "read",
    chat: "write",
    "atendimento-multiplo": "write",
    caixa: "read",
  },
  recepcao: {
    agenda: "write",
    recepcao: "write",
    clientes: "write",
    // Recepção é quem encontra o cadastro repetido no balcão. Excluir paciente
    // continua barrado no banco para este perfil; mesclar é o caminho liberado,
    // porque preserva agenda, financeiro e prontuário e fica auditado.
    "clientes-duplicados": "write",
    fluxo: "write",
    orcamentos: "write",
    "consulta-rapida": "read",
    // Antes "painel" (bug: ROUTE_TO_MODULE mapeava /app/painel, que é o
    // Dashboard, para a chave errada). Corrigido para "dashboard" — preserva
    // o acesso ao Dashboard que este preset sempre pretendeu dar.
    checkin: "write",
    dashboard: "write",
    chat: "write",
    "cartao-beneficios": "read",
    caixa: "write",
    procedimentos: "read",
    nfse: "write",
    "atendimento-multiplo": "write",
    "tipos-servico": "read",
  },
  caixa: {
    caixa: "write",
    clientes: "read",
    // Mesmo com Clientes em "Leitura" no padrão, o Caixa precisa resolver o
    // cadastro repetido que ele mesmo detecta na hora de receber.
    "clientes-duplicados": "write",
    recepcao: "read",
    financeiro: "read",
    "consulta-rapida": "read",
    boletos: "write",
    nfse: "write",
    contratos: "read",
    "cartao-beneficios": "read",
    chat: "write",
  },
  financeiro: {
    financeiro: "write",
    caixa: "read",
    relatorios: "write",
    orcamentos: "read",
    clientes: "read",
    "cartao-beneficios": "write",
    boletos: "write",
    nfse: "write",
    contratos: "write",
    planos: "read",
    "hr-holerites": "read",
    "hr-contratos": "read",
    auditoria: "read",
    "integration-secrets": "read",
    chat: "write",
    dashboard: "read",
  },
  enfermeiro: {
    "triagem-enfermagem": "write",
    "alertas-enfermagem": "write",
    agenda: "read",
    clientes: "read",
    "consulta-rapida": "read",
    "atendimento-ia": "read",
    anamneses: "write",
    prontuarios: "read",
    hiperdia: "write",
    "consulta-ia": "write",
    estoque: "read",
    documentos: "read",
    chat: "write",
    orcamentos: "write",
    "atendimento-multiplo": "write",
    caixa: "read",
  },
};

/** Retorna o conjunto de módulos permitidos (acesso != "none") pelo preset. */
export function presetAllowedSet(role: string): Set<string> {
  const preset = PRESETS[role as PerfilKey] ?? {};
  return new Set(
    Object.entries(preset)
      .filter(([, v]) => v && v !== "none")
      .map(([k]) => k),
  );
}
