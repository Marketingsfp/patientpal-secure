/** Núcleo real; apenas banco, modelo e catálogo externos são simulados. */
import { mock } from "bun:test";
import { textoDaChave } from "../../resposta/templates";
import { CONTINUIDADE_CONSULTA_AGENDA } from "../../prompt/consulta-agenda";
import { estadoVazio } from "../../fluxo-estado-normalizar";
import { selecionarVagaValidada } from "../../agendamento-escolha";
import { cenariosContextuais } from "./consulta-contextual-cenarios";
import { recusarFraseComoPesquisa } from "../../catalogo-pesquisa";

process.env.LOVABLE_API_KEY = "chave-ficticia-sem-rede";
const teste = process.argv[2] === "homologacao";
const cenario = process.argv[3] ?? "direta";
const contextual = cenariosContextuais[cenario];
const regraCatalogo = cenario.startsWith("catalogo_");
const sfp = cenario.startsWith("catalogo_sfp");
const ausente = cenario.startsWith("catalogo_ausente");
const esclarecer = cenario.startsWith("catalogo_esclarecimento");
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
  nina_cat_profissionais: ["Sandro", "Antonio", "Rosângela", "Alex"].map((nome, i) => ({
    id: `medico-${i}`, clinica_id: "clinica-simulada", status: "PUBLICADO", nome,
    especialidades: [{ nome: "CARDIOLOGIA" }], formas_pagamento: [], horarios: [], convenios: [],
  })),
  nina_cat_servicos: ["MAPA 24H", "ECOCARDIOGRAMA", "ELETROCARDIOGRAMA", "HOLTER 24H", "TESTE ERGOMETRICO", "NEBULIZAÇÃO", "ULTRASSONOGRAFIA ABDOME TOTAL SEM DOPPLER", "ULTRASSONOGRAFIA ABDOME SUPERIOR COM DOPPLER"].map((nome, i) => ({
    id: `servico-${i}`, clinica_id: "clinica-simulada", status: "PUBLICADO", nome,
    descricao_publica: i < 5 ? "Exame de cardiologia" : "Atendimento por ordem de chegada",
    executantes: [], formas_pagamento: [], valor: null,
  })),
};
if (interpretacao?.publicado === "ODONTOLOGIA") catalogoInterpretado.nina_cat_profissionais = ["Jean Ferreira", "Raiani", "Karen"].map((nome, i) => ({
  id: `medico-${i}`, clinica_id: "clinica-simulada", status: "PUBLICADO", nome,
  especialidades: [{ nome: "ODONTOLOGIA" }], tipo_atendimento: "Avaliação odontológica",
  formas_pagamento: [], horarios: [], convenios: [],
}));
if (variantePreventivo) catalogoInterpretado.nina_cat_profissionais = ["Conceição Martins", "Marcilio Quintão"].map((nome, i) => ({
  id: `medico-${i}`, clinica_id: "clinica-simulada", status: "PUBLICADO", nome, especialidades: [{ nome: "GINECOLOGIA" }],
  observacao_publica: `${i === 0 ? "CONSULTA + PREVENTIVO" : "CONSULTA GINECOLOGIA"}\nEspecialidade: GINECOLOGIA\nDinheiro: R$ ${i === 0 ? "172" : "120"},00\nObservação: Agendado`,
  formas_pagamento: [], horarios: [], convenios: [],
}));
if (escolhaMedico) catalogoInterpretado.nina_cat_profissionais = ["Shirley Martins", "Raisa Moura"].map((nome, i) => ({
  id: `medico-${i}`, clinica_id: "clinica-simulada", status: "PUBLICADO", nome,
  especialidades: [{ nome: "DERMATOLOGIA" }], formas_pagamento: [], horarios: [], convenios: [],
}));
if (confirmacaoMedico) catalogoInterpretado.nina_cat_profissionais = [{
  id: "medico-0", clinica_id: "clinica-simulada", status: "PUBLICADO", nome: "Sandro Prinscewal",
  especialidades: [{ nome: "CARDIOLOGIA" }, { nome: "CLINICO GERAL" }], formas_pagamento: [], horarios: [], convenios: [],
}];
const perguntaEsclarecimento = "Pode informar o nome do procedimento por extenso?";
const ferramentaAusente = cenario.includes("medicos_modelo") ? "buscar_medicos"
  : cenario.includes("procedimentos_modelo") ? "buscar_procedimentos"
  : cenario.includes("especialidades_modelo") ? "listar_especialidades" : "consultar_base_conhecimento";
