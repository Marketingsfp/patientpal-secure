import { beforeEach, expect, it, mock } from "bun:test";

// Processador, registro e handoff reais; somente armazenamento/transporte simulados.
type Linha = Record<string, any>;
let tabelas: Record<string, Linha[]>;
let antesDeGravar: ((patch: Linha) => void) | null;
let falharTransferencia: boolean, online: boolean;
let atribuicoes: number, avisos: number;
let resumos: Linha[];
const inicio = "2026-09-16T14:00:00.000Z",
  prazo = "2026-09-16T14:30:00.000Z";
const tempo = (minutos: number) => new Date(Date.parse(inicio) + minutos * 60_000);
const conv = () => tabelas.atend_conversas![0]!;
const campo = (l: Linha, k: string) => {
  if (!k.includes("->")) return l[k];
  return k.split(/->>?/).reduce((valor, parte) => valor?.[parte], l) ?? null;
};
const admin = {
  from(tabela: string) {
    let patch: Linha | null = null,
      insercao: Linha | null = null;
    let unica = false,
      limite = Infinity;
    const filtros: Array<(l: Linha) => boolean> = [];
    const ordens: Array<[string, boolean]> = [];
    const resultado = () => {
      if (patch && tabela === "atend_conversas") {
        const corrida = antesDeGravar;
        antesDeGravar = null;
        corrida?.(patch);
        if (patch.owner_type === "NONE" && falharTransferencia)
          return { data: null, error: { message: "banco temporariamente indisponível" } };
      }
      const linhas = tabelas[tabela] ?? (tabelas[tabela] = []);
      if (insercao) linhas.push({ id: crypto.randomUUID(), ...insercao });
      const alvos = insercao ? [linhas.at(-1)!] : linhas.filter((l) => filtros.every((f) => f(l)));
      alvos.sort((a, b) => {
        for (const [k, asc] of ordens) {
          const d = a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0;
          if (d) return asc ? d : -d;
        }
        return 0;
      });
      const selecionadas = alvos.slice(0, limite);
      if (patch) selecionadas.forEach((l) => Object.assign(l, patch));
      return {
        data: structuredClone(unica ? (selecionadas[0] ?? null) : selecionadas),
        count: selecionadas.length,
        error: null,
      };
    };
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => {
        filtros.push((l) => campo(l, k) === v);
        return q;
      },
      neq: (k: string, v: any) => {
        filtros.push((l) => campo(l, k) !== v);
        return q;
      },
      is: (k: string, v: any) => {
        filtros.push((l) => campo(l, k) === v);
        return q;
      },
      in: (k: string, vs: any[]) => {
        filtros.push((l) => vs.includes(campo(l, k)));
        return q;
      },
      not: (k: string, op: string, v: any) => {
        filtros.push((l) =>
          op === "is"
            ? campo(l, k) !== v
            : !v
                .replace(/[()\"]/g, "")
                .split(",")
                .includes(campo(l, k)),
        );
        return q;
      },
      lte: (k: string, v: any) => {
        filtros.push((l) => campo(l, k) != null && campo(l, k) <= v);
        return q;
      },
      order: (k: string, o?: { ascending?: boolean }) => {
        ordens.push([k, o?.ascending ?? true]);
        return q;
      },
      limit: (n: number) => {
        limite = n;
        return q;
      },
      update: (p: Linha) => {
        patch = p;
        return q;
      },
      insert: (p: Linha) => {
        insercao = p;
        return q;
      },
      maybeSingle: () => {
        unica = true;
        return Promise.resolve(resultado());
      },
      single: () => {
        unica = true;
        return Promise.resolve(resultado());
      },
      then: (a: any, b: any) => Promise.resolve(resultado()).then(a, b),
    };
    return q;
  },
  async rpc(nome: string) {
    if (nome !== "atend_auto_assign_conversa") throw Error("RPC inesperada: " + nome);
    atribuicoes++;
    expect(conv().is_teste).toBe(false);
    if (!online) return { data: null, error: null };
    Object.assign(conv(), {
      owner_type: "HUMAN",
      atribuida_user_id: "atendente",
      status: "human_attending",
    });
    return { data: "atendente", error: null };
  },
};
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));
mock.module("@/lib/atendimento/handoff-resumo.server", () => ({
  reservarResumoHandoff: async () => {},
  garantirResumoHandoff: async (args: Linha) => {
    resumos.push(args);
  },
}));
mock.module("@/lib/atendimento/handoff-auditoria.server", () => ({
  registrarAuditoriaHandoff: async () => {},
}));
mock.module("@/lib/atendimento/protocolo-atendimento.server", () => ({
  protocoloAoIniciarHandoff: async () => {
    avisos++;
    return { protocolo: "TESTE-1", anuncio: null };
  },
  protocoloAoAtribuirHumano: async () => {},
}));
const {
  registrarEsperaAposRespostaNina,
  limparEsperaPaciente,
  limparEsperaPorTelefone,
  timeoutPendenteConfirmado,
} = await import("../../espera-paciente.server");
const { processarTimeoutsEsperaPaciente } = await import("../../espera-timeout.server");
const { salvarFluxoEstado, normalizarEstado } = await import("../../fluxo-estado.server");
const { encaminharParaHumano } = await import("../../../atendimento/handoff.server");

