/** Núcleo real; apenas banco, modelo e catálogo externos são simulados. */
import { mock } from "bun:test";
if (!process.argv[3]?.startsWith("fonte_")) mock.module("../../fonte-consulta-config.server", () => ({
  lerSelecaoFonte: async () => ({ fonte: (process.argv[3]?.startsWith("catalogo_continuidade_") || (process.argv[3]?.startsWith("catalogo_confirmacao_plural") && !process.argv[3]?.endsWith("clinica_os"))) ? "base_conhecimento" : "clinica_os", revisao: null }),
}));
import { textoDaChave } from "../../resposta/templates";
import { CONTINUIDADE_CONSULTA_AGENDA } from "../../prompt/consulta-agenda";
import { estadoVazio } from "../../fluxo-estado-normalizar";
import { selecionarVagaValidada } from "../../agendamento-escolha";
import { cenariosContextuais } from "./consulta-contextual-cenarios";
import { recusarFraseComoPesquisa } from "../../catalogo-pesquisa";
import { apresentarPerguntaEsclarecimento } from "../../esclarecimento-apresentacao";
import { montarBlocoIdentidade } from "../../identidade-atendimento";

process.env.LOVABLE_API_KEY = "chave-ficticia-sem-rede";
const fotoCenario = process.argv[3]?.startsWith("foto_");
const { PEDIR_NOVA_FOTO } = await import("../../fotos");
const teste = process.argv[2] === "homologacao";
const cenario = process.argv[3] ?? "direta";
const vacinaCenario = cenario.startsWith("vacina_");
const escopoEscala = ({
  clinico: ["Clínico Geral", "Claudia Maria Rodrigues dos Santos", "Nicolas Cesar Alves Nunes"],
  urologia: ["Urologia", "Marcelo Barreto Franco da Silveira", "Adrian Andres Jara Benitez"],
  dermatologia: ["Dermatologia", "Shirley Martins", "Raisa Moura"],
  otorrino: ["Otorrinolaringologia", "Eneida de Oliveira Rodrigues", "Mauricio Albuquerque de Paula"],
  cardiologia: ["Cardiologia", "Roberta Corredeira", "Isis Duarte"],
  escolhido_sem: ["Clínico Geral", "Nicolas Cesar Alves Nunes", "Claudia Maria Rodrigues dos Santos"],
} as Record<string, string[]>)[cenario.replace("catalogo_escopo_escala_", "")];
const progressoLongo = cenario.startsWith("progresso_longo");
const conferencias: any[] = [];
const alteracaoCenario = cenario.startsWith("alteracao_");
if (alteracaoCenario) mock.module("@/lib/nina/jev.server", () => ({
  jevAtivo: async (_c: string, fase: string) => !cenario.includes("fallback") && fase === "fase2_encaminhamento",
  perguntarJev: async () => ({ ok: true, respostas: {
    alteracao_agendamento: { choice: cenario.includes("semantica") ? "remarcacao" : "nenhum", confidence: 0.97 },
    entendimento: { noul: 0.99 }, urgencia: { noul: cenario.endsWith("urgencia") ? 0.99 : 0.01 },
  } }),
  contagemAnteriorFase1: async () => null,
  limitesJev: async () => ({ urgencia: 0.5, pedido_atendente: 0.7, irritacao: 0.8 }),
  registrarDecisaoJev: async () => {},
}));
const semNomeCenario = cenario.startsWith("sem_nome_");
const { PEDIR_NOME_ATENDIMENTO } = await import("../../atendimento-sem-indicacao");
if (semNomeCenario) mock.module("@/lib/nina/jev.server", () => ({
  jevAtivo: async (_c: string, fase: string) => !cenario.includes("fallback") && fase === "fase2_encaminhamento",
  perguntarJev: async () => ({ ok: true, respostas: { nome_atendimento: {
    choice: cenario.endsWith("informado") ? "informado" : cenario.endsWith("outro") ? "outro" : "sem_nome", confidence: 0.98 },
    entendimento: { noul: 0.99 }, urgencia: { noul: cenario.endsWith("urgencia") ? 0.99 : 0.01 } } }),
  contagemAnteriorFase1: async () => null,
  limitesJev: async () => ({ urgencia: 0.5, pedido_atendente: 0.7, irritacao: 0.8 }),
  registrarDecisaoJev: async () => {},
}));
const duvidaCenario = cenario.startsWith("catalogo_duvida_");
const decisoesEntendimento: any[] = [];
if (duvidaCenario) mock.module("@/lib/nina/jev.server", () => ({
  jevAtivo: async (_clinica: string, fase: string) => fase === "fase2_encaminhamento",
  perguntarJev: async () => ({ ok: true, respostas: { entendimento: { noul: cenario.endsWith("entendida") ? 0.95 : 0.1 } } }),
  contagemAnteriorFase1: async () => {
    if (cenario.endsWith("primeira")) return null;
    const { marcoAtendimento } = await import("../../jev-contexto");
    return { falhas: 1, marco: marcoAtendimento(estadoVazio()), confiancas: [0.2],
      mensagensEntrada: [cenario.endsWith("reprocessamento") ? "entrada-simulada" : "entrada-anterior"] };
  },
  limitesJev: async () => ({ urgencia: 0.5, pedido_atendente: 0.7, irritacao: 0.8 }),
  registrarDecisaoJev: async (decisao: any) => { decisoesEntendimento.push(structuredClone(decisao)); },
}));
if (cenario.includes("_jev_")) mock.module("@/lib/nina/jev.server", () => ({
  jevAtivo: async (_clinica: string, fase: string) => fase === "fase6_conferencia",
  conferirRespostaJev: async (ctx: any) => {
    conferencias.push(structuredClone(ctx));
    return !ctx.jaCorrigida ? { acao: "refazer", instrucao: "Corrija apenas o valor sem novas consultas ou ações." }
      : { acao: cenario.endsWith("reprovada") ? "bloquear" : "enviar" };
  },
}));
const linkCenario = cenario.includes("_links_");
const pedidoConsulta = cenario.includes("_pedido_consulta");
const pedidoCenario = cenario.includes("_pedido_");
const fonteCenario = cenario.startsWith("fonte_");
const fonteRetomada = fonteCenario && cenario.endsWith("retomada");
const fonteEscolhida = cenario.startsWith("fonte_base") ? "base_conhecimento" : "clinica_os";
const clinicoGeral = cenario.startsWith("catalogo_clinico_geral_");
const procedimentoExecutante = cenario === "procedimento_executante";
const medicoClinico = cenario.endsWith("carlos") ? "Carlos Alberto Varillas" : cenario.endsWith("milton") ? "Milton Guimarães" : "Ana Souza";
const contextual = cenariosContextuais[cenario];
const reformulacoes = cenario.startsWith("catalogo_reformulacoes_");
const continuidadeCatalogo = cenario.startsWith("catalogo_continuidade_");
const nomeRenal = "ULTRASSONOGRAFIA DE RINS E VIAS URINARIAS";
const pedidoDensitometria = "densitometria óssea coluna lombar e colo de fêmur";
const nomeDensitometria = "DENSITOMETRIA / DENSITOMETRIA DUO ENERGETICA";
const confirmacaoPlural = cenario.startsWith("catalogo_confirmacao_plural");
const perguntasMultiplas = confirmacaoPlural || cenario.startsWith("catalogo_multiplas_") || reformulacoes || continuidadeCatalogo;
const reservaIndependente = cenario.startsWith("catalogo_multiplas_reserva");
const transferenciaFicticia = cenario === "catalogo_multiplas_transferencia_ficticia";
let estadoPerguntas: any = null;
const regraCatalogo = cenario.startsWith("catalogo_");
const sfp = cenario.startsWith("catalogo_sfp");
const ausente = cenario.startsWith("catalogo_ausente");
const unificado = cenario.startsWith("catalogo_identificacao_");
const esclarecer = cenario.startsWith("catalogo_esclarecimento") || unificado;
const escolhaMedico = cenario.startsWith("catalogo_medico_");
const confirmacaoMedico = cenario.startsWith("catalogo_medico_confirmacao");
const variantePreventivo = cenario.includes("interpretado_preventivo");
const perguntaMedico = cenario.endsWith("segunda")
  ? "Para identificar o profissional, pode confirmar o nome completo, a especialidade ou a unidade?\nAs opções encontradas são:\nSandro Prinscewal — CARDIOLOGIA, CLINICO GERAL"
  : "Você se refere a este profissional?\nSandro Prinscewal — CARDIOLOGIA, CLINICO GERAL";
