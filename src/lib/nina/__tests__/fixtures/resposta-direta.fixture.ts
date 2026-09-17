/** Núcleo real; apenas banco, modelo e catálogo externos são simulados. */
import { mock } from "bun:test";

process.env.LOVABLE_API_KEY = "chave-ficticia-sem-rede";
const teste = process.argv[2] === "homologacao";
const cenario = process.argv[3] ?? "direta";
const escolhaHorario = cenario.startsWith("escolha_");
const resumoEscolhido = "Confira: Consulta Cardiologia com Dr. Jorge Ribeiro, dia 21/01/2030, às 10:20. Você confirma?";
const agenda = cenario !== "direta";
const pergunta = agenda ? "Tem vagas com Dr. Jorge Ribeiro?" : "quais são as informações do eletrocardiograma?";
const respostaModelo = "Eletrocardiograma: R$ 80,00 no dinheiro e R$ 95,00 no cartão. Profissional: Enfermagem. Segunda a sexta, das 8h às 12h. Sem jejum. Leve o pedido médico.";
const prompt = "Você é Nina. Consulte a base e informe preço, profissional, horário e preparo solicitados. Não acrescente saudação à resposta sobre exames.";
const consultas: string[] = [];
const gravacoes: Array<{ tabela: string; valor: any }> = [];
const requests: any[] = [];
const ferramentas: string[] = [];
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
      const q: any = {
        select: () => q, eq: () => q, in: () => q, neq: () => q, or: () => q,
        order: () => q, limit: () => q, gte: () => q, is: () => q,
        maybeSingle: () => { unica = true; return q; },
        insert: (valor: any) => { gravacoes.push({ tabela, valor }); return q; },
        upsert: (valor: any) => { gravacoes.push({ tabela, valor }); return q; },
        update: (valor: any) => { gravacoes.push({ tabela, valor }); return q; },
        then: (resolve: any) => Promise.resolve(resolve({
          data: tabela === "clinicas" ? { nome: "Clínica simulada", base_importada: false }
            : unica ? null : [], error: null, count: 0,
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
  FERRAMENTAS_NINA_CONSULTA: [{ type: "function", function: { name: "consultar_base_conhecimento" } }],
  FERRAMENTAS_NINA_PACIENTE: [{ type: "function", function: { name: "selecionar_horario" } }],
  executarFerramentaPaciente: async () => { throw new Error("Usar broker simulado"); },
}));
mock.module("@/lib/nina/handoff-tool.server", () => ({
  FERRAMENTA_HANDOFF: { type: "function", function: { name: "solicitar_atendente_humano" } },
}));
mock.module("@/lib/nina/revisao-conversa.server", () => ({
  respostaObsoleta: async () => cenario === "obsoleto",
}));
const resultados: any[] = [];
mock.module("@/lib/nina/tool-broker.server", () => ({ criarToolBroker: () => ({
  resultados: () => resultados,
  executar: async (nome: string, args: unknown) => {
    ferramentas.push(nome);
    if (nome === "selecionar_horario" && escolhaHorario) return {
      ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda", success: true,
      reused: false, appointment_confirmed: false, dados: { ok: true, resumo_confirmacao: resumoEscolhido },
    };
    if (nome === "solicitar_atendente_humano" && agenda) {
      encaminhamentos.push(typeof args === "string" ? JSON.parse(args) : args);
      return { ferramenta: nome, capacidade: "requestHumanHandoff", fonte: "atendimento",
        success: cenario !== "falha_handoff", reused: false, appointment_confirmed: false,
        dados: { ok: cenario !== "falha_handoff" },
        ...(cenario === "falha_handoff" ? { erro: "INTERNAL_ERROR" } : {}) };
    }
    if (nome === "consultar_disponibilidade" && agenda) {
      return { ferramenta: nome, capacidade: "checkAvailability", fonte: "agenda",
        success: cenario !== "falha_consulta", reused: false, appointment_confirmed: false,
        dados: cenario === "falha_consulta" ? { ok: false, erro: "INTERNAL_ERROR", codigo: "AGENDA_QUERY_FAILED" }
          : { ok: true, reason: "AGENDA_CHEIA", horarios: [],
            proximos: cenario === "alternativas" ? [{ data: "2030-01-22", hora: "14:00" }] : [] },
        ...(cenario === "falha_consulta" ? { erro: "INTERNAL_ERROR" } : {}) };
    }
    if (nome !== "consultar_base_conhecimento") throw new Error(`Ferramenta inesperada: ${nome}`);
    const r = { ferramenta: nome, capacidade: "searchKnowledgeBase", fonte: "catalogo_publicado",
      success: true, reused: false, dados: { itens: [{ id: "ecg", procedimento: "ELETROCARDIOGRAMA",
        valor: "R$ 80,00 dinheiro / R$ 95,00 cartão", medico: "Enfermagem",
        dias_horarios: "Segunda a sexta, 8h às 12h", preparo: "Sem jejum", restricoes: "Levar pedido médico" }] },
    };
    resultados.push(r);
    return r;
  },
}) }));
mock.module("@/lib/nina/ai-gateway.server", () => ({ ninaAIGateway: async (req: any) => {
  requests.push(structuredClone(req));
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
      { id: "consulta-agenda", type: "function", function: { name: "consultar_disponibilidade",
        arguments: '{"medico_id":"jorge","data":"2030-01-21"}' } },
      // Uma operação posterior no mesmo lote NÃO pode rodar após a transferência.
      ...(cenario === "sem_vagas" || cenario === "falha_handoff" ? [{ id: "nao-executar", type: "function",
        function: { name: "agendar", arguments: "{}" } }] : []),
    ],
  };
  return { ok: true, conteudo: respostaModelo, toolCalls: [], modelo: "modelo-simulado", execucaoId: "execucao-direta", nivel: "low" };
} }));
mock.module("@/lib/nina/resposta/templates.server", () => ({
  carregarTemplatesPublicados: async () => ({ textos: {}, versaoInstrucoes: null, recusadas: [] }),
}));

const { gerarRespostaNina } = await import("@/lib/whatsapp.server");
const auditoria: any = {};
const resposta = await gerarRespostaNina("clinica-simulada", pergunta, null, {
  teste, ambiente: teste ? "homologacao" : "producao",
  ...(cenario === "escolha_sem_auditoria" ? {} : { auditoria }),
  mensagensEntrada: ["entrada-simulada"],
  ...(cenario === "obsoleto" ? { revisao: { valor: 1, telefone: "21999990000" } } : {}),
});
const { registrarEntregaSaida } = await import("@/lib/nina/entrega-saida.server");
await registrarEntregaSaida({
  clinicaId: "clinica-simulada", execucaoId: "execucao-direta", conversaId: "conversa-direta",
  outgoingMessageId: "saida-direta", representacao: "texto_completo", estado: "persistida",
  // Mesmo um chamador legado não pode associar nota ao novo fluxo.
  decisaoId: "decisao-antiga", textoHash: "hash-direto",
});
console.log("DIRETA_RESULTADO=" + JSON.stringify({
  resposta, respostaModelo, resumoEscolhido, prompt, motorChamado, rede, requests, ferramentas, consultas,
  temNota: auditoria.decisaoId != null, gravacoes,
  encaminhamentos,
  etapas: gravacoes.find(g => g.tabela === "nina_execucao_evidencias")?.valor.etapas ?? [],
  finalizacao: auditoria.finalizacao,
}));