function mensagem(over: Linha = {}) {
  return {
    id: "nina-1",
    clinica_id: "cl1",
    conversa_id: "c1",
    created_at: inicio,
    direction: "out",
    enviada_por: "nina",
    status: "sent",
    body: "O exame custa R$ 150,00.",
    ...over,
  };
}
beforeEach(() => {
  tabelas = {
    atend_conversas: [
      {
        id: "c1",
        clinica_id: "cl1",
        contato_telefone: "55000100000",
        status: "bot_attending",
        owner_type: "AI",
        ai_enabled: true,
        atribuida_user_id: null,
        is_teste: false,
        ultima_msg_em: inicio,
        awaiting_patient_since: inicio,
        patient_response_deadline: prazo,
        nina_fluxo_estado: { session_id: "sessao", session_started_at: "2026-09-16T13:50:00Z" },
      },
    ],
    whatsapp_mensagens: [mensagem()],
    profiles: [{ id: "atendente", nome: "Atendente de teste" }],
    atend_departamentos: [],
    nina_teste_ciclos: [],
  };
  antesDeGravar = null;
  falharTransferencia = false;
  online = true;
  atribuicoes = 0;
  avisos = 0;
  resumos = [];
});
const executar = (minutos = 30) =>
  processarTimeoutsEsperaPaciente({ clinicaId: "cl1", agora: tempo(minutos) });
const registrar = (minutos = 0) =>
  registrarEsperaAposRespostaNina({
    clinicaId: "cl1",
    conversaId: "c1",
    resposta: "Informação enviada pela Nina.",
    agora: tempo(minutos),
  });

