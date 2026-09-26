import { describe, expect, test } from "bun:test";
import {
  AVISO_HA_MAIS, chaveHorario, chavePaginacao, instrucaoDoPlano, interpretarRespostaHorarios, LIMITE_EXIBICAO,
  paginacaoVigente, periodoDaHora, planejarHorarios, registrarPaginacao, respondeEscolhaDeHorarios,
} from "../horarios-periodo";
import { estadoVazio } from "../fluxo-estado-normalizar";

const slot = (hora: string, medico = "m1", dia = "2026-09-30") =>
  ({ medico_id: medico, hora, inicio: new Date(`${dia}T${hora}:00-03:00`).toISOString() });
/** De `ini` a `fim` (exclusivo), a cada `passo` minutos. */
function faixa(ini: string, fim: string, passo = 5, medico = "m1") {
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
  const r = [];
  for (let t = m(ini); t < m(fim); t += passo)
    r.push(slot(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, medico));
  return r;
}
const horas = (xs: { hora: string }[]) => xs.map((x) => x.hora);

describe("períodos da clínica (America/Sao_Paulo)", () => {
  test.each([
    ["00:00", "madrugada"], ["04:59", "madrugada"], ["05:00", "manha"], ["11:59", "manha"],
    ["12:00", "tarde"], ["17:59", "tarde"], ["18:00", "noite"], ["23:59", "noite"],
  ])("%s → %s", (h, p) => expect(periodoDaHora(h)).toBe(p as never));
});

describe("regra de apresentação", () => {
  test("até 10 horários: todos", () => {
    const plano = planejarHorarios(faixa("08:00", "08:50", 5));
    expect(plano.modo).toBe("todos");
    expect(plano.modo === "todos" && plano.horarios).toHaveLength(10);
  });

  test("mais de 10 em manhã e tarde: pergunta o período, só com os que têm vaga", () => {
    const plano = planejarHorarios([...faixa("08:00", "10:20"), ...faixa("13:40", "17:50")]);
    expect(plano.modo).toBe("escolher_periodo");
    if (plano.modo !== "escolher_periodo") return;
    expect(plano.periodos.map((p) => [p.periodo, p.quantidade])).toEqual([["manha", 28], ["tarde", 50]]);
    expect(instrucaoDoPlano(plano)).toContain("pela manhã (28), à tarde (50)");
    expect(instrucaoDoPlano(plano)).not.toContain("noite");
  });

  test("mais de 10 num único período: não pergunta, mostra os 10 primeiros e avisa que há mais", () => {
    const plano = planejarHorarios(faixa("13:00", "15:00"));
    expect(plano.modo).toBe("lista");
    if (plano.modo !== "lista") return;
    expect(horas(plano.horarios)).toEqual(horas(faixa("13:00", "13:50")));
    expect(plano.restantes).toBe(14);
    // Sem período escolhido, a lista é do dia: mesmo aviso, dito "nesse dia".
    expect(instrucaoDoPlano(plano)).toContain(AVISO_HA_MAIS.replace("nesse período", "nesse dia"));
  });

  test("preferência informada: tarde em ordem cronológica, sem perguntar", () => {
    const plano = planejarHorarios([...faixa("08:00", "10:20"), ...faixa("13:40", "17:50")], { filtro: { periodo: "tarde" } });
    expect(plano.modo === "lista" && horas(plano.horarios)[0]).toBe("13:40");
    expect(plano.modo === "lista" && plano.horarios).toHaveLength(LIMITE_EXIBICAO);
  });

  test("tanto faz: os primeiros do dia, em ordem cronológica", () => {
    const plano = planejarHorarios([...faixa("13:40", "17:50"), ...faixa("08:00", "10:20")], { filtro: { periodo: "qualquer" } });
    expect(plano.modo === "lista" && horas(plano.horarios)).toEqual(horas(faixa("08:00", "08:50")));
  });

  test("depois das 14h", () => {
    const plano = planejarHorarios(faixa("13:00", "17:00", 30), { filtro: { a_partir_de: "14:00" } });
    expect(plano.modo === "lista" && horas(plano.horarios)).toEqual(["14:00", "14:30", "15:00", "15:30", "16:00", "16:30"]);
  });

  test("próximas páginas sem repetir; não diz que acabou enquanto houver horários", () => {
    const dia = faixa("13:40", "17:50");
    const vistos: string[] = [];
    const paginas: string[][] = [];
    let plano = planejarHorarios(dia, { filtro: { periodo: "tarde" } });
    while (plano.modo === "lista") {
      paginas.push(horas(plano.horarios));
      vistos.push(...plano.horarios.map(chaveHorario));
      if (plano.restantes > 0) expect(instrucaoDoPlano(plano)).toContain("Não diga que acabaram");
      plano = planejarHorarios(dia, { filtro: { periodo: "tarde" }, mais: true, jaApresentados: vistos });
    }
    expect(paginas.map((p) => p.length)).toEqual([10, 10, 10, 10, 10]);
    expect(new Set(paginas.flat()).size).toBe(50);
    expect(plano.modo).toBe("esgotado");
    expect(instrucaoDoPlano(plano)).toContain("não afirme que não há horários");
  });

  test("várias vagas no mesmo horário contam como um horário só", () => {
    const repetidas = faixa("08:00", "08:45").flatMap((s) => [s, { ...s }, { ...s }]);
    const plano = planejarHorarios(repetidas);
    expect(plano.modo === "todos" && plano.horarios).toHaveLength(9);
  });

  test("período sem vaga oferece só os períodos que têm", () => {
    const plano = planejarHorarios(faixa("08:00", "10:00"), { filtro: { periodo: "noite" } });
    expect(plano.modo).toBe("sem_horarios_no_filtro");
    expect(plano.modo === "sem_horarios_no_filtro" && plano.periodos.map((p) => p.periodo)).toEqual(["manha"]);
  });
});

