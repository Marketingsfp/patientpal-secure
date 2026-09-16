/**
 * Executa o console REAL em um subprocesso isolado. Somente banco, modelo,
 * transporte, áudio e serviços externos são simulados; não copia a lógica de
 * processarMensagemTeste. O isolamento impede que mock.module afete outra suíte.
 */
import { mock } from "bun:test";
import { criarResultadoSemNovaMensagem } from "@/lib/nina/resposta/contrato";
import { hashDoTexto } from "@/lib/nina/confidence/hash";

type Linha = Record<string, any>;
const cenario = process.argv[2];
const paridade = cenario === "paridade-cardiologia";
const entradasGerador: Linha[] = [];
const encaminhada = cenario.startsWith("handoff-");
const AVISO = "Nesta simulação, o atendimento precisaria de uma pessoa da equipe. Protocolo MJ-53.";
const RESPOSTA = paridade
  ? "Temos Cardiologia. A consulta custa R$ 120,00 no dinheiro e R$ 145,00 no cartão."
  : "Olá! Como posso ajudar?";
const lead: Linha = {
  id: "lead-mj53",
  indice: 1,
  nome: "Lead Teste 01",
  telefone_base: "55000100000",
  telefone_sessao: "55000100001",
  sessao_seq: 1,
  conversa_id: "conversa-mj53",
  ciclo_id: "ciclo-mj53",
  ciclo_iniciado_em: "2026-09-13T16:20:00Z",
  resolvido_em: null,
  status: "ativa",
  clinica_id: paridade ? "clinica" : "clinica-teste",
};
const bd: Record<string, Linha[]> = {
  nina_teste_leads: [{ ...lead }],
  atend_conversas: [
    {
      id: lead.conversa_id,
      clinica_id: lead.clinica_id,
      is_teste: true,
      contato_telefone: lead.telefone_sessao,
    },
  ],
  nina_message_batches: [],
  whatsapp_mensagens: [],
  nina_teste_simulacoes: [],
};
let sequencia = 0;
let chamadasRede = 0;
let chamadasModelo = 0;
let chamadasFinalizacao = 0;
let chamadasAudio = 0;
let reservaPerdidaDepois = false;
const entregas: Linha[] = [];
const rastreios: Linha[] = [];
const encerramentos: unknown[][] = [];

// Qualquer dependência nova que tente sair do isolamento faz o teste falhar.
function bloquearRede(): never {
  chamadasRede++;
  throw new Error("Rede proibida no teste MJ-53");
}
globalThis.fetch = Object.assign(async () => bloquearRede(), { preconnect: bloquearRede });

