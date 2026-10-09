/** Cada opção do menu do OS ZAP tem sua própria linha na matriz de acesso. */
export type TelaOsZap = {
  key: string;
  nome: string;
  descricao: string;
  grupo: "Atendimento" | "Nina" | "Configurações do WhatsApp" | "Francisco";
  to: string;
  hash?: string;
  pai: "nina" | "francisco";
};

export const TELAS_OSZAP: TelaOsZap[] = [
  {
    key: "oszap-dashboard",
    nome: "Dashboard",
    descricao: "Indicadores consolidados da equipe; consulta restrita à gestão",
    grupo: "Atendimento",
    to: "/app/nina",
    hash: "dashboard-oszap",
    pai: "nina",
  },
  {
    key: "oszap-conversas",
    nome: "Conversas WhatsApp",
    descricao: "Fila e atendimento das conversas do WhatsApp",
    grupo: "Atendimento",
    to: "/app/nina",
    hash: "atend-inbox",
    pai: "nina",
  },
  {
    key: "oszap-mensagens-prontas",
    nome: "Mensagens prontas",
    descricao: "Respostas rápidas pessoais e da equipe",
    grupo: "Atendimento",
    to: "/app/nina",
    hash: "atend-macros",
    pai: "nina",
  },
  {
    key: "oszap-central-conversas",
    nome: "Central de conversas",
    descricao: "Pesquisa e consulta de conversas",
    grupo: "Atendimento",
    to: "/app/nina",
    hash: "pesquisa-conversas",
    pai: "nina",
  },
  {
    key: "painel-tv-atendimento",
    nome: "Painel da TV",
    descricao: "Indicadores do atendimento; consulta restrita à gestão",
    grupo: "Atendimento",
    to: "/app/painel-tv-atendimento",
    pai: "nina",
  },
  {
    key: "nina-voz",
    nome: "Voz da Nina",
    descricao: "Consulta e configuração da voz da Nina",
    grupo: "Nina",
    to: "/app/nina",
    hash: "voz-nina",
    pai: "nina",
  },
  {
    key: "nina-base-conhecimento",
    nome: "Base de conhecimento",
    descricao: "Catálogo editorial, fontes e regras do atendimento",
    grupo: "Nina",
    to: "/app/nina",
    hash: "base-conhecimento",
    pai: "nina",
  },
  {
    key: "nina-informacoes-clinica",
    nome: "Informações da clínica",
    descricao: "Horários e informações da clínica",
    grupo: "Nina",
    to: "/app/nina",
    hash: "informacoes-clinica",
    pai: "nina",
  },
  {
    key: "nina-homologacao",
    nome: "Homologação (chat)",
    descricao: "Conversas e simulações de teste da Nina",
    grupo: "Nina",
    to: "/app/nina",
    hash: "homologacao",
    pai: "nina",
  },
  {
    key: "nina-laboratorio",
    nome: "Laboratório Nina",
    descricao: "Cenários e relatórios de homologação",
    grupo: "Nina",
    to: "/app/nina",
    hash: "laboratorio-nina",
    pai: "nina",
  },
  {
    key: "nina-aprendizado",
    nome: "Revisão de Aprendizados",
    descricao: "Revisão dos aprendizados reportados",
    grupo: "Nina",
    to: "/app/nina-aprendizado",
    pai: "nina",
  },
  {
    key: "nina-metricas",
    nome: "Métricas de Aprendizado",
    descricao: "Indicadores de acerto e evolução da Nina",
    grupo: "Nina",
    to: "/app/nina-metricas",
    pai: "nina",
  },
  {
    key: "nina-jev",
    nome: "Decisões do Jev",
    descricao: "Decisões e calibragem do Jev; limites alterados somente por administradores",
    grupo: "Nina",
    to: "/app/nina-jev",
    pai: "nina",
  },
  {
    key: "nina-arquitetura",
    nome: "Arquitetura",
    descricao: "Mapa interno das funções e instruções da Nina",
    grupo: "Nina",
    to: "/app/nina-arquitetura",
    pai: "nina",
  },
  {
    key: "whatsapp-config",
    nome: "Configuração",
    descricao: "Conexão e configuração do WhatsApp",
    grupo: "Configurações do WhatsApp",
    to: "/app/nina",
    hash: "config",
    pai: "nina",
  },
  {
    key: "whatsapp-templates",
    nome: "Templates aprovados (Meta)",
    descricao: "Templates aprovados e integração com a Meta",
    grupo: "Configurações do WhatsApp",
    to: "/app/nina",
    hash: "templates",
    pai: "nina",
  },
  {
    key: "francisco-visao-geral",
    nome: "Visão geral",
    descricao: "Visão geral do acompanhamento de orçamentos",
    grupo: "Francisco",
    to: "/app/francisco",
    hash: "visao-geral",
    pai: "francisco",
  },
  {
    key: "francisco-arquitetura",
    nome: "Arquitetura",
    descricao: "Fluxo e configuração do agente de orçamentos",
    grupo: "Francisco",
    to: "/app/francisco",
    hash: "arquitetura",
    pai: "francisco",
  },
  {
    key: "francisco-voz",
    nome: "Voz do Francisco",
    descricao: "Configuração e prévia da voz do Francisco",
    grupo: "Francisco",
    to: "/app/francisco",
    hash: "voz",
    pai: "francisco",
  },
  {
    key: "francisco-mensagens",
    nome: "Mensagens",
    descricao: "Cadência e templates do acompanhamento",
    grupo: "Francisco",
    to: "/app/francisco",
    hash: "mensagens",
    pai: "francisco",
  },
  {
    key: "francisco-acompanhamento",
    nome: "Acompanhamento",
    descricao: "Orçamentos elegíveis, envios e autorização de contato",
    grupo: "Francisco",
    to: "/app/francisco",
    hash: "acompanhamento",
    pai: "francisco",
  },
  {
    key: "francisco-homologacao",
    nome: "Homologação",
    descricao: "Conversas e simulações de teste do Francisco",
    grupo: "Francisco",
    to: "/app/francisco",
    hash: "homologacao",
    pai: "francisco",
  },
  {
    key: "francisco-historico",
    nome: "Histórico",
    descricao: "Versões, testes, envios e respostas do Francisco",
    grupo: "Francisco",
    to: "/app/francisco",
    hash: "historico",
    pai: "francisco",
  },
];

