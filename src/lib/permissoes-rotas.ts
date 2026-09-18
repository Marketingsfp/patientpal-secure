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
  // Chave própria (antes "agenda"): a Escala e Horários é um item de menu
  // separado, e a clínica precisa poder deixar a Agenda liberada e esconder a
  // escala. Enquanto ninguém configurar a chave nova, ela herda "agenda"
  // (SUBMODULE_PARENT), então nada muda para quem já usa o sistema.
  "/app/agenda-medicos": "agenda-escala",
  "/app/atendimento-multiplo": "atendimento-multiplo",
  "/app/checkin": "checkin",
  "/app/caixa": "caixa",
  "/app/chat": "chat",
  "/app/clientes": "clientes",
  // Módulo próprio (e não "clientes"): mesclar cadastros é uma ação
  // destrutiva e de gestão, então precisa poder ser escondida de perfis
  // que têm acesso normal à lista de clientes (ex.: Caixa).
  "/app/clientes/duplicados": "clientes-duplicados",
  // Conferência da numeração acompanha o módulo de clientes: quem confere é a
  // mesma recepção que cadastra. Sem chave própria, senão a tela nasceria
  // invisível até o gestor configurar permissão.
  "/app/clientes/recentes": "clientes",
  // Módulo próprio: a tela altera em lote a classificação de atendimentos já
  // gravados e vincula convênio a contrato — mexe em relatório e em preço do
  // cartão, então não acompanha o acesso normal a Clientes ou Agenda.
  "/app/revisao-convenio": "revisao-convenio",
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
  "/app/cartao-beneficios/convenios": "cartao-beneficios",
  "/app/cartao-beneficios/dependentes": "cartao-beneficios",
  "/app/cartao-beneficios/conferencia": "cartao-beneficios",
  "/app/cartao-beneficios/sem-convenio": "cartao-beneficios",
  "/app/cartao-beneficios/modelos": "cartao-beneficios",
  "/app/cartao-beneficios/relatorios": "cartao-beneficios",
  "/app/imprimir": "agenda",
  "/app/documentos": "documentos",

  // Inteligência
  "/app/atendimento-ia": "atendimento-ia",
  "/app/crm": "crm",
  "/app/alertas-enfermagem": "alertas-enfermagem",
  "/app/consulta-rapida": "consulta-rapida",
  // Consulta de preços do balcão. Item de menu próprio, então tem chave
  // própria — mas nasce herdando "Informações rápidas" (SUBMODULE_PARENT),
  // que é como ela sempre funcionou, e só se separa quando alguém mexer.
  "/app/tabela-valores": "consulta-rapida-valores",
  "/app/nina": "nina",
  // Telas de aprendizado/métricas da Nina. Sem estas entradas exatas o mapa
  // devolvia `undefined` (a rota "/app/nina" não casa por prefixo com
  // "/app/nina-..."), escondendo o menu e mostrando "Acesso negado" para
  // gestor/supervisor — justamente quem revisa e aprova os erros reportados.
  // Cada uma é um item de menu do portal OS ZAP e ganhou chave própria, para
  // a clínica poder deixar as conversas liberadas e guardar a revisão de
  // aprendizados, as métricas e a arquitetura com a gestão. Todas herdam
  // "nina" enquanto não forem configuradas.
  "/app/nina-aprendizado": "nina-aprendizado",
  "/app/nina-metricas": "nina-metricas",
  "/app/nina-arquitetura": "nina-arquitetura",
  "/app/configuracoes/respostas-rapidas": "nina",
  "/app/odontologia": "odontologia",
  "/app/odontologia/orcamentos": "odontologia-orcamentos",
  "/app/fisioterapia": "fisioterapia",
  "/app/fisioterapia/pacotes": "fisioterapia-pacotes",
  "/app/prontuarios": "prontuarios",
  "/app/anamneses": "anamneses",
  "/app/hiperdia": "hiperdia",
  "/app/consulta-ia": "consulta-ia",
  "/app/exames-resultados": "exames-resultados",

  // Marketing
  "/app/mkt-leads": "mkt-leads",
  "/app/campanhas": "campanhas",
  "/app/mkt-envios": "mkt-envios",
  "/app/mkt-landing": "mkt-landing",
  "/app/mkt-segmentos": "mkt-segmentos",

  // Cadastros
  "/app/equipe": "equipe",
  // Chave própria que herda "equipe" enquanto não for configurada: é um item
  // de menu à parte e marca, pessoa a pessoa, quem é da gestão — então a
  // clínica precisa poder liberar o cadastro da equipe sem liberar a alçada.
  // A tela ainda checa por conta própria se quem abriu é admin/gestor, e a
  // gravação passa por `editarMembro`, no servidor.
  "/app/equipe-acessos": "equipe-acessos",
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
  "/app/financeiro/atendimentos": "financeiro-atendimentos",
  "/app/financeiro/atendimentos-externos": "financeiro-atendimentos",
  "/app/financeiro/bi": "financeiro",
  "/app/financeiro/categorias": "financeiro",
  "/app/financeiro/contas": "financeiro",
  "/app/financeiro/empresas": "financeiro",
  "/app/financeiro/estatisticas": "financeiro",
  "/app/financeiro/estorno": "financeiro-estorno",
  "/app/financeiro/lembretes": "financeiro",
  "/app/financeiro/movimento": "financeiro-movcaixa",
  // Detalhamento dos cards aberto em nova aba: cada endereço herda o módulo da
  // tela de onde veio, para quem só tem o Movimento de Caixa abrir o dele.
  "/app/financeiro/detalhe": "financeiro",
  "/app/financeiro/movimento-detalhe": "financeiro-movcaixa",
  "/app/financeiro/notas": "financeiro",
  // "A Receber" acompanha o módulo de Atendimentos: quem cobra o atendimento
  // é quem precisa enxergar e quitar o saldo devedor dele.
  "/app/financeiro/pendencias": "financeiro-atendimentos",
  "/app/financeiro/regras-ia": "financeiro",
  "/app/financeiro/relatorios": "financeiro",
  // Item de menu próprio ("Configuração NFS-e"): chave própria herdando
  // "nfse", para separar quem emite a nota de quem configura a emissão.
  "/app/configuracoes/nfse": "nfse-config",
  // Antes usava a chave "clinicas": quem podia ver o cadastro de clínicas
  // enxergava também a configuração do painel/totem, sem como separar.
  "/app/configuracoes/painel-totem": "painel-totem",
  // Numeração de prontuário nasce herdando "clientes" — quem acerta o
  // ponteiro da estante é a mesma recepção que cadastra o paciente, e a tela
  // não pode ficar invisível até alguém configurar permissão. Como é um item
  // de menu à parte, ganhou chave própria para poder ser fechada depois.
  "/app/configuracoes/prontuario": "clientes-numeracao",
  "/app/nfse": "nfse",
  "/app/relatorios": "relatorios",
  "/app/auditoria": "auditoria",
  "/app/setores": "setores",
  "/app/boletos": "boletos",
  "/app/contratos": "contratos",
  "/app/integration-secrets": "integration-secrets",
  "/app/lgpd": "lgpd",
  // Chave própria (antes "auditoria"): baixar/restaurar backup é bem mais
  // sensível do que consultar os logs de auditoria.
  "/app/backups": "backups",

  // Sistema / livre
  // As telas "/app/dev-*" NÃO ficam aqui: elas renderizavam as listas reais
  // de clientes/caixa/orçamentos e ainda ligam/desligam feature flags, mas
  // eram "livres" — qualquer perfil logado abria pela URL. Passaram para
  // ADMIN_ONLY_ROUTES abaixo.
  "/app/sem-permissao": null,

  // Portal Coach WhatsApp (treinamento e avaliação de atendentes).
  // Um módulo só: "gestor" é quem tem acesso de escrita; quem tem apenas
  // leitura vê somente o próprio treinamento.
  "/app/coach": "coach",
};