const interpretacao = ({
  catalogo_interpretado_preventivo_com: {
    mensagem: "Quero marcar uma consulta de ginecologia com preventivo.", termo: "ginecologia", tipo_atendimento: "consulta", objetivos: ["agendamento"], publicado: "GINECOLOGIA", resposta: "Temos Consulta + Preventivo com Conceição Martins.",
  },
  catalogo_interpretado_preventivo_sem: {
    mensagem: "Quero consulta de ginecologia sem preventivo.", termo: "ginecologia", tipo_atendimento: "consulta", objetivos: ["agendamento"], publicado: "GINECOLOGIA", resposta: "Temos Consulta Ginecologia com Marcilio Quintão.",
  },
  catalogo_interpretado_cardiologia: {
    mensagem: "Boa tarde, Nina. Gostaria de agendar uma consulta com cardiologista, de preferência nos próximos dias. Estou sentindo algumas palpitações ocasionais e queria fazer uma avaliação.",
    termo: "cardiologia", tipo_atendimento: "consulta", objetivos: ["agendamento"], publicado: "CARDIOLOGIA", resposta: "Temos consulta de Cardiologia. Você prefere o primeiro disponível ou escolher o profissional?",
  },
  catalogo_interpretado_odontologia: {
    mensagem: "Quero saber o valor e os profissionais para marcar uma avaliação odontológica.",
    termo: "avaliação odontológica", tipo_atendimento: "consulta", objetivos: ["agendamento"], publicado: "ODONTOLOGIA", resposta: "Temos Avaliação odontológica. Você prefere Jean Ferreira, Raiani ou Karen?",
  },
  catalogo_interpretado_nebulizacao: {
    mensagem: "Olá, gostaria de saber como funciona o atendimento para nebulização.",
    termo: "nebulização", tipo_atendimento: "exame_procedimento", objetivos: ["informacoes_gerais"], publicado: "NEBULIZAÇÃO", resposta: "Temos Nebulização. O atendimento é por ordem de chegada.",
  },
  catalogo_interpretado_usg: {
    mensagem: "Boa tarde, a médica pediu uma usg de abdome total sem doppler. Como faço para marcar para a próxima semana?",
    termo: "usg abdome total sem doppler", tipo_atendimento: "exame_procedimento", objetivos: ["agendamento"], publicado: "ULTRASSONOGRAFIA ABDOME TOTAL SEM DOPPLER", resposta: "Temos Ultrassonografia de abdome total sem Doppler.",
  },
  catalogo_interpretado_ecg: {
    mensagem: "Boa tarde, quero marcar um ECG solicitado pelo cardiologista.",
    termo: "ECG", tipo_atendimento: "exame_procedimento", objetivos: ["agendamento"], publicado: "ELETROCARDIOGRAMA", resposta: "Temos Eletrocardiograma.",
  },
} as Record<string, { mensagem: string; termo: string; tipo_atendimento: "consulta" | "exame_procedimento"; objetivos: string[]; publicado: string; resposta: string }>)[cenario.replace(/_recuperacao$/, "")];
// Catálogo misto: a recuperação real precisa separar os quatro cardiologistas
// dos exames que também mencionam cardiologia. Um único registro escondia o bug.
const catalogoInterpretado: Record<string, any[]> = {
  profissionais: ["Sandro", "Antonio", "Rosângela", "Alex"].map((nome, i) => ({
    id: `medico-${i}`, clinica_id: "clinica-simulada", status: "PUBLICADO", nome,
    especialidades: [{ nome: "CARDIOLOGIA" }], formas_pagamento: [], horarios: [], convenios: [],
  })),
  servicos: ["MAPA 24H", "ECOCARDIOGRAMA", "ELETROCARDIOGRAMA", "HOLTER 24H", "TESTE ERGOMETRICO", "NEBULIZAÇÃO", "ULTRASSONOGRAFIA ABDOME TOTAL SEM DOPPLER", "ULTRASSONOGRAFIA ABDOME SUPERIOR COM DOPPLER"].map((nome, i) => ({
    id: `servico-${i}`, clinica_id: "clinica-simulada", status: "PUBLICADO", nome,
    descricao_publica: i < 5 ? "Exame de cardiologia" : "Atendimento por ordem de chegada",
    executantes: [], formas_pagamento: [], valor: null,
  })),
};
const baseFonte = [{ id: "base-ecg", clinica_id: "clinica-simulada", status: "PUBLICADO",
  nome: "Eletrocardiograma", estrutura: { aliases: ["traçado do coração"], pedido_medico: pedidoCenario ? (cenario.includes("dispensado") ? "dispensado" : "obrigatorio") : "nao_informado" }, valor: 157, descricao_publica: "Informação exclusiva da base", formas_pagamento: [], executantes: [] }];
if (fonteCenario) catalogoInterpretado.servicos = [{ ...baseFonte[0], id: "os-ecg", valor: 93, descricao_publica: "Informação exclusiva do cadastro" }];
if (clinicoGeral) {
  catalogoInterpretado.profissionais = [{
    id: "catalogo-clinico", medico_id: "medico-clinico", clinica_id: "clinica-simulada", status: "PUBLICADO", nome: medicoClinico,
    especialidades: [{ nome: "CLINICO GERAL" }], formas_pagamento: [], horarios: [], convenios: [],
    observacao_publica: `CONSULTA CLINICO GERAL\nEspecialidade: CLINICO GERAL\nDinheiro: R$ 120,00\nObservação: ${cenario.endsWith("carlos") ? "Ficha — 15 vagas" : "Agendado"}`,
  }];
  catalogoInterpretado.medicos = [{ id: "medico-clinico", nome: medicoClinico, clinica_id: "clinica-simulada", ativo: true }];
}
if (interpretacao?.publicado === "ODONTOLOGIA") catalogoInterpretado.profissionais = ["Jean Ferreira", "Raiani", "Karen"].map((nome, i) => ({
  id: `medico-${i}`, clinica_id: "clinica-simulada", status: "PUBLICADO", nome,
  especialidades: [{ nome: "ODONTOLOGIA" }], tipo_atendimento: "Avaliação odontológica",
  formas_pagamento: [], horarios: [], convenios: [],
}));
if (variantePreventivo) catalogoInterpretado.profissionais = ["Conceição Martins", "Marcilio Quintão"].map((nome, i) => ({
  id: `medico-${i}`, clinica_id: "clinica-simulada", status: "PUBLICADO", nome, especialidades: [{ nome: "GINECOLOGIA" }],
  observacao_publica: `${i === 0 ? "CONSULTA + PREVENTIVO" : "CONSULTA GINECOLOGIA"}\nEspecialidade: GINECOLOGIA\nDinheiro: R$ ${i === 0 ? "172" : "120"},00\nObservação: Agendado`,
  formas_pagamento: [], horarios: [], convenios: [],
}));
if (escolhaMedico) catalogoInterpretado.profissionais = ["Shirley Martins", "Raisa Moura"].map((nome, i) => ({
  id: `medico-${i}`, clinica_id: "clinica-simulada", status: "PUBLICADO", nome,
  especialidades: [{ nome: "DERMATOLOGIA" }], formas_pagamento: [], horarios: [], convenios: [],
}));
if (confirmacaoMedico) catalogoInterpretado.profissionais = [{
  id: "medico-0", clinica_id: "clinica-simulada", status: "PUBLICADO", nome: "Sandro Prinscewal",
  especialidades: [{ nome: "CARDIOLOGIA" }, { nome: "CLINICO GERAL" }], formas_pagamento: [], horarios: [], convenios: [],
}];
const perguntaEsclarecimento = unificado ? "Você quis dizer Eletrocardiograma? Pode confirmar ou escrever o nome novamente." : "Pode informar o nome do procedimento por extenso?";
const ferramentaAusente = cenario.includes("medicos_modelo") ? "buscar_medicos"
  : cenario.includes("procedimentos_modelo") ? "buscar_procedimentos"
  : cenario.includes("especialidades_modelo") ? "listar_especialidades" : "consultar_cadastro";
const escolhaHorario = cenario.startsWith("escolha_");
const modoConfirmacao = cenario.startsWith("confirmado_") ? cenario.slice("confirmado_".length) : null;
const resumoEscolhido = ["escolha_pre", "escolha_ficha"].includes(cenario)
  ? textoDaChave(cenario === "escolha_pre" ? "fluxo.agendamento.revisar_pre_agendamento" : "fluxo.agendamento.revisar_ficha",
    { profissional: "Dr. Jorge Ribeiro", procedimento: "Consulta", data: "21/01/2030", horario: "10:20", unidade: "Clínica simulada" }).texto
  : "Confira: Consulta Cardiologia com Dr. Jorge Ribeiro, dia 21/01/2030, às 10:20. Você confirma?";
const agenda = cenario !== "direta" && !regraCatalogo && !fonteCenario;
const pergunta = alteracaoCenario ? process.argv[4] ?? "quero cancelar minha consulta" : semNomeCenario ? (cenario.endsWith("misto") ? "Quanto custa eletrocardiograma? E qual médico para dor nas costas?" : cenario.endsWith("informado") ? "Quero ortopedista" : cenario.endsWith("outro") ? "Qual o endereço?" : cenario.includes("segunda") ? "não sei, ela tá com dor tem 70 ano" : "boa noite to com dor nas costa faz uma semana, desce pra perna. qual medico eu passo ai?") : duvidaCenario ? (cenario === "catalogo_duvida_saudacao" ? "Boa noite" : "Queria saber se vocês fazem usan") : confirmacaoPlural ? (cenario.includes("parcial") ? "só o segundo. precisa de jejum?" : "isso os 2. precisa de jejum pra ressonancia? tenho pino na perna") : continuidadeCatalogo ? "é a primeira, rins e vias urinarias, ele é adulto" : reformulacoes ? `Quanto custa ${pedidoDensitometria} (duo energética)?` : perguntasMultiplas ? "O Dr. Adrian atende Urologia? E o Dr. Antonio atende Psiquiatria?" : unificado ? cenario.endsWith("primeiro") ? "Quero eletrcardiograma" : cenario.includes("confirmou") ? "isso" : cenario.endsWith("recusou") ? "não, é outro" : cenario.endsWith("mudou_assunto") ? "Agora quero outra consulta XYZ" : cenario.endsWith("resolvido") ? "Eletrocardiograma" : "exame ZYX"
  : cenario.endsWith("novo_pedido") ? "Agora quero outro exame XYZ" : clinicoGeral ? `Quero clínico geral com ${medicoClinico} na primeira data disponível.` : confirmacaoMedico ? process.argv[4] ?? "Isso" : escolhaMedico ? cenario.endsWith("resolvido") ? "Quero a Shirley" : "quero a Suellen" : interpretacao ? interpretacao.mensagem : esclarecer ? cenario.endsWith("primeiro") ? "Quero exame XYZ" : cenario.endsWith("resolvido") ? "Eletrocardiograma" : "Não sei explicar" : contextual ? contextual.pergunta : (sfp && cenario.endsWith("modelo")) || (ausente && cenario.includes("modelo")) ? "oi"
  : ausente ? cenario.endsWith("dado_pessoal") ? "Meu nome é João Silva"
    : cenario.endsWith("misto") ? "Qual o valor do eletrocardiograma e da consulta de pneumologia?"
    : cenario.endsWith("generico") ? "Quero marcar uma consulta"
    : cenario.endsWith("exame") ? "Quanto custa o exame PET-CT?"
    : cenario.endsWith("procedimento") ? "Vocês fazem o procedimento crioablação?"
    : "Gostaria de marca a pneumologista"
  : escolhaHorario ? "Quero o horário das 10:20 com Dr. Jorge Ribeiro no dia 21/01/2030."
  : pedidoConsulta ? "Quero consulta de cardiologia" : fonteCenario ? "Quero saber do traçado do coração" : agenda ? "Tem vagas com Dr. Jorge Ribeiro?" : "quais são as informações do eletrocardiograma?";
const entradaPaciente = vacinaCenario ? "Faz teste de DNA de paternidade? E vacina da gripe tem? Pix só antes?" : (escopoEscala ? cenario.endsWith("otorrino") ? "Tem otorrino amanhã?"
  : `Quero ${escopoEscala[0]} com Dr. ${escopoEscala[1]} amanhã de manhã` : pergunta) + (linkCenario ? " Veja https://externo-paciente.com/pedido e bit.ly/laudo" : "");
