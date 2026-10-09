import { describe, expect, it } from "bun:test";
import {
  LIMITES_DIA_REAL,
  VARIACAO_PEDE_ATENDENTE,
  criarRng,
  duracaoDiaRealS,
  gerarChegadasMs,
  montarCenariosDiaReal,
  montarItensDiaReal,
  normalizarConfigDiaReal,
  resumoDiaReal,
  type PerfilPico,
} from "../carga-dia-real";
import { itemBateria, type ConsultaCatalogo } from "../carga-bateria";

const consulta = (n: number): ConsultaCatalogo => ({
  profissionalId: `prof-${n}`,
  medicoId: `med-${n}`,
  medicoNome: `Dra. Teste ${n}`,
  chave: `c${n}`,
  consulta: "CONSULTA",
  especialidade: "CLÍNICA MÉDICA",
  dinheiro: "R$ 100,00",
  pixCartao: "R$ 120,00",
  modalidade: "hora_marcada",
  idadeMinima: null,
  unidadeIdade: null,
  criterio: null,
  horarios: null,
  encaminhamentoHumano: false,
});
const leads = Array.from({ length: 10 }, (_, i) => ({ id: `lead-${i + 1}`, indice: i + 1 }));

describe("dia real — chegadas espalhadas no tempo", () => {
  for (const perfil of ["uniforme", "pico_inicio", "dois_picos", "aleatorio"] as PerfilPico[]) {
    it(`${perfil}: ${30} chegadas crescentes dentro de 20 minutos`, () => {
      const dur = 20 * 60_000;
      const chegadas = gerarChegadasMs(30, dur, perfil, criarRng(42));
      expect(chegadas).toHaveLength(30);
      for (let i = 0; i < chegadas.length; i++) {
        expect(chegadas[i]!).toBeGreaterThanOrEqual(0);
        expect(chegadas[i]!).toBeLessThan(dur);
        if (i) expect(chegadas[i]!).toBeGreaterThanOrEqual(chegadas[i - 1]!);
      }
      // Não é tudo de uma vez: há intervalos diferentes entre as chegadas.
      const intervalos = new Set(chegadas.slice(1).map((c, i) => c - chegadas[i]!));
      expect(intervalos.size).toBeGreaterThan(5);
    });
  }

  it("mesmo seed, mesmo plano (reproduzível)", () => {
    const a = gerarChegadasMs(12, 600_000, "aleatorio", criarRng(7));
    const b = gerarChegadasMs(12, 600_000, "aleatorio", criarRng(7));
    expect(a).toEqual(b);
  });

  it("pico no início concentra mais da metade das chegadas no primeiro terço", () => {
    const dur = 60 * 60_000;
    const chegadas = gerarChegadasMs(60, dur, "pico_inicio", criarRng(3));
    const noInicio = chegadas.filter((c) => c < dur / 3).length;
    expect(noInicio).toBeGreaterThan(30);
  });
});