/**
 * Rotas restritas a administradores da clínica, independentemente do que
 * estiver salvo em `perfil_permissoes`. Nenhum perfil não-admin entra aqui,
 * nem digitando a URL na barra de endereços.
 */
export const ADMIN_ONLY_ROUTES: ReadonlyArray<string> = [
  "/app/configuracoes/voz",
  "/app/planos",
  // Previews internos de telas em desenvolvimento: mostram dados reais e
  // alteram feature flags da clínica. Não têm item de menu e agora também
  // não abrem por URL para quem não é administrador.
  "/app/dev-caixa-shell",
  "/app/dev-clientes-shell",
  "/app/dev-hhp",
  "/app/dev-list-shell",
  "/app/dev-orcamentos-shell",
];

/** True quando a rota atual só pode ser aberta por administrador. */
export function rotaSomenteAdmin(pathname: string): boolean {
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return ADMIN_ONLY_ROUTES.some((r) => p === r || p.startsWith(r + "/"));
}

/**
 * Submódulos que herdam de um módulo pai quando não há configuração
 * explícita no perfil. Se o perfil não tem linha para o submódulo em
 * `perfil_permissoes`, o guard cai no acesso do pai. Assim clínicas que
 * não usam a granularidade (flag `permissoes_financeiro_granular`)
 * continuam funcionando com o acesso "financeiro" atual.
 */