const nomeProfissional = sfp ? "SFP" : cenario === "catalogo_enfermagem" ? "Enfermagem"
  : cenario === "catalogo_laboratorio" ? "Laboratório"
  : cenario === "catalogo_nome_proprio" ? "Dra. Ana Souza"
  : cenario === "catalogo_equipe_enfermagem" ? "Equipe de Enfermagem"
  : regraCatalogo ? "Técnica" : "Dra. Ana Souza";
const respostaModelo = "Eletrocardiograma: R$ 80,00 no dinheiro e R$ 95,00 no cartão. Profissional: " + nomeProfissional + ". Segunda a sexta, das 8h às 12h. Sem jejum. Leve o pedido médico.";
const prompt = "Você é Nina. Consulte a base e informe preço, profissional, horário e preparo solicitados. Não acrescente saudação à resposta sobre exames."
  + (fotoCenario ? "\n" + montarBlocoIdentidade({ assistente: "Aurora", estabelecimento: "Vale Verde", tipoEstabelecimento: "Policlínica" }) : "")
  + (contextual ? `\n\n${CONTINUIDADE_CONSULTA_AGENDA}` : "");
const agora = Date.now();
const estadoContextual = { ...estadoVazio(), session_id: "sessao-contextual",
  session_started_at: new Date(agora - 30 * 60_000).toISOString(),
  updated_at: new Date(agora).toISOString(),
};
if (alteracaoCenario && cenario.includes("retomada")) {
  estadoContextual.appointment.appointment_id = "reserva-anterior";
  estadoContextual.appointment.confirmed_in_session = estadoContextual.session_id;
  estadoContextual.flow.stage = "BOOKED";
}
if (cenario === "catalogo_multiplas_retomada") estadoContextual.knowledge_context = {
  versao: 1, clinicaId: "clinica-simulada", sessionId: "sessao-contextual", consulta: { termo: "Urologia", medico: "Adrian" },
  referencias: [{ registro: "Urologia", procedimento: "Urologia", medicoNome: "Marcelo", versao: null }],
  esclarecimento: { tipo: "profissional", opcoes: [{ id: "Urologia", nome: "Marcelo" }], pergunta: "Sobre Urologia, você quis dizer Marcelo? Pode confirmar ou escrever o nome novamente." },
  esclarecimentoTentativas: 1,
};
if (fonteRetomada) {
  estadoContextual.fonte_consulta = { fonte: fonteEscolhida === "clinica_os" ? "base_conhecimento" : "clinica_os", revisao: "anterior" };
  estadoContextual.appointment.doctor_id = "id-da-fonte-anterior";
  estadoContextual.appointment.doctor_name = "PROFISSIONAL_DESATUALIZADO";
  estadoContextual.knowledge_context = { versao: 1, clinicaId: "clinica-simulada", sessionId: "sessao-contextual",
    consulta: { termo: "Eletrocardiograma", tipo_atendimento: "exame_procedimento" },
    referencias: [{ registro: "id-da-fonte-anterior", versao: null, procedimento: "Eletrocardiograma", medicoNome: "PROFISSIONAL_DESATUALIZADO" }] };
}
if (procedimentoExecutante) {
  estadoContextual.appointment.procedimento_solicitado = { clinica_id: "clinica-simulada", session_id: "sessao-contextual",
    catalogo_id: "servico-bio", nome: "Bioimpedância", tipo_atendimento: "exame_procedimento" };
  estadoContextual.knowledge_context = { versao: 1, clinicaId: "clinica-simulada", sessionId: "sessao-contextual",
    consulta: { termo: "Bioimpedância", tipo_atendimento: "exame_procedimento" },
    referencias: [{ registro: "servico-bio", versao: null, procedimento: "Bioimpedância", medicoNome: "Mariana Portugal" }] };
}
if (esclarecer && !cenario.endsWith("primeiro"))
  estadoContextual.knowledge_context = {
    versao: 1,
    clinicaId: "clinica-simulada",
    sessionId: "sessao-contextual",
    consulta: { termo: "Quero exame XYZ" },
    referencias: [],
    esclarecimento: {
      tipo: "sigla",
      pergunta: perguntaEsclarecimento,
      opcoes: [],
    },
    ...(cenario.endsWith("terceiro") ||
    cenario.includes("apos_duas") ||
    cenario.endsWith("novo_pedido")
      ? {
          esclarecimentoTentativas: 2,
          esclarecimentoPerguntas: ["Qual exame deseja?", perguntaEsclarecimento],
        }
      : {}),
  };