function consulta(tabela: string) {
  if (!(tabela in bd)) throw new Error(`Tabela não simulada: ${tabela}`);
  const filtros: Array<(linha: Linha) => boolean> = [];
  let insercao: Linha | null = null;
  let atualizacao: Linha | null = null;
  let singular = false;
  let executada = false;
  let retorno: { data: Linha | Linha[] | null; error: null; count: number };
  const executar = () => {
    if (executada) return retorno;
    executada = true;
    let linhas: Linha[];
    if (insercao) {
      const nova = { id: `mensagem-${++sequencia}`, ...insercao };
      bd[tabela].push(nova);
      linhas = [nova];
    } else {
      linhas = bd[tabela].filter((linha) => filtros.every((f) => f(linha)));
      if (atualizacao) linhas.forEach((linha) => Object.assign(linha, atualizacao));
    }
    retorno = { data: singular ? (linhas[0] ?? null) : linhas, error: null, count: linhas.length };
    return retorno;
  };
  const api: any = {
    select: () => api,
    insert: (linha: Linha) => ((insercao = linha), api),
    update: (linha: Linha) => ((atualizacao = linha), api),
    eq: (campo: string, valor: unknown) => (filtros.push((linha) => linha[campo] === valor), api),
    is: (campo: string, valor: unknown) => (
      filtros.push((linha) => (linha[campo] ?? null) === valor),
      api
    ),
    in: (campo: string, valores: unknown[]) => (
      filtros.push((linha) => valores.includes(linha[campo])),
      api
    ),
    like: (campo: string, valor: string) => (
      filtros.push((linha) => String(linha[campo]).startsWith(valor.replace(/%$/, ""))),
      api
    ),
    limit: () => api,
    order: () => api,
    maybeSingle: () => ((singular = true), Promise.resolve(executar())),
    then: (resolver: (resultado: ReturnType<typeof executar>) => unknown) =>
      Promise.resolve(executar()).then(resolver),
  };
  return api;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: consulta,
    rpc: (nome: string) => {
      if (nome === "nina_revisao_registrar_entrada")
        return Promise.resolve({ data: 1, error: null });
      throw new Error("RPC não simulada");
    },
  },
}));
mock.module("@/lib/nina-desligada.server", () => ({ ninaDesativadaNaClinica: async () => false }));
mock.module("@/lib/nina/revisao-conversa.server", () => ({
  incrementarRevisaoConversa: async () => 1,
  respostaObsoleta: async () => cenario === "handoff-obsoleto",
}));
mock.module("@/lib/atendimento/handoff.server", () => ({
  estadoConversaPorId: async () => ({ status: "aberta", owner_type: "nina" }),
  ninaPodeResponder: () => true,
}));
mock.module("@/lib/whatsapp-midia.server", () => ({
  RESPOSTA_AUDIO_FALHOU: "Não consegui ouvir esse áudio.",
  respostaMidiaNaoSuportada: () => "Envie uma mensagem de texto.",
}));
mock.module("@/lib/nina/burst.server", () => ({
  validarReservaTurnoNina: async () =>
    !["reserva-perdida", "reserva-perdida-core"].includes(cenario) && !reservaPerdidaDepois,
  aguardarTurnoNina: async (entrada: Linha) => ({
    batchId: "lote-mj53",
    lock: { token: "trava-mj53" },
    revisao: 1,
    mensagens: [entrada.mensagemId],
    texto: entrada.textoAtual,
  }),
  concluirTurnoNina: async (...args: unknown[]) => {
    encerramentos.push(args);
  },
}));
mock.module("@/lib/whatsapp.server", () => ({
  gerarRespostaNina: async (_clinica: string, _texto: string, _telefone: string, opcoes: Linha) => {
    chamadasModelo++;
    entradasGerador.push({
      clinicaId: _clinica,
      texto: _texto,
      telefone: _telefone,
      opcoes: { ...opcoes, auditoria: undefined, validarReservaTurno: undefined },
      temAuditoria: Boolean(opcoes.auditoria),
      temGuardaReserva: typeof opcoes.validarReservaTurno === "function",
    });
    Object.assign(opcoes.auditoria, { execucaoId: "execucao-mj53", traceId: "turno-mj53" });
    if (cenario === "reserva-perdida-core") {
      if (await opcoes.validarReservaTurno()) throw new Error("Reserva deveria estar perdida");
      const { ErroReservaTurnoPerdida } = await import("@/lib/nina/reserva-turno");
      throw new ErroReservaTurnoPerdida();
    }
    if (cenario === "erro-real") throw new Error("Falha simulada do provedor");
    if (encaminhada) {
      // Representa o aviso que o serviço de protocolo já persistiu antes de retornar.
      const pendente = cenario === "handoff-pendente";
      if (!pendente) {
        bd.whatsapp_mensagens.push({
          id: "aviso-mj53",
          clinica_id: lead.clinica_id,
          conversa_id: lead.conversa_id,
          direction: "out",
          body: AVISO,
          execucao_id: "execucao-mj53",
          enviada_por: "nina",
          is_teste: true,
        });
      }
      opcoes.auditoria.resultado = criarResultadoSemNovaMensagem({
        estado: pendente ? "envio_pendente" : "confirmado",
        chaveOperacao: "operacao-mj53",
        mensagemId: pendente ? null : "aviso-mj53",
        protocolo: "MJ-53",
        texto: AVISO,
      });
      if (cenario === "handoff-reset") {
        // O operador reiniciou o teste enquanto o gerador ainda estava em execução.
        bd.nina_teste_leads[0] = { ...lead, conversa_id: "conversa-nova", ciclo_id: "ciclo-novo" };
      }
      return "";
    }
    if (cenario === "vazio-real") return "";
    opcoes.auditoria.textoFinalHash = hashDoTexto(RESPOSTA);
    opcoes.auditoria.decisaoId = "avaliacao-resposta";
    return RESPOSTA;
  },
}));
mock.module("@/lib/nina/resposta/finalizacao.server", () => ({
  finalizarResposta: async (entrada: Linha) => {
    chamadasFinalizacao++;
    if (cenario === "reserva-perdida-finalizacao") reservaPerdidaDepois = true;
    return entrada.resultado;
  },
}));
mock.module("@/lib/nina-audio.server", () => ({
  respostaAudioDesativada: async () => false,
  prepararParaFala: (texto: string) => texto,
  pareceLista: () => false,
  resumoFalado: (texto: string) => texto,
  LIMITE_FALA_CURTA: 500,
  sintetizarFala: async () => {
    chamadasAudio++;
    if (cenario === "reserva-perdida-tts") reservaPerdidaDepois = true;
    return { bytes: new Uint8Array([1, 2]), mime: "audio/ogg" };
  },
}));
mock.module("@/lib/nina/entrega-saida.server", () => ({
  registrarEntregaSaida: async (entrada: Linha) => {
    entregas.push(entrada);
  },
}));
mock.module("@/lib/nina/rastreio/turno.server", () => ({
  gravarEntregaDoTurno: async (entrada: Linha) => {
    rastreios.push(entrada);
  },
}));

const { processarMensagemTeste } = await import("@/lib/nina/teste-console.server");
const resultado = await processarMensagemTeste(
  {
    clinicaId: lead.clinica_id,
    leadId: lead.id,
    tipo: ["handoff-audio", "reserva-perdida-tts"].includes(cenario) ? "audio" : "text",
    texto: paridade ? "Vocês tem cardiologista?" : "vcs tem cardiologista?",
    chave: "entrada-mj53",
  },
  "operador-teste",
);

console.log(
  "MJ53_RESULTADO=" +
    JSON.stringify({
      resultado,
      saidas: bd.whatsapp_mensagens.filter((linha) => linha.direction === "out"),
      entradas: bd.whatsapp_mensagens.filter((linha) => linha.direction === "in"),
      chamadasModelo,
      chamadasFinalizacao,
      chamadasAudio,
      chamadasRede,
      encerramentos,
      entregas,
      rastreios,
      entradasGerador,
    }),
);