describe("dia real — cenários e plano por lead", () => {
  const rng = criarRng(11);
  const chegadas = gerarChegadasMs(12, 300_000, "uniforme", rng);
  const cenarios = montarCenariosDiaReal({
    consultas: [consulta(1), consulta(2), consulta(3)],
    vagasPorMedico: { "med-1": 5, "med-2": 0, "med-3": null },
    chegadasMs: chegadas,
    rng,
  });

  it("uma conversa por chegada, com horário e perfil; a cada 5 uma pede atendente", () => {
    expect(cenarios).toHaveLength(12);
    expect(cenarios.map((c) => c.chegadaMs)).toEqual(chegadas);
    const pedem = cenarios.filter((c) => c.variacao.id === VARIACAO_PEDE_ATENDENTE.id);
    expect(pedem.map((c) => c.ordem)).toEqual([5, 10]);
    expect(pedem.every((c) => c.esperado === "encaminhar")).toBe(true);
    expect(new Set(cenarios.map((c) => c.id)).size).toBe(12);
  });

  it("12 conversas em 10 leads: os dois primeiros leads recebem duas, com reinício entre elas", () => {
    const itens = montarItensDiaReal(cenarios, leads, 4);
    expect(itens.every((i) => itemBateria(i))).toBe(true);
    expect(itens.map((i) => i.indice)).toEqual(itens.map((_, k) => k));
    const doLead1 = itens.filter((i) => i.leadId === "lead-1");
    // 4 turnos + verificar + devolver, reiniciar, 4 turnos + verificar + devolver
    expect(doLead1.map((i) => i.tipo)).toEqual([
      "turno",
      "turno",
      "turno",
      "turno",
      "verificar",
      "devolver",
      "reiniciar",
      "turno",
      "turno",
      "turno",
      "turno",
      "verificar",
      "devolver",
    ]);
    // O reinício fecha a conversa anterior (cenário 1), e a segunda é o cenário 11.
    expect(doLead1[6]!.cenarioId).toBe(cenarios[0]!.id);
    expect(doLead1[7]!.cenarioId).toBe(cenarios[10]!.id);
    // A última conversa de cada lead não é reiniciada: o card fica na tela.
    expect(itens.filter((i) => i.tipo === "reiniciar")).toHaveLength(2);
    // Lead 3 só tem uma conversa.
    expect(itens.filter((i) => i.leadId === "lead-3").map((i) => i.tipo)).toEqual([
      "turno",
      "turno",
      "turno",
      "turno",
      "verificar",
      "devolver",
    ]);
  });

  it("nunca intercala duas conversas do mesmo lead: a ordem por lead é sempre crescente", () => {
    const itens = montarItensDiaReal(cenarios, leads, 4);
    for (const lead of leads) {
      const doLead = itens.filter((i) => i.leadId === lead.id);
      const vistos: string[] = [];
      for (const i of doLead) {
        if (i.tipo === "reiniciar") continue;
        if (!vistos.includes(i.cenarioId)) vistos.push(i.cenarioId);
        // Depois que uma conversa começou a seguinte, a anterior não volta.
        expect(vistos.at(-1)).toBe(i.cenarioId);
      }
    }
  });

  it("resumo: aguardando, iniciadas, em andamento, transferidas e concluídas", () => {
    const itens = montarItensDiaReal(cenarios, leads, 4);
    const diaReal = normalizarConfigDiaReal({
      conversas: 12,
      duracaoMin: 5,
      perfilPico: "uniforme",
      seed: 1,
    });
    const bateria = {
      versao: 1 as const,
      turnos: 4,
      esperaAposReinicioMs: 15_000,
      janelaVagasDias: 60,
      duracaoMaxS: duracaoDiaRealS(diaReal),
      cenarios,
    };
    const inicio = new Date("2026-10-09T12:00:00Z");
    const turno = (cenarioId: string, ordem: number) =>
      itens.find(
        (i) => i.cenarioId === cenarioId && i.tipo === "turno" && i.ordemNoCenario === ordem,
      )!.indice;
    const verificar = (cenarioId: string) =>
      itens.find((i) => i.cenarioId === cenarioId && i.tipo === "verificar")!.indice;
    const c1 = cenarios[0]!.id;
    const c2 = cenarios[1]!.id;
    const c3 = cenarios[2]!.id;
    const passos = [
      // conversa 1: concluída com transferência
      { indice: turno(c1, 0), status: "ok" },
      { indice: turno(c1, 1), status: "ok", resultado: { transferida: true } },
      { indice: turno(c1, 2), status: "dispensado", resultado: { fim: "encaminhado" } },
      { indice: verificar(c1), status: "dispensado", resultado: { encaminhada: true } },
      // conversa 2: em andamento
      { indice: turno(c2, 0), status: "ok" },
      // conversa 3: só passos dispensados (não começou de fato)
      { indice: turno(c3, 0), status: "dispensado", resultado: { fim: "cenario_encerrado" } },
    ];
    const agora = inicio.getTime() + 2 * 60_000;
    const r = resumoDiaReal(diaReal, bateria, itens, passos, inicio.toISOString(), agora);
    expect(r.conversas).toBe(12);
    expect(r.iniciadas).toBe(2);
    expect(r.concluidas).toBe(1);
    expect(r.emAndamento).toBe(1);
    expect(r.transferidas).toBe(1);
    expect(r.aguardando).toBe(10);
    expect(r.aguardando).toBe(
      r.aguardandoLead + (r.proximaChegadaEm ? 1 : 0) + (10 - r.aguardandoLead - 1),
    );
    expect(r.fimPrevistoEm).toBe(new Date(inicio.getTime() + 5 * 60_000).toISOString());
    if (r.proximaChegadaEm) expect(Date.parse(r.proximaChegadaEm)).toBeGreaterThan(agora);
  });
});

describe("dia real — limites", () => {
  it("normaliza a configuração dentro dos tetos", () => {
    const c = normalizarConfigDiaReal({
      conversas: 999,
      duracaoMin: 0,
      perfilPico: "invalido" as PerfilPico,
      turnos: 99,
      manterTransferidasMin: -5,
      seed: 5,
    });
    expect(c.conversas).toBe(LIMITES_DIA_REAL.conversasMax);
    expect(c.duracaoMin).toBe(LIMITES_DIA_REAL.duracaoMinMin);
    expect(c.perfilPico).toBe("uniforme");
    expect(c.turnos).toBe(12);
    expect(c.manterTransferidasMin).toBe(0);
    expect(c.seed).toBe(5);
  });

  it("prazo total cobre a duração escolhida com folga e nunca passa de 4 horas", () => {
    const curto = normalizarConfigDiaReal({ conversas: 10, duracaoMin: 5, perfilPico: "uniforme" });
    expect(duracaoDiaRealS(curto)).toBe((5 + 30 + 10) * 60);
    const longo = normalizarConfigDiaReal({
      conversas: 60,
      duracaoMin: 120,
      perfilPico: "uniforme",
      manterTransferidasMin: 180,
    });
    expect(duracaoDiaRealS(longo)).toBe(4 * 3600);
  });
});
