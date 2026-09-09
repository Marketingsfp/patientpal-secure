// Compartilhado entre a tela de Perfis e o filtro de menu da AppShell.
// Define os módulos do sistema e os acessos padrão por perfil.

export type PerfilKey =
  | "admin"
  | "gestor"
  | "medico"
  | "recepcao"
  | "caixa"
  | "financeiro"
  | "enfermeiro"
  // Perfil próprio (mesmo nível de recepção/caixa): atendimento humano das
  // conversas encaminhadas pela Nina.
  | "telefonia";

export type Acesso = "none" | "read" | "write";

/**
 * Fonte única dos perfis selecionáveis no cadastro/edição de usuário.
 * O `value` é a chave canônica gravada em `clinica_memberships.role`
 * (minúscula, sem acento); o `label` é só apresentação.
 */
export const PERFIS_SISTEMA: ReadonlyArray<{ value: PerfilKey; label: string }> = [
  { value: "admin", label: "Administrador" },
  { value: "gestor", label: "Gestor" },
  { value: "medico", label: "Médico" },
  { value: "enfermeiro", label: "Enfermeiro" },
  { value: "recepcao", label: "Recepção" },
  { value: "caixa", label: "Caixa" },
  { value: "financeiro", label: "Financeiro" },
  { value: "telefonia", label: "Telefonia" },
];

/** Normaliza variações de capitalização/acento para a chave canônica. */
export function perfilCanonico(role: string | null | undefined): PerfilKey | null {
  const k = (role ?? "").trim().toLowerCase();
  return PERFIS_SISTEMA.some((p) => p.value === k) ? (k as PerfilKey) : null;
}

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
  "revisao-convenio",
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
    // Corrige em lote a classificação de atendimentos antigos e vincula
    // convênio a contrato. Fica com Gestor e Financeiro (além de admin), que
    // são quem responde pelos relatórios e pelo cadastro do cartão.
    "revisao-convenio": "write",
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
    "revisao-convenio": "write",
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
  // Espelha o que a migration grava em perfil_permissoes para o perfil
  // TELEFONIA — é o padrão de quem recebe os handoffs da Nina. A elegibilidade
  // vem do PERFIL (clinica_memberships.role = 'telefonia'), não de um módulo.
  telefonia: {
    nina: "write",
    chat: "write",
    "atendimento-multiplo": "read",
    agenda: "read",
    clientes: "read",
    "consulta-rapida": "read",
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