export const PAIS_OSZAP = Object.fromEntries(TELAS_OSZAP.map((t) => [t.key, t.pai]));

/** A matriz exibe o pai efetivamente salvo, sem sobrescrever decisões próprias. */
export function herdarAcessosOsZap(
  valores: Record<string, "none" | "read" | "write">,
  configurados: ReadonlySet<string>,
  preset: Partial<Record<string, "none" | "read" | "write">>,
) {
  for (const [filho, pai] of Object.entries(PAIS_OSZAP)) {
    if (!configurados.has(filho) && !preset[filho]) valores[filho] = valores[pai] ?? "none";
  }
}

/** O padrão dos filhos inclui a exceção do pai, sem transformá-la em exceções novas. */
export function padraoOsZapDaPessoa(
  cargo: Record<string, "none" | "read" | "write">,
  configurados: ReadonlySet<string>,
  preset: Partial<Record<string, "none" | "read" | "write">>,
  excecoes: Record<string, "none" | "read" | "write">,
) {
  const padrao = { ...cargo };
  for (const pai of ["nina", "francisco"]) {
    if (excecoes[pai]) padrao[pai] = excecoes[pai];
  }
  herdarAcessosOsZap(padrao, configurados, preset);
  for (const pai of ["nina", "francisco"]) padrao[pai] = cargo[pai] ?? "none";
  return padrao;
}

/** Mesma seleção das páginas, inclusive os links antigos sem hash ou com #chat. */
export function moduloTelaOsZap(pathname: string, hash = ""): string | undefined {
  const rota = pathname.replace(/\/+$/, "");
  // Links antigos de conversa são normalizados para a Inbox.
  if (rota.startsWith("/app/nina/")) return "oszap-conversas";
  let aba = hash.replace(/^#/, "");
  if (rota === "/app/nina") {
    if (aba === "chat" || !TELAS_OSZAP.some((t) => t.to === rota && t.hash === aba))
      aba = "atend-inbox";
  } else if (rota === "/app/francisco") {
    if (!TELAS_OSZAP.some((t) => t.to === rota && t.hash === aba)) aba = "visao-geral";
  }
  return TELAS_OSZAP.find((t) => t.to === rota && (t.hash ?? "") === aba)?.key;
}

export const GRUPOS_PERMISSOES_OSZAP = [
  {
    label: "OS ZAP › Acessos gerais",
    modulos: [
      {
        key: "nina",
        nome: "Acesso padrão — Nina e atendimento",
        descricao:
          "Padrão herdado pelas opções da Nina, atendimento e WhatsApp que ainda não foram configuradas",
        menu: "OS ZAP",
      },
      {
        key: "francisco",
        nome: "Acesso padrão — Francisco",
        descricao:
          "Padrão herdado pelas opções do Francisco que ainda não foram configuradas; publicação somente por administrador",
        menu: "OS ZAP › Francisco",
      },
    ],
  },
  ...["Atendimento", "Nina", "Configurações do WhatsApp", "Francisco"].map((grupo) => ({
    label: `OS ZAP › ${grupo}`,
    modulos: TELAS_OSZAP.filter((t) => t.grupo === grupo).map((t) => ({
      key: t.key,
      nome: t.nome,
      descricao: t.descricao,
      menu: `OS ZAP › ${t.grupo} › ${t.nome}`,
      sub: true,
    })),
  })),
];