describe("respostas naturais", () => {
  test.each([
    ["de manhã", { tipo: "periodo", periodo: "manha" }],
    ["à tarde", { tipo: "periodo", periodo: "tarde" }],
    ["pode ser mais cedo", { tipo: "periodo", periodo: "manha" }],
    ["depois do almoço", { tipo: "periodo", periodo: "tarde" }],
    ["depois das 14h", { tipo: "a_partir_de", hora: "14:00" }],
    ["a partir das 15:30", { tipo: "a_partir_de", hora: "15:30" }],
    ["tanto faz", { tipo: "qualquer" }],
    ["qualquer período", { tipo: "qualquer" }],
    ["mostra os outros", { tipo: "mais" }],
    ["tem mais horários?", { tipo: "mais" }],
    ["e os próximos?", { tipo: "mais" }],
    ["à noite", { tipo: "periodo", periodo: "noite" }],
  ])("%s", (texto, esperado) => expect(interpretarRespostaHorarios(texto)).toEqual(esperado as never));

  test.each(["quero ver os horários", "Pode ser 08:00", "Qual o valor?", "Dr. Alex Louza"])(
    "%s não é resposta de período nem pedido de mais", (texto) => expect(interpretarRespostaHorarios(texto)).toBeNull());
});

describe("paginação na conversa", () => {
  const CLINICA = "c1";
  function estado(sessao = "s1") {
    const e = estadoVazio();
    e.session_id = sessao;
    return e;
  }
  const chave = chavePaginacao({ medicoId: "m1", atendimento: "neuro", data: "2026-09-30" });
  const pag = { clinica_id: CLINICA, chave, filtro: { periodo: "tarde" as const }, aguardando: "horario" as const,
    periodos_oferecidos: [], apresentados: ["m1|1"] };

  test("vale para a mesma lista", () => {
    const e = estado();
    registrarPaginacao(e, pag);
    expect(paginacaoVigente(e, CLINICA, chave)?.apresentados).toEqual(["m1|1"]);
  });

  test.each([
    ["troca de data", chavePaginacao({ medicoId: "m1", atendimento: "neuro", data: "2026-10-01" })],
    ["troca de médico", chavePaginacao({ medicoId: "m2", atendimento: "neuro", data: "2026-09-30" })],
    ["troca de atendimento", chavePaginacao({ medicoId: "m1", atendimento: "cardio", data: "2026-09-30" })],
  ])("%s reinicia a lista", (_, outra) => {
    const e = estado();
    registrarPaginacao(e, pag);
    expect(paginacaoVigente(e, CLINICA, outra)).toBeNull();
  });

  test("reset (nova sessão) ou outra clínica descartam a paginação", () => {
    const e = estado();
    registrarPaginacao(e, pag);
    expect(paginacaoVigente(e, "outra", chave)).toBeNull();
    e.session_id = "s2";
    expect(paginacaoVigente(e, CLINICA, chave)).toBeNull();
    expect(respondeEscolhaDeHorarios(e, "de tarde")).toBe(false);
  });

  test("Jev: resposta de período só continua o fluxo quando a Nina esperava essa escolha", () => {
    const e = estado();
    expect(respondeEscolhaDeHorarios(e, "de tarde")).toBe(false);
    registrarPaginacao(e, { ...pag, aguardando: "periodo" });
    expect(respondeEscolhaDeHorarios(e, "de tarde")).toBe(true);
    expect(respondeEscolhaDeHorarios(e, "mostra os outros")).toBe(true);
    expect(respondeEscolhaDeHorarios(e, "quero cancelar")).toBe(false);
  });
});