const escolhaHorario = cenario.startsWith("escolha_");
const modoConfirmacao = cenario.startsWith("confirmado_") ? cenario.slice("confirmado_".length) : null;
const resumoEscolhido = ["escolha_pre", "escolha_ficha"].includes(cenario)
  ? textoDaChave(cenario === "escolha_pre" ? "fluxo.agendamento.revisar_pre_agendamento" : "fluxo.agendamento.revisar_ficha",
    { profissional: "Dr. Jorge Ribeiro", procedimento: "Consulta", data: "21/01/2030", horario: "10:20", unidade: "Clínica simulada" }).texto
  : "Confira: Consulta Cardiologia com Dr. Jorge Ribeiro, dia 21/01/2030, às 10:20. Você confirma?";
const agenda = cenario !== "direta" && !regraCatalogo;
const pergunta = confirmacaoMedico ? process.argv[4] ?? "Isso" : escolhaMedico ? cenario.endsWith("resolvido") ? "Quero a Shirley" : "quero a Suellen" : interpretacao ? interpretacao.mensagem : esclarecer ? cenario.endsWith("primeiro") ? "Quero exame XYZ" : cenario.endsWith("resolvido") ? "Eletrocardiograma" : "Não sei explicar" : contextual ? contextual.pergunta : (sfp && cenario.endsWith("modelo")) || (ausente && cenario.includes("modelo")) ? "oi"
  : ausente ? cenario.endsWith("dado_pessoal") ? "Meu nome é João Silva"
    : cenario.endsWith("misto") ? "Qual o valor do eletrocardiograma e da consulta de pneumologia?"
    : cenario.endsWith("generico") ? "Quero marcar uma consulta"
    : cenario.endsWith("exame") ? "Quanto custa o exame PET-CT?"
    : cenario.endsWith("procedimento") ? "Vocês fazem o procedimento crioablação?"
    : "Gostaria de marca a pneumologista"
  : agenda ? "Tem vagas com Dr. Jorge Ribeiro?" : "quais são as informações do eletrocardiograma?";
const nomeProfissional = cenario === "catalogo_enfermagem" ? "Enfermagem"
  : cenario === "catalogo_equipe_enfermagem" ? "Equipe de Enfermagem"
  : regraCatalogo ? "Técnica" : "Dra. Ana Souza";
const respostaModelo = "Eletrocardiograma: R$ 80,00 no dinheiro e R$ 95,00 no cartão. Profissional: " + nomeProfissional + ". Segunda a sexta, das 8h às 12h. Sem jejum. Leve o pedido médico.";
const prompt = "Você é Nina. Consulte a base e informe preço, profissional, horário e preparo solicitados. Não acrescente saudação à resposta sobre exames."
  + (contextual ? `\n\n${CONTINUIDADE_CONSULTA_AGENDA}` : "");