export const SUBMODULE_PARENT: Record<string, string> = {
  "financeiro-estorno": "financeiro",
  "financeiro-atendimentos": "financeiro",
  "financeiro-movcaixa": "financeiro",
  // Itens de menu que antes dividiam a chave do irmão e por isso não tinham
  // como ser liberados ou escondidos sozinhos na tela de Perfis de Acesso.
  // Todos herdam o pai enquanto ninguém configurar a chave nova, então ligar
  // esta separação não tira acesso de ninguém.
  "agenda-escala": "agenda",
  "clientes-numeracao": "clientes",
  "consulta-rapida-valores": "consulta-rapida",
  "equipe-acessos": "equipe",
  "nfse-config": "nfse",
  "odontologia-orcamentos": "odontologia",
  "fisioterapia-pacotes": "fisioterapia",
  "nina-aprendizado": "nina",
  "nina-metricas": "nina",
  "nina-arquitetura": "nina",
};

/**
 * Módulos-pai cuja tela é só uma casca de abas (hoje só o Financeiro): quem
 * tem acesso a um submódulo precisa entrar na rota do pai, porque ela apenas
 * redireciona para a primeira aba visível.
 *
 * Os demais pais NÃO entram aqui de propósito: "Agenda" é uma tela de
 * verdade, então ter "Escala e Horários" liberada não pode destrancar a
 * Agenda — seria o contrário do que o gestor configurou.
 */
export const PARENTS_COM_ABAS: ReadonlySet<string> = new Set(["financeiro"]);

/**
 * Regra única de "este módulo está liberado para este usuário", usada tanto
 * pelo filtro do menu lateral quanto pela guarda de rota — se as duas
 * divergirem, o item some do menu mas a URL continua abrindo (ou o contrário).
 *
 * - `allowed === null` é admin: libera tudo.
 * - submódulo sem linha salva em `perfil_permissoes` herda o pai;
 * - submódulo COM linha salva vale pelo que está salvo, inclusive "none";
 * - a casca de abas (Financeiro) abre quando pelo menos uma aba está liberada.
 */
export function moduloPermitido(
  modulo: string | null | undefined,
  allowed: Set<string> | null,
  configured?: Set<string> | null,
  opcoes?: {
    /**
     * Liberar a casca de abas (Financeiro) para quem só tem uma aba. Vale
     * para o item do MENU e para a guarda da rota-pai, que redireciona.
     * As próprias abas do submenu usam `false`: lá a aba "Dashboard" só
     * aparece para quem tem o módulo "financeiro" de verdade.
     */
    abrirCascaDeAbas?: boolean;
  },
): boolean {
  if (allowed === null) return true; // admin
  if (modulo === null) return true; // rota livre/sistema
  if (typeof modulo !== "string") return false; // rota não mapeada → bloqueia
  if (allowed.has(modulo)) return true;
  const pai = SUBMODULE_PARENT[modulo];
  if (pai && !configured?.has(modulo) && allowed.has(pai)) return true;
  if ((opcoes?.abrirCascaDeAbas ?? true) && PARENTS_COM_ABAS.has(modulo)) {
    return Object.entries(SUBMODULE_PARENT).some(
      ([sub, parent]) => parent === modulo && allowed.has(sub),
    );
  }
  return false;
}

/**
 * Lista de prefixos ordenada do mais específico para o mais genérico.
 * Usada para casar rotas com parâmetros dinâmicos (ex.: /app/clientes/abc/editar).
 */
const PREFIX_ENTRIES: ReadonlyArray<readonly [string, string | null]> = Object.entries(
  ROUTE_TO_MODULE,
)
  // "/app" é raiz de TODAS as rotas do sistema. Se ele participasse do
  // casamento por prefixo, qualquer rota ainda não cadastrada no mapa
  // herdaria "livre" (null) e passaria pela guarda sem checagem de
  // permissão. Ele só vale por match exato.
  .filter(([rota]) => rota !== "/app")
  .sort((a, b) => b[0].length - a[0].length);

/**
 * Retorna a chave de módulo (`agenda`, `financeiro`, ...) da rota atual,
 * `null` para rotas de sistema/livres e `undefined` quando a rota não é
 * reconhecida (comportamento seguro: o guard trata como bloqueada).
 */
export function moduloDaRota(pathname: string): string | null | undefined {
  // remove trailing slash (exceto raiz)
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
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