if (escolhaMedico) estadoContextual.knowledge_context = {
  versao: 1, clinicaId: "clinica-simulada", sessionId: "sessao-contextual",
  consulta: { termo: "Dermatologia", tipo_atendimento: "consulta" },
  referencias: [{ registro: "medico-0", versao: null, procedimento: "Dermatologia", medicoNome: "Shirley Martins" }],
  ...(!cenario.endsWith("primeiro") ? { esclarecimentoTentativas: 1, esclarecimento: {
    tipo: "profissional", motivo: "medico_nao_identificado", atendimento: "Dermatologia",
    pergunta: "Não encontrei esse nome. Qual deseja? Shirley Martins ou Raisa Moura?",
    opcoes: [{ id: "medico-0", nome: "Shirley Martins", especialidade: "Dermatologia" }],
  } } : {}),
};
if (unificado && !cenario.endsWith("primeiro")) estadoContextual.knowledge_context = {
  versao: 1, clinicaId: "clinica-simulada", sessionId: "sessao-contextual",
  consulta: { termo: "eletrcardiograma", tipo_atendimento: "exame_procedimento" },
  referencias: [{ registro: "ecg", versao: null, procedimento: "Eletrocardiograma", medicoNome: null }],
  esclarecimento: { tipo: "procedimento", pergunta: perguntaEsclarecimento, opcoes: [{ id: "ecg", nome: "Eletrocardiograma" }] }, esclarecimentoTentativas: 1,
};
const itensPlural = [
  { id: "rx", termo: "RX do torax PA e perfil", nome: "RX TORAX AP/PERFIL" },
  { id: "rm", termo: "RM joelho esquerdo", nome: "RM DE JOELHO (CADA LADO)" },
];
if (confirmacaoPlural && !cenario.includes("nova_sessao")) {
  const pendencias = itensPlural.map(i => ({ versao: 1 as const, clinicaId: "clinica-simulada", sessionId: "sessao-contextual",
    consulta: { termo: i.termo, tipo_atendimento: "exame_procedimento" as const },
    referencias: [{ registro: i.id, versao: null, procedimento: i.nome, medicoNome: null }],
    esclarecimento: { tipo: "procedimento" as const, pergunta: "Você quis dizer " + i.nome + "? Pode confirmar ou escrever o nome novamente.",
      opcoes: [{ id: i.id, nome: i.nome }] }, esclarecimentoTentativas: 1 }));
  const { perguntas } = await import("../../perguntas-independentes");
  estadoContextual.knowledge_context = { ...pendencias[0]!, pendenciasIdentificacao: pendencias,
    esclarecimento: { tipo: "procedimento", pergunta: perguntas(pendencias), opcoes: [] } };
}
const registroMensagem = (body: string, indice: number, direction = "out", status = "sent") => ({
  id: `historico-${indice}`, conversa_id: "conversa-contextual", direction, body, status,
  created_at: new Date(agora - (20 - indice) * 60_000).toISOString(), is_teste: teste,
});
if (confirmacaoMedico) estadoContextual.knowledge_context = {
  versao: 1, clinicaId: "clinica-simulada", sessionId: "sessao-contextual",
  consulta: { termo: "clinico geral", tipo_atendimento: "consulta" },
  referencias: [{ registro: "medico-0", versao: null, procedimento: null, medicoNome: "Sandro Prinscewal" }],
  esclarecimentoTentativas: cenario.endsWith("segunda") ? 2 : 1,
  esclarecimento: { tipo: "profissional", pergunta: perguntaMedico,
    opcoes: [{ id: "medico-0", nome: "Sandro Prinscewal", especialidade: "CARDIOLOGIA, CLINICO GERAL" }] },
};
if (cenario === "foto_sessao_nova") estadoContextual.session_started_at = new Date(agora - 3 * 60_000).toISOString();
const mensagensContextuais = semNomeCenario ? [
  { ...registroMensagem("Tenho dor, qual médico?", 0, "in", "received"), id: "entrada-anterior" },
  { ...registroMensagem(cenario.includes("segunda") || cenario.endsWith("informado") || cenario.endsWith("outro") ? PEDIR_NOME_ATENDIMENTO : "Como posso ajudar?", 1),
    enviada_por: "nina", status: cenario.endsWith("failed") ? "failed" : "sent" },
  { ...registroMensagem(pergunta, 18, "in", "received"), id: "entrada-simulada" },
] : duvidaCenario ? [
  { ...registroMensagem(cenario.endsWith("apos_saudacao") ? "Boa noite" : "Queria exame xyz", 0, "in", "received"), id: "entrada-anterior" },
  { ...registroMensagem(cenario.endsWith("apos_saudacao") || cenario.endsWith("sem_pergunta")
      ? "Boa noite! Como posso te ajudar hoje?" : "Pode explicar de outra forma o que você precisa?", 1),
    enviada_por: "nina", status: cenario.endsWith("nao_entregue") ? "failed" : "sent" },
  { ...registroMensagem(pergunta, 18, "in", "received"), id: "entrada-simulada" },
] : perguntasMultiplas ? [
  ...(confirmacaoPlural && estadoContextual.knowledge_context ? [registroMensagem(estadoContextual.knowledge_context.esclarecimento!.pergunta, 1)] : []),
  ...(cenario === "catalogo_multiplas_retomada" ? [registroMensagem(estadoContextual.knowledge_context!.esclarecimento!.pergunta, 1)] : []),
  { ...registroMensagem(pergunta, 18, "in", "received"), id: "entrada-simulada" },
] : fotoCenario ? [
  ...(cenario.startsWith("foto_apresentacao_") ? [{ ...registroMensagem("Olá! Me chamo Aurora, atendente virtual da Policlínica Vale Verde.", 0),
    clinica_id: "clinica-simulada", enviada_por: "nina", status: cenario.endsWith("falhou") ? "failed" : "sent" }] : []),
  ...(cenario === "foto_primeira" || cenario.startsWith("foto_apresentacao_") || cenario === "foto_tecnica" ? [] : [{ ...registroMensagem(PEDIR_NOVA_FOTO, 1), enviada_por: "nina",
    clinica_id: "clinica-simulada", status: cenario === "foto_pedido_pendente" ? "pending" : "sent" }]),
  { ...registroMensagem("Foto", 18, "in", "received"), id: "entrada-simulada", clinica_id: "clinica-simulada", tipo: "image",
    transcricao: cenario === "foto_resolvida" ? "Enviei a foto de um pedido médico com: ECG." : "[Foto recebida: não foi possível ler com segurança.]",
    raw: { nina_leitura_imagem: cenario === "foto_tecnica" ? { tipo: "falha_tecnica", motivo: "provedor" }
      : cenario === "foto_resolvida" ? { tipo: "pedido_medico", itens: ["ECG"] } : { tipo: "ilegivel" } } },
] : unificado ? [
  ...(cenario.endsWith("primeiro") ? [] : [registroMensagem(cenario.includes("fechamento")
    ? apresentarPerguntaEsclarecimento(perguntaEsclarecimento, { tipo: "procedimento", tipoAtendimento: "exame_procedimento" })
    : perguntaEsclarecimento, 1)]),
  { ...registroMensagem(pergunta, 18, "in", "received"), id: "entrada-simulada" },
] : linkCenario ? [
  registroMensagem("Tenho um pedido https://historico-paciente.com", 1, "in", "received"),
  registroMensagem("Pode informar o exame?", 2),
  { ...registroMensagem(entradaPaciente, 18, "in", "received"), id: "entrada-simulada" },
] : pedidoCenario ? [
  ...(cenario.includes("foto") ? [{ ...registroMensagem("Foto", 1, "in", "received"), tipo: "image", transcricao: "Enviei a foto de um pedido médico com: Eletrocardiograma." }] : []),
  ...(cenario.includes("solicitado") ? [registroMensagem("Para Eletrocardiograma, é necessário pedido médico.\n\nPode enviar uma foto legível do pedido médico por aqui?", 1)] : []),
  { ...registroMensagem(pergunta, 18, "in", "received"), id: "entrada-simulada" },
] : confirmacaoMedico ? [
  registroMensagem("Quero agendar um clínico geral", 0, "in", "received"),
  registroMensagem("Qual profissional você prefere?", 1),
  registroMensagem("Quero o dr Sandro por favor", 2, "in", "received"),
  registroMensagem(perguntaMedico, 3),
  { ...registroMensagem(pergunta, 18, "in", "received"), id: "entrada-simulada" },
] : contextual ? [
  registroMensagem("Gostaria de marcar oftalmologista", 0, "in", "received"),
  registroMensagem("Temos João Hélio (joao-helio) e Marina (marina) para Oftalmologia.", 1),
  registroMensagem("com o joao helio", 2, "in", "received"),
  ...Array.from({ length: 10 }, (_, i) => registroMensagem(`Informação anterior ${i + 1}.`, i + 3)),
  registroMensagem(contextual.oferta, 13),
  registroMensagem("RESPOSTA_FALHOU não entregue", 14, "out", "failed"),
  { ...registroMensagem("OUTRA_SESSAO não deve entrar", 15), created_at: new Date(agora - 60 * 60_000).toISOString() },
  { ...registroMensagem("OUTRO_AMBIENTE não deve entrar", 16), is_teste: !teste },
  { ...registroMensagem("OUTRA_CONVERSA não deve entrar", 17), conversa_id: "outra-conversa" },
  { ...registroMensagem(pergunta, 18, "in", "received"), id: "entrada-simulada" },
] : [];
const consultas: string[] = [];
const gravacoes: Array<{ tabela: string; valor: any }> = [];
const requests: any[] = [];
const ferramentas: string[] = [];
const ordem: string[] = [];
const argumentosFerramentas: Array<{ nome: string; args: any }> = [];
const encaminhamentos: unknown[] = [];
let motorChamado = 0;
let rede = 0;
const proibido = () => { motorChamado++; throw new Error("Motor não pode ser executado"); };
mock.module("@/lib/nina/confidence/runtime", () => ({
  decidirNoTurno: proibido, garantirScoreDoTextoEnviado: proibido,
  validarAgendamentoAntesDoCommit: proibido, montarContextoDoTurno: proibido,
}));
mock.module("@/lib/nina/confidence/claims", () => ({ avaliarGrounding: proibido }));
mock.module("@/lib/nina/confidence/configuracao-turno.server", () => ({ configuracaoDoTurno: proibido }));
globalThis.fetch = Object.assign(async () => {
  rede++; throw new Error("Rede proibida na simulação");
}, { preconnect: () => {} });

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(tabela: string) {
      consultas.push(tabela);
      if (tabela.startsWith("nina_confianca") && tabela !== "nina_confianca_vinculos") return proibido();
      let unica = false;
      const filtrosCatalogo: Array<(linha: any) => boolean> = [];
      let limiteCatalogo = Infinity;
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => { filtrosCatalogo.push(l => l[k] === v); return q; },
        in: (k: string, valores: unknown[]) => { filtrosCatalogo.push(l => valores.includes(l[k])); return q; },
        gt: (k: string, v: string) => { filtrosCatalogo.push(l => l[k] > v); return q; },
        neq: () => q, or: () => q,
        order: () => q, limit: (n: number) => { limiteCatalogo = n; return q; }, gte: (k: string, v: string) => { if (fotoCenario) filtrosCatalogo.push(l => l[k] >= v); return q; }, lte: (k: string, v: string) => { if (fotoCenario) filtrosCatalogo.push(l => l[k] <= v); return q; }, is: () => q,
        maybeSingle: () => { unica = true; return q; },
        insert: (valor: any) => { gravacoes.push({ tabela, valor }); return q; },
        upsert: (valor: any) => { gravacoes.push({ tabela, valor }); return q; },
        update: (valor: any) => { gravacoes.push({ tabela, valor: perguntasMultiplas ? structuredClone(valor) : valor }); return q; },
        then: (resolve: any) => Promise.resolve(resolve({
          data: fonteCenario && tabela === "clinica_feature_flags" ? [{ clinica_id: "clinica-simulada", flag_key: "nina_fonte_conhecimento", ativo: true, config: { fonte: fonteEscolhida }, updated_at: "2026-10-04T15:00:00Z" }].find(l => filtrosCatalogo.every(f => f(l))) ?? null
            : pedidoConsulta && tabela === "nina_cat_profissionais" ? [{ id: "medico-base", clinica_id: "clinica-simulada", status: "PUBLICADO", nome: "Ana Souza", especialidades: [{ nome: "CARDIOLOGIA" }], estrutura: { pedido_medico: "obrigatorio" }, formas_pagamento: [], horarios: [], convenios: [] }].filter(l => filtrosCatalogo.every(f => f(l))).slice(0, limiteCatalogo)
            : fonteCenario && tabela === "nina_cat_servicos" ? baseFonte.filter(l => filtrosCatalogo.every(f => f(l))).slice(0, limiteCatalogo)
            : (interpretacao || escolhaMedico || clinicoGeral) && catalogoInterpretado[tabela] ? catalogoInterpretado[tabela]!.filter(l => filtrosCatalogo.every(f => f(l))).slice(0, limiteCatalogo)
            : tabela === "clinicas" ? { nome: "Clínica simulada", base_importada: false }
            : (alteracaoCenario || semNomeCenario || duvidaCenario || perguntasMultiplas || fotoCenario || contextual || esclarecer || escolhaMedico || variantePreventivo || clinicoGeral || procedimentoExecutante || fonteRetomada || pedidoCenario || linkCenario || unificado) && tabela === "atend_conversas" ? { id: "conversa-contextual", nina_fluxo_estado: estadoContextual }
            : (alteracaoCenario || semNomeCenario || duvidaCenario || perguntasMultiplas || fotoCenario || contextual || confirmacaoMedico || pedidoCenario || linkCenario || unificado) && tabela === "whatsapp_mensagens" ? (fotoCenario ? mensagensContextuais.filter(l => filtrosCatalogo.every(f => f(l))) : mensagensContextuais)
            : unica ? null : [], error: null,
          count: (fotoCenario || contextual || confirmacaoMedico || pedidoCenario || linkCenario || unificado) && tabela === "whatsapp_mensagens" ? mensagensContextuais.length : 0,
        })),
      };
      return q;
    },
    rpc: async () => ({ data: [], error: null }),
  },
}));
// A Nina lê o cadastro (fonte operacional); a simulação entrega as mesmas linhas "publicadas" do cenário.
mock.module("@/lib/nina/fonte-operacional.server", () => ({
  ninaInformaPeloCadastro: async () => true,
  limparCacheFonteOperacional: () => {},
  lerFonteOperacional: async (clinicaId: string) => {
    const usar: Record<string, any[]> = (interpretacao || escolhaMedico || clinicoGeral || fonteCenario) ? catalogoInterpretado : {};
    const publicados = (t: string) => (usar[t] ?? []).filter((l) => l.clinica_id === clinicaId && l.status === "PUBLICADO");
    return { servicos: publicados("servicos"), profissionais: publicados("profissionais") };
  },
}));
mock.module("@/lib/nina/agenda-flag.server", () => ({ ferramentasAgendaAtivas: async () => escolhaHorario || clinicoGeral || cenario.startsWith("loop_alternativas") || (progressoLongo && !cenario.endsWith("informativo")) }));
mock.module("@/lib/nina/atendimento-fase1.server", () => ({ flagFluxoFase1Ativa: async () => false }));
mock.module("@/lib/nina/atendimento-fase3.server", () => ({ flagFluxoFase3Ativa: async () => false }));
mock.module("@/lib/nina/atendimento-fase6.server", () => ({ flagFluxoFase6Ativa: async () => false }));
mock.module("@/lib/nina/aprendizado.server", () => ({ recuperarAprendizados: async () => [] }));
mock.module("@/lib/nina/instrucoes-runtime.server", () => ({ promptInstrucoes: async () => ({
  texto: prompt, template: prompt, origem: "publicada", versao: 42,
  versaoId: "prompt-42", publicadoEm: "2026-09-16T12:00:00Z", fallbackPorErro: false,
}) }));
if (!fonteCenario) mock.module("@/lib/nina/catalogo-prompt.server", () => ({ contarCatalogoPublicado: async () => ({ servicos: 1, profissionais: 1 }) }));
mock.module("@/lib/nina/paciente-tools.server", () => ({
  FERRAMENTAS_NINA_CONSULTA: ["consultar_cadastro", "consultar_disponibilidade", "verificar_horario", "proxima_vaga", "consultar_primeiro_disponivel"]
    .map(name => ({ type: "function", function: { name } })),
  FERRAMENTAS_NINA_PACIENTE: ["selecionar_horario", "consultar_disponibilidade", "verificar_horario", "proxima_vaga", "consultar_primeiro_disponivel"]
    .map(name => ({ type: "function", function: { name } })),
  executarFerramentaPaciente: async (ctx: any, nome: string) => {
    if (escolhaHorario && nome === "consultar_cadastro_paciente") {
      ferramentas.push(nome);
      return { ok: true, campos_faltantes: cenario.endsWith("cadastro_completo") ? [] : ["nome", "data_nascimento"] };
    }
    if (escolhaHorario && nome === "identificar_paciente" && cenario.endsWith("cadastro_completo")) {
      ferramentas.push(nome);
      ctx.pacienteId = "paciente-teste";
      return { ok: true };
    }
    throw new Error("Usar broker simulado");
  },
}));
mock.module("@/lib/nina/handoff-tool.server", () => ({
  FERRAMENTA_HANDOFF: { type: "function", function: { name: "solicitar_atendente_humano" } },
}));
mock.module("@/lib/nina/revisao-conversa.server", () => ({
  respostaObsoleta: async () => cenario.endsWith("obsoleto"),
}));
const resultados: any[] = [];
mock.module("@/lib/nina/tool-broker.server", () => ({ criarToolBroker: (params: any) => ({
  resultados: () => resultados,
  executar: async (nome: string, args: unknown) => {
    const recusada = recusarFraseComoPesquisa(nome, args);
    if (recusada) return { ferramenta: nome, capacidade: "searchKnowledgeBase", fonte: "base_conhecimento",
      success: false, reused: false, appointment_confirmed: false, erro: recusada.erro, dados: recusada };
    ordem.push(nome);
    argumentosFerramentas.push({ nome, args: typeof args === "string" ? JSON.parse(args) : args });
    ferramentas.push(nome);
    if (vacinaCenario) {
      estadoPerguntas = params.ctxPaciente.estado;
      const a = argumentosFerramentas.at(-1)!.args;
      const vacina = a.termo === "vacina da gripe";
      if (!vacina && a.termo !== "DNA paternidade") throw new Error("Finalidade perdida: " + a.termo);
      const r = { ferramenta: nome, capacidade: nome === "consultar_cadastro" ? "searchKnowledgeBase" : "listCatalog", fonte: "base_conhecimento",
        success: true, reused: false, dados: vacina ? {
          ok: true, found: false, knowledge_status: "not_found", records: [],
          limitacao_catalogo: { codigo: "VACINA_ESPECIFICA_NAO_CONFIRMADA", pedido: a.termo, mensagem: "O cadastro não confirma a vacina da gripe." },
        } : { ok: true, found: true, knowledge_status: "found", records: [{ id: "dna", procedimento: "DNA paternidade", horario: "Segunda a sexta 08:00–12:00" }] } };
      resultados.push(r); return r;
    }
    if (confirmacaoPlural) {
      estadoPerguntas = params.ctxPaciente.estado;
      if (nome !== "consultar_cadastro") throw new Error("Confirmação não autoriza operação: " + nome);
      const a = argumentosFerramentas.at(-1)!.args;
      const item = itensPlural.find(i => i.nome === a.termo);
      if (!item) throw new Error("Reconsulta perdeu o exame: " + a.termo);
      const falha = cenario.includes("falha") && item.id === "rx";
      const r = { ferramenta: nome, capacidade: "searchKnowledgeBase", fonte: "base_conhecimento", success: !falha,
        ...(falha ? { erro: "TIMEOUT" } : {}), reused: false, appointment_confirmed: false,
        dados: falha ? null : { ok: true, found: true, knowledge_status: "found", tipo_atendimento: "exame_procedimento",
          records: [{ id: item.id, procedimento: item.nome, preco_dinheiro: item.id === "rx" ? 76 : 480, preparo: "Confirmar com a equipe" }] } };
      resultados.push(r); return r;
    }
    if (reservaIndependente && !params.ctxPaciente.estado.appointment.confirmation) {
      const estado = params.ctxPaciente.estado;
      selecionarVagaValidada(estado, "clinica-simulada", {
        medico_id: "isis", medico: "Isis Serrano Duarte", procedimento: "USG ABDOMINAL TOTAL",
        catalogo_id: "usg", tipo_atendimento: "exame_procedimento", modalidade: "hora_marcada", agenda_id: "agenda-usg",
        data: "2030-01-21", hora: "08:00", inicio: "2030-01-21T11:00:00Z", fim: "2030-01-21T11:10:00Z",
      }, "Resumo entregue do ultrassom");
      // A prova de aceite/cadastro é coberta pelo gate/executor reais em testes próprios.
      estado.appointment.confirmation.aceita = true;
    }
    if (procedimentoExecutante) {
      const r = { ferramenta: nome, capacidade: "listCatalog", fonte: "base_conhecimento", success: true, reused: false,
        dados: { ok: true, found: true, knowledge_status: "found", source: "nina_catalogo", source_type: "catalog",
          tipo_atendimento: "exame_procedimento", procedure: "Bioimpedância",
          pedido_interpretado: { atendimento: "Bioimpedância", tipo_atendimento: "exame_procedimento" },
          registros: [{ id: "servico-bio", tipo: "servico", procedimento: "Bioimpedância", medico: "Mariana Portugal" }],
          vinculos_agenda: [{ catalogo_id: "servico-bio", medico_id: "medico-mariana", situacao: "vinculado" }] } };
      resultados.push(r); return r;
    }
    if (clinicoGeral) {
      const p = argumentosFerramentas.at(-1)!.args;
      if (nome === "proxima_vaga") {
        const { modalidadePublicadaDoMedico } = await import("../../vinculo-catalogo-agenda.server");
        const consulta = params.ctxPaciente.estado.knowledge_context?.consulta;
        const modalidade = await modalidadePublicadaDoMedico("clinica-simulada", "medico-clinico", { atendimento: consulta?.termo ?? "" });
        const r = { ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda", success: true, reused: false,
          dados: { ok: true, modalidade_atendimento: modalidade, consulta_preservada: consulta, horarios: [{ data: "2030-01-21", hora: "10:20" }] } };
        resultados.push(r);
        return r;
      }
      const { searchKnowledgeBase } = await import("../../knowledge.server");
      const dados = await searchKnowledgeBase({ clinicaId: "clinica-simulada", query: p.termo ?? p.especialidade,
        tipo_atendimento: "consulta", medico: p.medico ?? p.nome });
      const r = { ferramenta: nome, capacidade: nome === "buscar_medicos" ? "listCatalog" : "searchKnowledgeBase", fonte: "base_conhecimento",
        success: true, reused: false, dados: { ok: true, ...dados } };
      resultados.push(r);
      return r;
    }
    if (cenario === "tipo_consulta_pendente" && nome !== "solicitar_atendente_humano") return {
      ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda", success: false,
      reused: false, appointment_confirmed: false, erro: "ACTION_NOT_AUTHORIZED",
      dados: { ok: false, erro: "ACTION_NOT_AUTHORIZED", codigo: "ATENDIMENTO_CONSULTA_PENDENTE",
        consulta_realizada: false, aguardando_paciente: true, pergunta: "Você deseja consulta comum ou noturna?" },
    };
    if (["falha_vinculo", "falha_selecao"].includes(cenario) && nome !== "solicitar_atendente_humano") return {
      ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda", success: false,
      reused: false, appointment_confirmed: false, erro: "ACTION_NOT_AUTHORIZED",
      dados: { ok: false, erro: "ACTION_NOT_AUTHORIZED", codigo: cenario === "falha_vinculo" ? "ATENDIMENTO_AGENDA_NAO_VINCULADO" : "ACTION_NOT_AUTHORIZED" },
    };
    if (contextual && nome === contextual.ferramenta) return {
      ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda", success: true,
      reused: false, appointment_confirmed: false,
      dados: { ok: true, slots: [{ medico: "João Hélio", data: "2030-01-21", hora: "10:20" }] },
    };
    if (nome === "selecionar_horario" && escolhaHorario) {
      const estado = params.ctxPaciente.estado;
      estado.session_id ??= "sessao-escolha";
      selecionarVagaValidada(estado, "clinica-simulada", {
        medico_id: "medico", medico: "Dr. Jorge Ribeiro", procedimento: "Consulta",
        data: "2030-01-21", hora: "10:20", inicio: "2030-01-21T13:20:00Z", fim: "2030-01-21T13:40:00Z",
        modalidade: "hora_marcada", agenda_id: null,
      }, resumoEscolhido);
      return {
      ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda", success: true,
      reused: false, appointment_confirmed: false, dados: { ok: true, resumo_confirmacao: resumoEscolhido },
      };
    }
    if (continuidadeCatalogo && ["consultar_cadastro", "buscar_procedimentos"].includes(nome)) {
      estadoPerguntas = params.ctxPaciente.estado;
      const a = typeof args === "string" ? JSON.parse(args) : args as any;
      const ampla = a.termo !== nomeRenal;
      const records = [{ id: "rins", procedimento: nomeRenal },
        ...(ampla ? [{ id: "pediatrico", procedimento: "ULTRASSONOGRAFIA PEDIATRICA - RINS E VIAS URINARIAS" }] : [])];
      return { ferramenta: nome, capacidade: nome === "consultar_cadastro" ? "searchKnowledgeBase" : "listCatalog",
        fonte: "base_conhecimento", success: true, reused: false, dados: {
          found: true, knowledge_status: "found", tipo_atendimento: "exame_procedimento", records,
          ...(ampla ? { esclarecimento: { tipo: "procedimento", pergunta: "Qual exame, comum ou pediátrico?",
            opcoes: records.map(r => ({ id: r.id, nome: r.procedimento })) } } : {}),
        } };
    }
    if (reformulacoes && ["consultar_cadastro", "buscar_procedimentos"].includes(nome) && !String(args).includes("Psiquiatria")) {
      estadoPerguntas = params.ctxPaciente.estado;
      const a = typeof args === "string" ? JSON.parse(args) : args as any;
      const inicial = a.termo === pedidoDensitometria;
      const ampla = a.termo === "densitometria";
      const records = inicial ? [] : [{ id: "densito", procedimento: nomeDensitometria, valor: "R$ 180,00" },
        ...(ampla ? [{ id: "corpo", procedimento: "DENSITOMETRIA CORPO INTEIRO", valor: "R$ 999,00" }] : [])];
      return { ferramenta: nome, capacidade: nome === "consultar_cadastro" ? "searchKnowledgeBase" : "listCatalog",
        fonte: "base_conhecimento", success: true, reused: false, dados: {
          ok: true, found: !inicial, knowledge_status: inicial ? "not_found" : "found", tipo_atendimento: "exame_procedimento", records,
          ...(ampla ? { esclarecimento: { tipo: "procedimento", pergunta: "Qual densitometria?",
            opcoes: records.map(r => ({ id: r.id, nome: r.procedimento })) } } : {}),
        } };
    }
    if (semNomeCenario && nome === "consultar_cadastro") return {
      ferramenta: nome, capacidade: "searchKnowledgeBase", fonte: "base_conhecimento", success: true, reused: false,
      dados: { ok: true, found: true, knowledge_status: "found", tipo_atendimento: "exame_procedimento",
        records: [{ id: "ecg", procedimento: "Eletrocardiograma", valor: "R$ 80,00" }] },
    };
    if (perguntasMultiplas && nome === "consultar_cadastro") {
      estadoPerguntas = params.ctxPaciente.estado;
      const a = typeof args === "string" ? JSON.parse(args) : args as any;
      const incerto = a.termo === "Urologia" || cenario.endsWith("duas_duvidas");
      const dados = incerto ? { ok: true, found: true, knowledge_status: "found", tipo_atendimento: "consulta",
        records: [{ id: a.termo, procedimento: a.termo, medico: "Candidato", valor: "R$ 999,00" }],
        esclarecimento: { tipo: "profissional", pergunta: a.termo === "Urologia"
          ? "Sobre Urologia, você quis dizer Marcelo? Pode confirmar ou escrever o nome novamente."
          : "Sobre Psiquiatria, você quis dizer Antonia? Pode confirmar ou escrever o nome novamente.",
          opcoes: [{ id: a.termo, nome: a.termo === "Urologia" ? "Marcelo" : "Antonia" }] }
      } : { ok: true, found: true, knowledge_status: "found", tipo_atendimento: "consulta", records: [
        { id: "psiquiatria", procedimento: "Consulta Psiquiatria", medico: "Dr. Antonio", dia: "Segunda", horario: "08:00" }
      ] };
      const r = { ferramenta: nome, capacidade: "searchKnowledgeBase", fonte: "base_conhecimento", success: true, reused: false, dados };
      resultados.push(r);
      return r;
    }
    if (nome === "solicitar_atendente_humano" && (agenda || regraCatalogo)) {
      const pedido = (typeof args === "string" ? JSON.parse(args) : args) as Record<string, unknown>;
      encaminhamentos.push(pedido);
      return { ferramenta: nome, capacidade: "requestHumanHandoff", fonte: "atendimento",
        success: !cenario.endsWith("falha_handoff"), reused: false, appointment_confirmed: false,
        dados: { ok: !cenario.endsWith("falha_handoff"), sem_mensagem_paciente: pedido.avisar_paciente === false && !cenario.endsWith("falha_handoff") },
        ...(cenario.endsWith("falha_handoff") ? { erro: "INTERNAL_ERROR" } : {}) };
    }
    if (nome === "consultar_disponibilidade" && cenario === "catalogo_sfp_recusa_agenda_modelo") return {
      ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda", success: false,
      reused: false, appointment_confirmed: false, erro: "CATALOGO_ATENDIMENTO_HUMANO",
      dados: { ok: false, erro: "CATALOGO_ATENDIMENTO_HUMANO", atendimento_humano_obrigatorio: true,
        motivo_transferencia: "CATALOGO_ATENDIMENTO_HUMANO / PROFISSIONAL_SFP: Eletrocardiograma. Encaminhamento obrigatório no cadastro." },
    };
    if (nome === "agendar" && (modoConfirmacao || reservaIndependente)) return {
      ferramenta: nome, capacidade: "createAppointment", fonte: "agenda", success: true,
      reused: false, appointment_confirmed: true, dados: {
        ok: true, verificado_no_banco: true, appointment_id: "ag-simulada", modalidade_atendimento: modoConfirmacao ?? "hora_marcada",
        date: "21/01/2030", time: reservaIndependente ? "08:00" : "10:20", medico: reservaIndependente ? "Isis Serrano Duarte" : "Dr. Jorge Ribeiro", ficha_numero: "007",
      },
    };
    if (nome === "consultar_disponibilidade" && cenario === "sem_pre") return {
      ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda", success: true,
      reused: false, appointment_confirmed: false, dados: { ok: true, sem_agendamento: true, modalidade_atendimento: "chegada_sem_pre_agendamento",
        orientacao_atendimento: "Atendimento por ordem de chegada, sem pré-agendamento. Basta ir à clínica nos períodos publicados." },
    };
    if (nome === "consultar_disponibilidade" && cenario === "modalidade_indefinida") return {
      ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda", success: false,
      reused: false, appointment_confirmed: false, erro: "MODALIDADE_NAO_DEFINIDA", dados: { ok: false },
    };
    if (nome === "consultar_cadastro" && progressoLongo) return {
      ferramenta: nome, capacidade: "searchKnowledgeBase", fonte: "base_conhecimento", success: true,
      reused: false, appointment_confirmed: false,
      dados: { ok: true, records: [{ id: `atendimento-${requests.length}`, preco_cartao: 145 }] },
    };
    if (nome === "consultar_disponibilidade" && progressoLongo) return {
      ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda", success: true,
      reused: false, appointment_confirmed: false,
      dados: { ok: true, horarios: [{ data: `2030-01-${10 + requests.length}`, hora: "10:00" }] },
    };
    if (nome === "consultar_disponibilidade" && agenda) {
      return { ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda",
        success: cenario !== "falha_consulta", reused: false, appointment_confirmed: false,
        dados: cenario === "falha_consulta" ? { ok: false, erro: "INTERNAL_ERROR", codigo: "AGENDA_QUERY_FAILED" }
          : { ok: true, reason: "AGENDA_CHEIA", horarios: [],
            proximos: cenario === "alternativas" || cenario.startsWith("loop_alternativas") ? [{ data: "2030-01-22", hora: "14:00" }] : [] },
        ...(cenario === "falha_consulta" ? { erro: "INTERNAL_ERROR" } : {}) };
    }
    if (ausente && nome === ferramentaAusente && !(cenario.endsWith("misto") && argumentosFerramentas.at(-1)?.args.termo === "eletrocardiograma")) {
      const tipada = nome !== "consultar_cadastro";
      const r = { ferramenta: nome, capacidade: tipada ? "listCatalog" : "searchKnowledgeBase", fonte: "base_conhecimento",
        success: !tipada, reused: false, appointment_confirmed: false,
        ...(tipada ? { erro: nome === "buscar_medicos" ? "DOCTOR_NOT_FOUND" : "PROCEDURE_NOT_FOUND" } : {}),
        dados: { ok: !tipada, source: "nina_catalogo", fonte: "catalogo_publicado", encaminhar_para_humano: true,
          found: false, knowledge_status: "not_found", records: [] },
      };
      resultados.push(r);
      return r;
    }
    if (escopoEscala && ["consultar_cadastro", "buscar_medicos"].includes(nome)) {
      // MJ-722: segunda busca não devolveu Claudia, mas a seleção dela persistia.
      const nomes = nome === "buscar_medicos" && cenario.endsWith("clinico") ? [escopoEscala[2]!]
        : nome === "buscar_medicos" || cenario.endsWith("otorrino") ? escopoEscala.slice(1) : [escopoEscala[1]!];
      return { ferramenta: nome, capacidade: "searchKnowledgeBase", fonte: "base_conhecimento", success: true,
        reused: false, appointment_confirmed: false, dados: { ok: true, found: true, knowledge_status: "found", tipo_atendimento: "consulta",
          records: nomes.map(medico => ({ id: medico, tipo: "profissional", medico, procedimento: `Consulta ${escopoEscala[0]}`,
            extras: { catalogo_tipo: "profissional", horarios: (medico === escopoEscala[1]) !== cenario.endsWith("escolhido_sem") || cenario.endsWith("cardiologia")
              ? [{ dia: "Terça-feira", inicio: "08:00", fim: "12:00" }] : [] } })) } };
    }
    if (nome !== "consultar_cadastro") throw new Error(`Ferramenta inesperada: ${nome}`);
    if (cenario.startsWith("catalogo_sem_escala")) return {
      ferramenta: nome, capacidade: "searchKnowledgeBase", fonte: "catalogo_publicado", success: true,
      reused: false, appointment_confirmed: false, dados: { ok: true, found: true, knowledge_status: "found", tipo_atendimento: "consulta",
        records: [{ id: "paulo", tipo: "profissional", procedimento: "Consulta Angiologia", medico: "Paulo Guilherme Nader Damasceno",
          dia: null, horario: null, extras: { catalogo_tipo: "profissional", horarios: [] } }] },
    };
    if (interpretacao || escolhaMedico || fonteCenario) {
      const { searchKnowledgeBase } = await import("../../knowledge.server");
      const parametros = argumentosFerramentas.at(-1)!.args;
      const dados = await searchKnowledgeBase({ clinicaId: "clinica-simulada", query: parametros.termo,
        tipo_atendimento: parametros.tipo_atendimento, medico: parametros.medico });
      const r = { ferramenta: nome, capacidade: "searchKnowledgeBase", fonte: "base_conhecimento",
        success: true, reused: false, dados: { ok: true, ...dados } };
      resultados.push(r);
      return r;
    }
    if (esclarecer && !cenario.endsWith("resolvido")) {
      const r = {
        ferramenta: nome,
        capacidade: "searchKnowledgeBase",
        fonte: "catalogo_publicado",
        success: true,
        reused: false,
        dados: {
          ok: true,
          knowledge_status: "not_found",
          found: false,
          records: [],
          ...(cenario.endsWith("segundo_sem_registro")
            ? {}
            : {
                esclarecimento: {
                  tipo: unificado ? "procedimento" : "sigla",
                  pergunta: perguntaEsclarecimento,
                  opcoes: unificado ? [{ id: "ecg", nome: "Eletrocardiograma" }] : [],
                },
              }),
        },
      };
      resultados.push(r);
      return r;
    }
    const r = { ferramenta: nome, capacidade: "searchKnowledgeBase", fonte: "catalogo_publicado",
      success: true, reused: false, dados: { itens: [{ id: "ecg", procedimento: "ELETROCARDIOGRAMA",
        valor: "R$ 80,00 dinheiro / R$ 95,00 cartão", medico: sfp ? "SFP" : nomeProfissional.toUpperCase(),
        dias_horarios: "Segunda a sexta, 8h às 12h", preparo: "Sem jejum", restricoes: "Levar pedido médico",
        ...(cenario === "catalogo_sfp_restricao_publicada" ? { extras: { atendimento_humano_obrigatorio: true } } : {}) }] },
    };
    resultados.push(r);
    return r;
  },
}) }));
mock.module("@/lib/nina/ai-gateway.server", () => ({ ninaAIGateway: async (req: any) => {
  ordem.push("modelo");
  requests.push(structuredClone(req));
  if (vacinaCenario) {
    const termos = cenario.endsWith("repetida") ? ["vacina da gripe", "VACINA", "gripe", "influenza"] : ["vacina da gripe"];
    const termo = req.tools ? termos[requests.length - 1] : undefined;
    return { ok: true, modelo: "modelo-simulado", execucaoId: "execucao-vacina", nivel: "low",
      conteudo: termo ? "" : "Realizamos DNA de paternidade. O cadastro não permite confirmar a vacina da gripe. Pix somente antecipado.",
      toolCalls: termo ? [
        ...(requests.length === 1 ? [{ id: "dna", type: "function", function: { name: "consultar_cadastro", arguments: JSON.stringify({ termo: "DNA paternidade", tipo_atendimento: "exame_procedimento", nova_solicitacao: true }) } }] : []),
        { id: `vacina-${requests.length}`, type: "function", function: { name: requests.length === 1 ? "consultar_cadastro" : "buscar_procedimentos", arguments: JSON.stringify({ termo, nova_solicitacao: true }) } },
      ] : [] };
  }
  if (alteracaoCenario) return { ok: true, modelo: "modelo-simulado", execucaoId: "execucao-alteracao", nivel: "low",
    conteudo: "Qual horário você prefere?", toolCalls: cenario.endsWith("modelo") ? [
      { id: "handoff", type: "function", function: { name: "solicitar_atendente_humano", arguments: JSON.stringify({ motivo: "REMARCACAO_SOLICITADA: paciente pediu mudar a consulta.", resumo: "Pedido de remarcação." }) } },
      { id: "nao-agendar", type: "function", function: { name: "agendar", arguments: "{}" } },
    ] : [] };
  if (semNomeCenario && cenario.endsWith("misto") && requests.length === 1) return {
    ok: true, modelo: "modelo-simulado", execucaoId: "misto", nivel: "low", conteudo: "",
    toolCalls: [{ id: "preco", type: "function", function: { name: "consultar_cadastro", arguments: JSON.stringify({ termo: "Eletrocardiograma", tipo_atendimento: "exame_procedimento" }) } }],
  };
  if (semNomeCenario) return { ok: true, modelo: "modelo-simulado", execucaoId: "execucao-sem-nome", nivel: "low",
    conteudo: cenario.endsWith("misto") ? "Eletrocardiograma: R$ 80,00 no dinheiro." : "Resposta administrativa.", toolCalls: cenario.includes("fallback") ? [
      { id: "pedir-nome", type: "function", function: { name: "solicitar_nome_atendimento", arguments: "{}" } },
      { id: "nao-executar", type: "function", function: { name: "proxima_vaga", arguments: "{}" } },
    ] : [] };
  if (confirmacaoPlural) return { ok: true, modelo: "modelo-simulado", execucaoId: "execucao-plural", nivel: "low", toolCalls: [],
    conteudo: "A equipe deve verificar o preparo informado. Você relatou pino na perna." };
  if (duvidaCenario) return { ok: true, modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low", toolCalls: [],
    conteudo: cenario.endsWith("entendida") ? "Entendi seu pedido." : "Pode explicar de outra forma o que você precisa?" };
  if (progressoLongo) return {
    ok: true, modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "medium",
    conteudo: requests.length > 8 ? "Encontrei horários às 10:00 nos dias consultados. Qual data você prefere?" : "",
    toolCalls: requests.length <= 8 ? [{ id: `progresso-${requests.length}`, type: "function", function: {
      name: cenario.endsWith("informativo") ? "consultar_cadastro" : "consultar_disponibilidade",
      arguments: JSON.stringify(cenario.endsWith("informativo") ? { termo: `atendimento-${requests.length}` } : { medico_id: "jorge", data: `2030-01-${10 + requests.length}` }),
    } }] : [],
  };
  if (cenario.startsWith("resposta_vazia")) return {
    ok: true, modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low", toolCalls: [],
    conteudo: requests.length > 1 && cenario === "resposta_vazia_recuperada" ? "Posso ajudar com as informações da consulta." : "",
  };
  if (continuidadeCatalogo) {
    const passos = [
      { name: "consultar_cadastro", arguments: JSON.stringify({ termo: nomeRenal, tipo_atendimento: "exame_procedimento" }) },
      { name: "buscar_procedimentos", arguments: JSON.stringify({ termo: "RINS E VIAS URINARIAS", reformula_de: nomeRenal }) },
      { name: "consultar_cadastro", arguments: JSON.stringify({ termo: "ultrassom renal", reformula_de: "RINS E VIAS URINARIAS" }) },
    ];
    return { ok: true, modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
      conteudo: requests.length <= 3 ? "" : "Identifiquei o exame escolhido: ultrassonografia de rins e vias urinárias.",
      toolCalls: requests.length <= 3 ? [{ id: `renal-${requests.length}`, type: "function", function: passos[requests.length - 1] }] : [] };
  }
  if (reformulacoes) {
    const passos = [
      { name: "consultar_cadastro", arguments: JSON.stringify({ termo: pedidoDensitometria, tipo_atendimento: "exame_procedimento" }) },
      { name: "buscar_procedimentos", arguments: JSON.stringify({ termo: "densitometria", reformula_de: pedidoDensitometria }) },
      { name: "consultar_cadastro", arguments: JSON.stringify({ termo: nomeDensitometria, tipo_atendimento: "exame_procedimento", reformula_de: "densitometria" }) },
    ];
    const toolCalls: any[] = requests.length <= 3 ? [{ id: `densito-${requests.length}`, type: "function", function: passos[requests.length - 1] }] : [];
    if (requests.length === 1 && cenario.endsWith("independente")) toolCalls.push({ id: "psiq", type: "function",
      function: { name: "consultar_cadastro", arguments: JSON.stringify({ termo: "Psiquiatria", medico: "Antonio", tipo_atendimento: "consulta", nova_solicitacao: true }) } });
    return { ok: true, modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low", toolCalls,
      conteudo: requests.length <= 3 ? "" : cenario.endsWith("independente") ? "O Dr. Antonio atende Psiquiatria às segundas, às 08:00." : "O valor é R$ 180,00. Não encontrei o exame. Qual densitometria?" };
  }
  if (perguntasMultiplas) {
    const chamada = (termo: string, medico: string, id: string) => ({ id, type: "function", function: {
      name: "consultar_cadastro", arguments: JSON.stringify({ termo, medico, tipo_atendimento: "consulta", nova_solicitacao: true }) } });
    const u = chamada("Urologia", "Adrian", "u"), ps = chamada("Psiquiatria", "Antonio", "p");
    const sequencial = cenario.endsWith("sequencial");
    const reserva = { id: "reserva", type: "function", function: { name: "agendar", arguments:
      JSON.stringify({ medico_id: "isis", procedimento: "USG ABDOMINAL TOTAL", inicio: "2030-01-21T11:00:00Z", fim: "2030-01-21T11:10:00Z" }) } };
    return { ok: true, modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
      conteudo: requests.length === 1 ? "" : "Sim, o Dr. Antonio atende Psiquiatria às segundas, às 08:00." +
        (transferenciaFicticia ? "\n\nTive uma instabilidade técnica. Vou encaminhar você agora para a equipe." : ""),
      toolCalls: requests.length === 1 ? reservaIndependente ? cenario.endsWith("primeiro") ? [reserva, u, ps]
        : cenario.endsWith("repetida") ? [u, ps, reserva, { ...reserva, id: "reserva-duplicada" }] : [u, ps, reserva]
        : cenario.endsWith("retomada") ? [ps] : sequencial ? [u] : cenario.endsWith("invertida") ? [ps, u] : cenario.endsWith("repetida") ? [u, { ...u, id: "u-repetida" }, ps] : [u, ps,
        { id: "nao-agendar", type: "function", function: { name: "agendar", arguments: "{}" } }]
        : sequencial && requests.length === 2 ? [ps] : [],
    };
  }
  if (cenario.startsWith("loop_alternativas")) return {
    ok: true, modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    conteudo: !req.tools && cenario === "loop_alternativas" ? "Não há vaga no dia pedido. Como alternativa, temos 22/01 às 14:00. Essa data serve?" : "",
    toolCalls: req.tools || cenario === "loop_alternativas_ignora" ? [{ id: `loop-${requests.length}`, type: "function", function: {
      name: !req.tools ? "agendar" : "consultar_disponibilidade", arguments: '{"medico_id":"jorge","data":"2030-01-21"}',
    } }] : [],
  };
  if (procedimentoExecutante) return { ok: true, conteudo: requests.length === 1 ? "" : "Mariana Portugal realiza Bioimpedância.",
    modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: requests.length === 1 ? [{ id: "executante", type: "function", function: { name: "buscar_medicos",
      arguments: JSON.stringify({ nome: "Mariana Portugal", especialidade: "Nutrição" }) } }] : [] };
  if (clinicoGeral) {
    const chamada = requests.length === 1 ? { name: "consultar_cadastro", arguments: JSON.stringify({ termo: "Clínica Médica", tipo_atendimento: "consulta" }) }
      : requests.length === 2 ? { name: "buscar_medicos", arguments: JSON.stringify({ nome: medicoClinico }) }
      : requests.length === 3 ? { name: "proxima_vaga", arguments: JSON.stringify({ medico_id: "medico-clinico", especialidade: "Clínica Geral" }) } : null;
    return { ok: true, conteudo: chamada ? "" : "Encontrei o atendimento de Clínico Geral e consultei a agenda.", modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
      toolCalls: chamada ? [{ id: `clinico-${requests.length}`, type: "function", function: chamada }] : [] };
  }
  if (escolhaMedico) return {
    ok: true, conteudo: confirmacaoMedico ? "Vamos continuar com Sandro Prinscewal para Clínico Geral." : "Vamos continuar com Shirley Martins.", modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: requests.length === 1 ? [
      { id: "medico", type: "function", function: { name: "consultar_cadastro", arguments: JSON.stringify({
        termo: confirmacaoMedico ? "clinico geral" : cenario.endsWith("resolvido") ? "Shirley" : "Suellen", medico: confirmacaoMedico ? "Sandro" : cenario.endsWith("resolvido") ? "Shirley" : "Suellen", tipo_atendimento: "consulta",
      }) } },
      ...(!confirmacaoMedico && !cenario.endsWith("resolvido") ? [{ id: "nao-transferir-antes-de-esclarecer", type: "function", function: { name: "solicitar_atendente_humano", arguments: '{"motivo":"Não encontrado"}' } }] : []),
    ] : [],
  };
  if (interpretacao && cenario.endsWith("_recuperacao") && requests.length === 1) return {
    ok: true, conteudo: "", modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: [
      { id: "frase-inteira", type: "function", function: { name: "consultar_cadastro", arguments: JSON.stringify({ termo: pergunta }) } },
      { id: "handoff-prematuro", type: "function", function: { name: "solicitar_atendente_humano", arguments: '{"motivo":"Não encontrado"}' } },
    ],
  };
  if (contextual) return {
    ok: true, conteudo: contextual.ferramenta ? "Opções encontradas na agenda." : "Tudo bem, esclareça sua preferência quando desejar.",
    modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: requests.length === 1 && contextual.ferramenta ? [{ id: "consulta-contextual", type: "function",
      function: { name: contextual.ferramenta, arguments: JSON.stringify(contextual.argumentos) } }] : [],
  };
  if (ausente && !["catalogo_ausente_dado_pessoal", "catalogo_ausente_generico"].includes(cenario)) return {
    ok: true, conteudo: "A clínica não oferece esse serviço.", modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: [
      ...(cenario.endsWith("misto") ? [{ id: "catalogo-encontrado", type: "function",
        function: { name: "consultar_cadastro", arguments: '{"termo":"eletrocardiograma"}' } }] : []),
      { id: "catalogo-ausente", type: "function", function: { name: ferramentaAusente, arguments: '{"termo":"pneumologia","especialidade":"pneumologia"}' } },
      { id: "nao-agendar-ausente", type: "function", function: { name: "agendar", arguments: "{}" } },
    ],
  };
  if (cenario.startsWith("catalogo_sfp_handoff_modelo") || cenario === "catalogo_sfp_recusa_agenda_modelo") return {
    ok: true, conteudo: "Boa noite! Anestesia da Videohisteroscopia: R$ 1.100,00. Nesta simulação, nenhuma transferência real foi realizada.",
    modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: [
      { id: "encaminhar-sfp", type: "function", function: {
        name: cenario.startsWith("catalogo_sfp_handoff_modelo") ? "solicitar_atendente_humano" : "consultar_disponibilidade",
        arguments: JSON.stringify({ motivo: "Profissional SFP exige atendimento humano para o procedimento de Anestesia da Videohisteroscopia", resumo: "Paciente pediu informações sobre a anestesia.", avisar_paciente: false }),
      } },
      { id: "nao-agendar-sfp", type: "function", function: { name: "agendar", arguments: "{}" } },
    ],
  };
  if (escopoEscala) return {
    ok: true, conteudo: requests.length < 3 ? "" : `Horários habituais de ${escopoEscala[1]}: terça-feira, das 08:00 às 12:00.`,
    modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: requests.length < 3 ? [{ id: `escala-${requests.length}`, type: "function", function: requests.length === 1
      ? { name: "consultar_cadastro", arguments: JSON.stringify({ termo: escopoEscala[0], tipo_atendimento: "consulta", ...(cenario.endsWith("otorrino") ? {} : { medico: escopoEscala[1] }) }) }
      : { name: "buscar_medicos", arguments: JSON.stringify({ especialidade: escopoEscala[0] }) } }] : [],
  };
  if (cenario.startsWith("catalogo_sem_escala")) return {
    ok: true, conteudo: "Vou consultar a agenda dele e oferecer outro médico.", modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: [
      { id: "catalogo", type: "function", function: { name: "consultar_cadastro", arguments: '{"termo":"angiologia","medico":"Paulo Guilherme","tipo_atendimento":"consulta"}' } },
      { id: "nao-consultar-sem-escala", type: "function", function: { name: "consultar_disponibilidade", arguments: "{}" } },
      { id: "nao-agendar-sem-escala", type: "function", function: { name: "agendar", arguments: "{}" } },
    ],
  };
  if (cenario === "catalogo_sfp_modelo") return {
    ok: true, conteudo: "Vou consultar e marcar.", modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: [
      { id: "catalogo", type: "function", function: { name: "consultar_cadastro", arguments: '{"termo":"eletrocardiograma"}' } },
      { id: "nao-agendar-sfp", type: "function", function: { name: "agendar", arguments: "{}" } },
    ],
  };
  if (modoConfirmacao) return {
    ok: true, conteudo: "Atendimento às 08:00. Chegue 15 minutos antes.", modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: [{ id: "gravar", type: "function", function: { name: "agendar", arguments: "{}" } },
      { id: "nao-repetir", type: "function", function: { name: "agendar", arguments: "{}" } }],
  };
  if (escolhaHorario) return {
    ok: true, conteudo: "Vou agendar às 08:00.", modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: [
      { id: "escolha", type: "function", function: { name: "selecionar_horario", arguments: "{}" } },
      { id: "nao-agendar-sem-novo-aceite", type: "function", function: { name: "agendar", arguments: "{}" } },
    ],
  };
  if (agenda && requests.length === 1) return {
    ok: true, conteudo: "Vou verificar.", modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: [
      { id: "consulta-agenda", type: "function", function: { name: cenario === "falha_selecao" ? "selecionar_horario" : "consultar_disponibilidade",
        arguments: '{"medico_id":"jorge","data":"2030-01-21"}' } },
      // Uma operação posterior no mesmo lote NÃO pode rodar após a transferência.
      ...(["sem_vagas", "falha_handoff", "sem_pre", "modalidade_indefinida", "falha_consulta", "falha_vinculo", "falha_selecao"].includes(cenario) ? [{ id: "nao-executar", type: "function",
        function: { name: "agendar", arguments: "{}" } }] : []),
    ],
  };
  if (!agenda && !ausente && requests.length === (cenario.endsWith("_recuperacao") ? 2 : 1))
    return {
      ok: true,
      conteudo: "",
      modelo: "modelo-simulado",
      execucaoId: "execucao-direta",
      nivel: "low",
      toolCalls: [
        {
          id: "pesquisa-interpretada",
          type: "function",
          function: {
            name: "consultar_cadastro",
            arguments: JSON.stringify({
              termo:
                (pedidoConsulta ? "cardiologia" : undefined) ?? interpretacao?.termo ??
                (unificado && cenario.includes("confirmou") ? "isso" : esclarecer && !cenario.endsWith("resolvido") ? "XYZ" : "eletrocardiograma"),
              ...(interpretacao
                ? {
                    objetivos: interpretacao.objetivos,
                    tipo_atendimento: interpretacao.tipo_atendimento,
                  }
                : {}),
              ...(cenario.endsWith("novo_pedido") ? { nova_solicitacao: true } : {}),
            }),
          },
        },
      ],
    };
  if (interpretacao)
    return {
      ok: true,
      conteudo: interpretacao.resposta,
      toolCalls: [],
      modelo: "modelo-simulado",
      execucaoId: "execucao-direta",
      nivel: "low",
    };
  return {
    ok: true,
    conteudo: respostaModelo,
    toolCalls: [],
    modelo: "modelo-simulado",
    execucaoId: "execucao-direta",
    nivel: "low",
  };
} }));
mock.module("@/lib/nina/resposta/templates.server", () => ({
  carregarTemplatesPublicados: async () => ({ textos: {}, versaoInstrucoes: null, recusadas: [] }),
}));