const agora = Date.now();
const estadoContextual = { ...estadoVazio(), session_id: "sessao-contextual",
  session_started_at: new Date(agora - 30 * 60_000).toISOString(),
  updated_at: new Date(agora).toISOString(),
};
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
const registroMensagem = (body: string, indice: number, direction = "out", status = "sent") => ({
  id: `historico-${indice}`, conversa_id: "conversa-contextual", direction, body, status,
  created_at: new Date(agora - (20 - indice) * 60_000).toISOString(), is_teste: teste,
});
if (confirmacaoMedico) estadoContextual.knowledge_context = {
  versao: 1, clinicaId: "clinica-simulada", sessionId: "sessao-contextual",
  consulta: { termo: "clinica medica", tipo_atendimento: "consulta" },
  referencias: [{ registro: "medico-0", versao: null, procedimento: null, medicoNome: "Sandro Prinscewal" }],
  esclarecimentoTentativas: cenario.endsWith("segunda") ? 2 : 1,
  esclarecimento: { tipo: "profissional", pergunta: perguntaMedico,
    opcoes: [{ id: "medico-0", nome: "Sandro Prinscewal", especialidade: "CARDIOLOGIA, CLINICO GERAL" }] },
};
const mensagensContextuais = confirmacaoMedico ? [
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
        order: () => q, limit: (n: number) => { limiteCatalogo = n; return q; }, gte: () => q, is: () => q,
        maybeSingle: () => { unica = true; return q; },
        insert: (valor: any) => { gravacoes.push({ tabela, valor }); return q; },
        upsert: (valor: any) => { gravacoes.push({ tabela, valor }); return q; },
        update: (valor: any) => { gravacoes.push({ tabela, valor }); return q; },
        then: (resolve: any) => Promise.resolve(resolve({
          data: (interpretacao || escolhaMedico) && catalogoInterpretado[tabela] ? catalogoInterpretado[tabela]!.filter(l => filtrosCatalogo.every(f => f(l))).slice(0, limiteCatalogo)
            : tabela === "clinicas" ? { nome: "Clínica simulada", base_importada: false }
            : (contextual || esclarecer || escolhaMedico || variantePreventivo) && tabela === "atend_conversas" ? { id: "conversa-contextual", nina_fluxo_estado: estadoContextual }
            : (contextual || confirmacaoMedico) && tabela === "whatsapp_mensagens" ? mensagensContextuais
            : unica ? null : [], error: null,
          count: (contextual || confirmacaoMedico) && tabela === "whatsapp_mensagens" ? mensagensContextuais.length : 0,
        })),
      };
      return q;
    },
    rpc: async () => ({ data: [], error: null }),
  },
}));
mock.module("@/lib/nina/agenda-flag.server", () => ({ ferramentasAgendaAtivas: async () => escolhaHorario }));
mock.module("@/lib/nina/atendimento-fase1.server", () => ({ flagFluxoFase1Ativa: async () => false }));
mock.module("@/lib/nina/atendimento-fase3.server", () => ({ flagFluxoFase3Ativa: async () => false }));
mock.module("@/lib/nina/atendimento-fase6.server", () => ({ flagFluxoFase6Ativa: async () => false }));
mock.module("@/lib/nina/aprendizado.server", () => ({ recuperarAprendizados: async () => [] }));
mock.module("@/lib/nina/instrucoes-runtime.server", () => ({ promptInstrucoes: async () => ({
  texto: prompt, template: prompt, origem: "publicada", versao: 42,
  versaoId: "prompt-42", publicadoEm: "2026-09-16T12:00:00Z", fallbackPorErro: false,
}) }));
mock.module("@/lib/nina/catalogo-prompt.server", () => ({ contarCatalogoPublicado: async () => ({ servicos: 1, profissionais: 1 }) }));
mock.module("@/lib/nina/paciente-tools.server", () => ({
  FERRAMENTAS_NINA_CONSULTA: ["consultar_base_conhecimento", "consultar_disponibilidade", "verificar_horario", "proxima_vaga", "consultar_primeiro_disponivel"]
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
    if (nome === "solicitar_atendente_humano" && (agenda || regraCatalogo)) {
      encaminhamentos.push(typeof args === "string" ? JSON.parse(args) : args);
      return { ferramenta: nome, capacidade: "requestHumanHandoff", fonte: "atendimento",
        success: !cenario.endsWith("falha_handoff"), reused: false, appointment_confirmed: false,
        dados: { ok: !cenario.endsWith("falha_handoff"), sem_mensagem_paciente: sfp && !cenario.endsWith("falha_handoff") },
        ...(cenario.endsWith("falha_handoff") ? { erro: "INTERNAL_ERROR" } : {}) };
    }
    if (nome === "consultar_disponibilidade" && cenario === "catalogo_sfp_recusa_agenda_modelo") return {
      ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda", success: false,
      reused: false, appointment_confirmed: false, erro: "PROFISSIONAL_SFP",
      dados: { ok: false, erro: "PROFISSIONAL_SFP", atendimento_humano_obrigatorio: true },
    };
    if (nome === "agendar" && modoConfirmacao) return {
      ferramenta: nome, capacidade: "createAppointment", fonte: "agenda", success: true,
      reused: false, appointment_confirmed: true, dados: {
        ok: true, verificado_no_banco: true, appointment_id: "ag-simulada", modalidade_atendimento: modoConfirmacao,
        date: "21/01/2030", time: "10:20", medico: "Dr. Jorge Ribeiro", ficha_numero: "007",
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
    if (nome === "consultar_disponibilidade" && agenda) {
      return { ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda",
        success: cenario !== "falha_consulta", reused: false, appointment_confirmed: false,
        dados: cenario === "falha_consulta" ? { ok: false, erro: "INTERNAL_ERROR", codigo: "AGENDA_QUERY_FAILED" }
          : { ok: true, reason: "AGENDA_CHEIA", horarios: [],
            proximos: cenario === "alternativas" ? [{ data: "2030-01-22", hora: "14:00" }] : [] },
        ...(cenario === "falha_consulta" ? { erro: "INTERNAL_ERROR" } : {}) };
    }
    if (ausente && nome === ferramentaAusente && !(cenario.endsWith("misto") && argumentosFerramentas.at(-1)?.args.termo === "eletrocardiograma")) {
      const tipada = nome !== "consultar_base_conhecimento";
      const r = { ferramenta: nome, capacidade: tipada ? "listCatalog" : "searchKnowledgeBase", fonte: "base_conhecimento",
        success: !tipada, reused: false, appointment_confirmed: false,
        ...(tipada ? { erro: nome === "buscar_medicos" ? "DOCTOR_NOT_FOUND" : "PROCEDURE_NOT_FOUND" } : {}),
        dados: { ok: !tipada, source: "nina_catalogo", fonte: "catalogo_publicado", encaminhar_para_humano: true,
          found: false, knowledge_status: "not_found", records: [] },
      };
      resultados.push(r);
      return r;
    }
    if (nome !== "consultar_base_conhecimento") throw new Error(`Ferramenta inesperada: ${nome}`);
    if (interpretacao || escolhaMedico) {
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
                  tipo: "sigla",
                  pergunta: perguntaEsclarecimento,
                  opcoes: [],
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
        dias_horarios: "Segunda a sexta, 8h às 12h", preparo: "Sem jejum", restricoes: "Levar pedido médico" }] },
    };
    resultados.push(r);
    return r;
  },
}) }));
mock.module("@/lib/nina/ai-gateway.server", () => ({ ninaAIGateway: async (req: any) => {
  ordem.push("modelo");
  requests.push(structuredClone(req));
  if (escolhaMedico) return {
    ok: true, conteudo: confirmacaoMedico ? "Vamos continuar com Sandro Prinscewal para Clínico Geral." : "Vamos continuar com Shirley Martins.", modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: requests.length === 1 ? [
      { id: "medico", type: "function", function: { name: "consultar_base_conhecimento", arguments: JSON.stringify({
        termo: confirmacaoMedico ? "clinica medica" : cenario.endsWith("resolvido") ? "Shirley" : "Suellen", medico: confirmacaoMedico ? "Sandro" : cenario.endsWith("resolvido") ? "Shirley" : "Suellen", tipo_atendimento: "consulta",
      }) } },
      ...(!confirmacaoMedico && !cenario.endsWith("resolvido") ? [{ id: "nao-transferir-antes-de-esclarecer", type: "function", function: { name: "solicitar_atendente_humano", arguments: '{"motivo":"Não encontrado"}' } }] : []),
    ] : [],
  };
  if (interpretacao && cenario.endsWith("_recuperacao") && requests.length === 1) return {
    ok: true, conteudo: "", modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: [
      { id: "frase-inteira", type: "function", function: { name: "consultar_base_conhecimento", arguments: JSON.stringify({ termo: pergunta }) } },
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
        function: { name: "consultar_base_conhecimento", arguments: '{"termo":"eletrocardiograma"}' } }] : []),
      { id: "catalogo-ausente", type: "function", function: { name: ferramentaAusente, arguments: '{"termo":"pneumologia","especialidade":"pneumologia"}' } },
      { id: "nao-agendar-ausente", type: "function", function: { name: "agendar", arguments: "{}" } },
    ],
  };
  if (cenario === "catalogo_sfp_handoff_modelo" || cenario === "catalogo_sfp_recusa_agenda_modelo") return {
    ok: true, conteudo: "Boa noite! Anestesia da Videohisteroscopia: R$ 1.100,00. Nesta simulação, nenhuma transferência real foi realizada.",
    modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: [
      { id: "encaminhar-sfp", type: "function", function: {
        name: cenario === "catalogo_sfp_handoff_modelo" ? "solicitar_atendente_humano" : "consultar_disponibilidade",
        arguments: JSON.stringify({ motivo: "Profissional SFP exige atendimento humano para o procedimento de Anestesia da Videohisteroscopia", resumo: "Paciente pediu informações sobre a anestesia." }),
      } },
      { id: "nao-agendar-sfp", type: "function", function: { name: "agendar", arguments: "{}" } },
    ],
  };
  if (cenario === "catalogo_sfp_modelo") return {
    ok: true, conteudo: "Vou consultar e marcar.", modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low",
    toolCalls: [
      { id: "catalogo", type: "function", function: { name: "consultar_base_conhecimento", arguments: '{"termo":"eletrocardiograma"}' } },
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
            name: "consultar_base_conhecimento",
            arguments: JSON.stringify({
              termo:
                interpretacao?.termo ??
                (esclarecer && !cenario.endsWith("resolvido") ? "XYZ" : "eletrocardiograma"),
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
const resposta = await gerarRespostaNina("clinica-simulada", pergunta, contextual || esclarecer || escolhaMedico || variantePreventivo ? "55000100999" : null, {
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
  resposta, respostaModelo, resumoEscolhido, prompt, pergunta, motorChamado, rede, requests, ferramentas, consultas, ordem, argumentosFerramentas,
  temNota: auditoria.decisaoId != null, gravacoes,
  encaminhamentos, resultados,
  etapas: gravacoes.find(g => g.tabela === "nina_execucao_evidencias")?.valor.etapas ?? [],
  finalizacao: auditoria.finalizacao,
  resultado: auditoria.resultado,
}));