it("Nina às 14h, silêncio até 14h30: atribui humano e registra evidência", async () => {
  expect((await executar(29.999)).transferidas).toBe(0);
  expect((await executar()).transferidas).toBe(1);
  expect(conv().owner_type).toBe("HUMAN");
  expect(conv().ai_enabled).toBe(false);
  expect(conv().patient_response_deadline).toBeNull();
  expect(avisos).toBe(1);
  const evento = tabelas.atend_conversa_eventos!.find((e) => e.evento === "TIMEOUT_NINA");
  expect(evento?.detalhes.mensagem_nina_id).toBe("nina-1");
  expect(resumos[0]!.extras.ultimaPergunta).toBe("O exame custa R$ 150,00.");
});
it("sem atendente online, mantém aberta na fila humana", async () => {
  online = false;
  await executar();
  expect(conv().owner_type).toBe("NONE");
  expect(conv().status).toBe("waiting");
});
it("homologação encaminha sem atribuir atendente real", async () => {
  conv().is_teste = true;
  await executar();
  expect(conv().owner_type).toBe("NONE");
  expect(atribuicoes).toBe(0);
  expect(avisos).toBe(1);
});
it("duas execuções concorrentes fazem só um handoff", async () => {
  const rs = await Promise.all([executar(), executar()]);
  expect(rs.reduce((n, r) => n + r.transferidas, 0)).toBe(1);
  expect(avisos).toBe(1);
  expect(resumos).toHaveLength(1);
  await executar(40);
  expect(avisos).toBe(1);
});
for (const patch of [
  { owner_type: "HUMAN", atribuida_user_id: "pessoa" },
  { owner_type: "NONE" },
  { ai_enabled: false },
  { status: "closed" },
  { status: "resolved" },
  { status: "encerrada" },
]) {
  it(`não transfere conversa fora da Nina: ${JSON.stringify(patch)}`, async () => {
    Object.assign(conv(), patch);
    await executar();
    expect(avisos).toBe(0);
  });
}
it("paciente responde aos 29 minutos: cancela espera", async () => {
  await limparEsperaPaciente("cl1", "c1");
  expect((await executar()).avaliadas).toBe(0);
  expect(avisos).toBe(0);
});
it("entrada persistida cancela timeout mesmo antes de o webhook limpar prazo", async () => {
  tabelas.whatsapp_mensagens!.push(
    mensagem({
      id: "paciente",
      created_at: tempo(29).toISOString(),
      direction: "in",
      enviada_por: "paciente",
      status: "received",
    }),
  );
  await executar();
  expect(avisos).toBe(0);
  expect(conv().patient_response_deadline).toBeNull();
});
for (const patch of [
  { patient_response_deadline: null },
  { ultima_msg_em: "nova mensagem" },
  { owner_type: "HUMAN", atribuida_user_id: "pessoa" },
  { status: "closed" },
  { nina_fluxo_estado: { session_id: "sessao-nova" } },
]) {
  it(`corrida antes do handoff não transfere: ${JSON.stringify(patch)}`, async () => {
    antesDeGravar = () => Object.assign(conv(), patch);
    await executar();
    expect(avisos).toBe(0);
  });
}
it("falha no UPDATE mantém prazo para próxima rodada", async () => {
  falharTransferencia = true;
  expect((await executar()).erros).toBe(1);
  expect(conv().patient_response_deadline).toBe(prazo);
  expect(avisos).toBe(0);
  falharTransferencia = false;
  expect((await executar(31)).transferidas).toBe(1);
});
it("qualquer resposta Nina inicia 30 minutos, inclusive informação sem pergunta", async () => {
  conv().awaiting_patient_since = null;
  conv().patient_response_deadline = null;
  expect((await registrar()).deadline).toBe(prazo);
});
it("repetir registro da mesma mensagem não prolonga espera", async () => {
  expect((await registrar(20)).deadline).toBe(prazo);
});
it("nova resposta Nina começa outra contagem, sem aproveitar prazo anterior", async () => {
  const em = tempo(10).toISOString();
  conv().ultima_msg_em = em;
  tabelas.whatsapp_mensagens!.push(mensagem({ id: "nina-2", created_at: em }));
  expect((await registrar(10)).deadline).toBe(tempo(40).toISOString());
  expect((await executar()).transferidas).toBe(0);
  expect((await executar(40)).transferidas).toBe(1);
});
it("novo prazo não é apagado por job que leu o prazo antigo", async () => {
  tabelas.whatsapp_mensagens!.push(mensagem({ id: "nina-2", created_at: tempo(10).toISOString() }));
  antesDeGravar = () => {
    conv().patient_response_deadline = tempo(40).toISOString();
  };
  await executar();
  expect(conv().patient_response_deadline).toBe(tempo(40).toISOString());
});
for (const patch of [
  { direction: "in", enviada_por: "paciente" },
  { enviada_por: "atendente" },
  { status: "pending" },
  { status: "failed" },
]) {
  it(`registro e timeout exigem saída enviada da Nina: ${JSON.stringify(patch)}`, async () => {
    Object.assign(tabelas.whatsapp_mensagens![0]!, patch);
    expect((await registrar()).aguardando).toBe(false);
    await executar();
    expect(avisos).toBe(0);
  });
}
it("marcador interno não é retorno do paciente", async () => {
  tabelas.whatsapp_mensagens!.push(
    mensagem({
      id: "sistema",
      created_at: tempo(1).toISOString(),
      status: "system",
      enviada_por: "sistema",
    }),
  );
  expect((await executar()).transferidas).toBe(1);
});
it("resposta concorrente impede armar prazo", async () => {
  conv().awaiting_patient_since = null;
  conv().patient_response_deadline = null;
  antesDeGravar = () => {
    conv().ultima_msg_em = "paciente respondeu";
  };
  expect((await registrar()).aguardando).toBe(false);
  expect(conv().patient_response_deadline).toBeNull();
});
it("mensagem da sessão anterior não inicia espera em sessão nova", async () => {
  conv().nina_fluxo_estado.session_started_at = tempo(1).toISOString();
  expect((await registrar()).aguardando).toBe(false);
  await executar();
  expect(avisos).toBe(0);
});
it("timeout invalida confirmação pendente atomicamente", async () => {
  Object.assign(conv().nina_fluxo_estado, {
    appointment: { intent_confirmed: true, slot_inicio: "vaga-antiga" },
    flow: { stage: "WAITING_FINAL_CONFIRMATION" },
  });
  await executar();
  expect(conv().nina_fluxo_estado.appointment.slot_inicio).toBeNull();
  expect(conv().nina_fluxo_estado.flow.stage).toBe("HANDOFF");
});
it("consulta limitada à clínica solicitada", async () => {
  const r = await processarTimeoutsEsperaPaciente({ clinicaId: "outra", agora: tempo(30) });
  expect(r.avaliadas).toBe(0);
  expect(avisos).toBe(0);
});