const { gerarRespostaNina } = await import("@/lib/whatsapp.server");
const auditoria: any = {};
const ultimaEntrada = mensagensContextuais.at(-1);
const textoFoto = ultimaEntrada && "transcricao" in ultimaEntrada ? String(ultimaEntrada.transcricao) : "";
const resposta = await gerarRespostaNina("clinica-simulada", fotoCenario ? textoFoto : procedimentoExecutante ? "Quero com Mariana Portugal" : entradaPaciente, alteracaoCenario || semNomeCenario || duvidaCenario || perguntasMultiplas || fotoCenario || contextual || esclarecer || escolhaMedico || variantePreventivo || clinicoGeral || procedimentoExecutante || fonteRetomada || pedidoCenario || linkCenario ? "55000100999" : null, {
  teste, ambiente: teste ? "homologacao" : "producao",
  ...(cenario === "escolha_sem_auditoria" ? {} : { auditoria }),
  mensagensEntrada: ["entrada-simulada"],
  ...(cenario.endsWith("obsoleto") ? { revisao: { valor: 1, telefone: "21999990000" } } : {}),
});
const { registrarEntregaSaida } = await import("@/lib/nina/entrega-saida.server");
await registrarEntregaSaida({
  clinicaId: "clinica-simulada", execucaoId: "execucao-direta", conversaId: "conversa-direta",
  outgoingMessageId: "saida-direta", representacao: "texto_completo", estado: "persistida",
  // Mesmo um chamador legado não pode associar nota ao novo fluxo.
  decisaoId: "decisao-antiga", textoHash: "hash-direto",
});
console.log("DIRETA_RESULTADO=" + JSON.stringify({
  resposta, respostaModelo, resumoEscolhido, prompt, pergunta, motorChamado, rede, requests, ferramentas, consultas, ordem, argumentosFerramentas, estadoPerguntas,
  temNota: auditoria.decisaoId != null, gravacoes,
  encaminhamentos, resultados, conferencias, decisoesEntendimento,
  etapas: gravacoes.find(g => g.tabela === "nina_execucao_evidencias")?.valor.etapas ?? [],
  finalizacao: auditoria.finalizacao,
  resultado: auditoria.resultado,
}));