it("webhook atrasado não cancela espera de uma resposta posterior da Nina", async () => {
  await limparEsperaPorTelefone("cl1", "55000100000", tempo(-1).toISOString());
  expect(conv().patient_response_deadline).toBe(prazo);
  await limparEsperaPorTelefone("cl1", "55000100000", tempo(29).toISOString());
  expect(conv().patient_response_deadline).toBeNull();
});

function concluirAgendamento() {
  Object.assign(conv().nina_fluxo_estado, {
    appointment: { appointment_id: "agendamento-1", confirmed_in_session: "sessao" },
    flow: { stage: "APPOINTMENT_CONFIRMED" },
  });
}

for (const teste of [false, true]) {
  it(`agendamento concluído dispensa espera em ${teste ? "homologação" : "produção"}`, async () => {
    conv().is_teste = teste;
    concluirAgendamento();
    const estadoConcluido = structuredClone(conv().nina_fluxo_estado);
    expect((await registrar()).aguardando).toBe(false);
    expect(conv().patient_response_deadline).toBeNull();
    expect(conv().awaiting_patient_since).toBeNull();
    await executar(31);
    expect(avisos).toBe(0);
    expect(atribuicoes).toBe(0);
    expect(conv().owner_type).toBe("AI");
    expect(conv().nina_fluxo_estado).toEqual(estadoConcluido);
  });

  it(`job descarta prazo antigo após agendamento concluído (${teste ? "teste" : "real"})`, async () => {
    conv().is_teste = teste;
    concluirAgendamento();
    expect(
      await timeoutPendenteConfirmado({
        clinicaId: "cl1",
        conversaId: "c1",
        agora: tempo(31),
      }),
    ).toBe(false);
    const resultado = await executar(31);
    expect(resultado.ignoradas).toBe(1);
    expect(resultado.transferidas).toBe(0);
    expect(conv().patient_response_deadline).toBeNull();
    expect(avisos).toBe(0);
    expect(resumos).toHaveLength(0);
    expect(conv().nina_fluxo_estado.appointment.appointment_id).toBe("agendamento-1");
  });
}

it("persistir a conclusão cancela o prazo na mesma gravação do estado", async () => {
  concluirAgendamento();
  const concluido = normalizarEstado(conv().nina_fluxo_estado);
  conv().nina_fluxo_estado.appointment = {};
  await salvarFluxoEstado(admin as never, "cl1", "c1", concluido);
  expect(conv().nina_fluxo_estado.appointment.appointment_id).toBe("agendamento-1");
  expect(conv().patient_response_deadline).toBeNull();
  expect(conv().awaiting_patient_since).toBeNull();
});

for (const estado of [
  {
    appointment: { slot_confirmed_by_patient: true },
    flow: { stage: "WAITING_FINAL_CONFIRMATION" },
  },
  { appointment: {}, flow: { stage: "APPOINTMENT_CONFIRMED" } },
  { appointment: {}, flow: { stage: "APPOINTMENT_FAILED" } },
  {
    appointment: { appointment_id: "antigo", confirmed_in_session: "sessao-anterior" },
    flow: { stage: "BOOKED" },
  },
  { appointment: { appointment_id: "antigo" }, flow: { stage: "GREETING" } },
]) {
  it(`sem reserva comprovada na sessão mantém timeout: ${JSON.stringify(estado)}`, async () => {
    Object.assign(conv().nina_fluxo_estado, estado);
    expect((await registrar()).aguardando).toBe(true);
    expect((await executar()).transferidas).toBe(1);
  });
}

it("frase de confirmação sem registro real não dispensa o prazo", async () => {
  tabelas.whatsapp_mensagens![0]!.body = "Seu agendamento está confirmado. Até breve!";
  expect((await registrar()).aguardando).toBe(true);
  expect((await executar()).transferidas).toBe(1);
});

it("conclusão legada com ID e etapa BOOKED também dispensa timeout", async () => {
  Object.assign(conv().nina_fluxo_estado, {
    appointment: { appointment_id: "agendamento-legado" },
    flow: { stage: "BOOKED" },
  });
  expect((await executar()).transferidas).toBe(0);
  expect(conv().patient_response_deadline).toBeNull();
});

it("cortesia posterior ao agendamento não reabre o temporizador", async () => {
  concluirAgendamento();
  conv().ultima_msg_em = tempo(10).toISOString();
  tabelas.whatsapp_mensagens!.push(
    mensagem({
      id: "nina-2",
      created_at: tempo(10).toISOString(),
      body: "De nada, até breve!",
    }),
  );
  expect((await registrar(10)).aguardando).toBe(false);
  expect((await executar(45)).transferidas).toBe(0);
});

it("novo atendimento após reset volta a ter prazo normal", async () => {
  concluirAgendamento();
  await registrar();
  conv().nina_fluxo_estado = {
    session_id: "nova-sessao",
    session_started_at: tempo(5).toISOString(),
  };
  conv().ultima_msg_em = tempo(10).toISOString();
  tabelas.whatsapp_mensagens!.push(mensagem({ id: "nina-2", created_at: tempo(10).toISOString() }));
  expect((await registrar(10)).deadline).toBe(tempo(40).toISOString());
  expect((await executar(40)).transferidas).toBe(1);
});

it("conclusão concorrente impede que um job antigo transfira a conversa", async () => {
  antesDeGravar = concluirAgendamento;
  expect((await executar()).transferidas).toBe(0);
  expect(avisos).toBe(0);
  expect(conv().nina_fluxo_estado.appointment.appointment_id).toBe("agendamento-1");
  await executar(31);
  expect(conv().patient_response_deadline).toBeNull();
});

it("conclusão concorrente impede rearmar um prazo já cancelado", async () => {
  conv().awaiting_patient_since = null;
  conv().patient_response_deadline = null;
  antesDeGravar = concluirAgendamento;
  expect((await registrar()).aguardando).toBe(false);
  expect(conv().patient_response_deadline).toBeNull();
});

it("limpeza da exceção não apaga espera de outro estado concorrente", async () => {
  concluirAgendamento();
  antesDeGravar = () => {
    conv().nina_fluxo_estado = { session_id: "nova-sessao" };
  };
  await executar();
  expect(conv().patient_response_deadline).toBe(prazo);
  expect(avisos).toBe(0);
});

it("exceção ao timeout preserva encaminhamento solicitado pelo paciente", async () => {
  concluirAgendamento();
  const r = await encaminharParaHumano({
    clinicaId: "cl1",
    conversaId: "c1",
    motivo: "paciente pediu atendente humano",
    solicitadoPor: "PACIENTE",
  });
  expect(r.ok).toBe(true);
  expect(conv().owner_type).toBe("HUMAN");
  expect(avisos).toBe(1);
});
