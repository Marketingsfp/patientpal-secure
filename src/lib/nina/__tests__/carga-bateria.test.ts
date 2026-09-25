import { describe, expect, test } from "bun:test";
import {
  avaliarCenarioBateria,
  consultasDoCatalogo,
  duracaoBateriaS,
  esperadoDaConsulta,
  LIMITES_BATERIA,
  montarCenariosBateria,
  montarItensBateria,
  relatorioBateria,
  valoresEmReais,
  VARIACOES_BATERIA,
  type ConsultaCatalogo,
  type FatosCenarioBateria,
} from "../carga-bateria";

const bloco = (titulo: string, especialidade: string, extra: string[]) =>
  [titulo, `Especialidade: ${especialidade}`, ...extra].join("\n");

const profissionais = [
  {
    id: "p-iarmila",
    nome: "Iarmila Ruzena",
    medico_id: "m-iarmila",
    observacao_publica: [
      bloco("CONSULTA ENDOCRINOLOGIA", "ENDOCRINOLOGIA", [
        "Idade/critério informado: a partir de 18 anos",
        "Dinheiro: R$ 120,00",
        "Pix/cartão: R$ 145,00",
        "Observação: Agendado",
      ]),
      bloco("CONSULTA CLÍNICO GERAL", "CLÍNICO GERAL", [
        "Dinheiro: R$ 100,00",
        "Pix/cartão: R$ 120,00",
        "Observação: Agendado",
      ]),
    ].join("\n\n"),
  },
  {
    id: "p-alex",
    nome: "Alex Louza",
    medico_id: "m-alex",
    observacao_publica: [
      bloco("CONSULTA CARDIOLOGIA", "CARDIOLOGIA", [
        "Dinheiro: R$ 150,00",
        "Observação: Ordem de chegada",
      ]),
      bloco("ELETROCARDIOGRAMA", "CARDIOLOGIA", ["Dinheiro: R$ 80,00", "Observação: Agendado"]),
    ].join("\n\n"),
  },
  {
    id: "p-carlos",
    nome: "Carlos Eduardo",
    medico_id: null,
    observacao_publica: bloco("CONSULTA NEUROLOGIA", "NEUROLOGIA", [
      "Idade/critério informado: a partir de 1 ano",
      "Observação: Agendado",
    ]),
  },
];

describe("montagem da bateria a partir do catálogo publicado", () => {
  const consultas = consultasDoCatalogo(profissionais);

  test("cada bloco de consulta vira uma consulta; exames ficam fora", () => {
    expect(consultas.map((c) => `${c.medicoNome}|${c.consulta}`)).toEqual([
      "Alex Louza|CONSULTA CARDIOLOGIA",
      "Carlos Eduardo|CONSULTA NEUROLOGIA",
      "Iarmila Ruzena|CONSULTA ENDOCRINOLOGIA",
      "Iarmila Ruzena|CONSULTA CLÍNICO GERAL",
    ]);
    const endo = consultas.find((c) => c.consulta === "CONSULTA ENDOCRINOLOGIA")!;
    expect(endo).toMatchObject({
      especialidade: "ENDOCRINOLOGIA",
      dinheiro: "R$ 120,00",
      pixCartao: "R$ 145,00",
      modalidade: "hora_marcada",
      idadeMinima: 18,
    });
  });

  test("previsão: hora marcada com vaga agenda; sem vaga, sem vínculo ou ordem de chegada não", () => {
    const [alex, carlos, endo] = consultas as [
      ConsultaCatalogo,
      ConsultaCatalogo,
      ConsultaCatalogo,
    ];
    expect(esperadoDaConsulta(endo, 12)).toBe("agendar");
    expect(esperadoDaConsulta(endo, 0)).toBe("sem_vaga");
    expect(esperadoDaConsulta(alex, 5)).toBe("orientar_chegada");
    expect(esperadoDaConsulta(carlos, null)).toBe("sem_vaga");
    expect(esperadoDaConsulta({ ...endo, modalidade: null }, 3)).toBe("indefinido");
    expect(esperadoDaConsulta({ ...endo, encaminhamentoHumano: true }, 3)).toBe("encaminhar");
  });

  test("cenários: só os profissionais escolhidos, variações em rodízio e dados fictícios rastreáveis", () => {
    const cenarios = montarCenariosBateria({
      consultas,
      vagasPorMedico: { "m-iarmila": 4 },
      profissionalIds: ["p-iarmila"],
      variacoesPorConsulta: 2,
      hoje: new Date("2026-09-25T12:00:00Z"),
    });
    expect(cenarios).toHaveLength(4);
    expect(new Set(cenarios.map((c) => c.id)).size).toBe(4);
    expect(cenarios.map((c) => c.variacao.id)).toEqual(
      VARIACOES_BATERIA.slice(0, 4).map((v) => v.id),
    );
    expect(cenarios.map((c) => c.paciente.nome)).toEqual([
      "Simulação Teste 01",
      "Simulação Teste 02",
      "Simulação Teste 03",
      "Simulação Teste 04",
    ]);
    expect(cenarios.every((c) => c.paciente.idadeAnos > 18)).toBe(true);
    expect(cenarios[0]!.titulo).toBe("Iarmila Ruzena · CONSULTA ENDOCRINOLOGIA · Paciente direto");
    expect(cenarios[0]!.esperado).toBe("agendar");
  });

  test("familiar é criança quando a consulta aceita, e respeita a idade mínima", () => {
    const familiar = VARIACOES_BATERIA.findIndex((v) => v.paraFamiliar);
    const neuro = consultas.filter((c) => c.consulta === "CONSULTA NEUROLOGIA");
    const cenarios = montarCenariosBateria({
      consultas: Array.from({ length: familiar + 1 }, () => neuro[0]!),
      vagasPorMedico: {},
      variacoesPorConsulta: 1,
      hoje: new Date("2026-09-25T12:00:00Z"),
    });
    const alvo = cenarios[familiar]!;
    expect(alvo.variacao.paraFamiliar).toBe(true);
    expect(alvo.paciente.idadeAnos).toBe(8);
    expect(alvo.paciente.nascimento).toMatch(/^\d{2}\/\d{2}\/2018$/);
  });

  test("um lead por cenário, no máximo 10, com verificação e devolução no fim", () => {
    const cenarios = montarCenariosBateria({
      consultas,
      vagasPorMedico: {},
      variacoesPorConsulta: 1,
    });
    const leads = Array.from({ length: 10 }, (_, i) => ({ id: `lead-${i}`, indice: i + 1 }));
    const itens = montarItensBateria(cenarios, leads, 4);
    expect(itens).toHaveLength(cenarios.length * 6);
    expect(itens.map((i) => i.indice)).toEqual(itens.map((_, n) => n));
    for (const [slot, c] of cenarios.entries()) {
      const doCenario = itens.filter((i) => i.cenarioId === c.id);
      expect(new Set(doCenario.map((i) => i.leadId))).toEqual(new Set([`lead-${slot}`]));
      expect(doCenario.map((i) => i.tipo)).toEqual([
        "turno",
        "turno",
        "turno",
        "turno",
        "verificar",
        "devolver",
      ]);
    }
    // Intercalado: a primeira mensagem de todos os leads vem antes da segunda de qualquer um.
    expect(itens.slice(0, cenarios.length).every((i) => i.ordemNoCenario === 0)).toBe(true);
    const muitos = Array.from({ length: 11 }, () => cenarios[0]!);
    expect(() => montarItensBateria(muitos, leads, 4)).toThrow("no máximo 10");
  });

  test("prazo do teste cresce com as rodadas e respeita o teto", () => {
    expect(duracaoBateriaS(3, 3, 10)).toBe(1 * 10 * 150 + 600);
    expect(duracaoBateriaS(10, 3, 10)).toBe(4 * 10 * 150 + 600);
    expect(duracaoBateriaS(10, 1, 12)).toBe(LIMITES_BATERIA.duracaoMaxS);
  });
});

describe("avaliação objetiva de cada cenário", () => {
  const alvo = {
    medicoId: "m-iarmila",
    medicoNome: "Iarmila Ruzena",
    esperado: "agendar" as const,
    dinheiro: "R$ 120,00",
    pixCartao: "R$ 145,00",
    modalidade: "hora_marcada" as const,
  };
  const fatos = (extra: Partial<FatosCenarioBateria> = {}): FatosCenarioBateria => ({
    respostasNina: ["A consulta custa R$ 120,00 no dinheiro. Tenho quinta às 08:00."],
    mensagensPaciente: ["Oi, queria marcar endocrinologista"],
    agendamentos: [
      { medicoId: "m-iarmila", inicio: "2026-10-01T11:00:00Z", procedimento: "CONSULTA" },
    ],
    encaminhada: false,
    errosTecnicos: 0,
    fim: "agendado",
    latenciasMs: [30_000],
    ...extra,
  });

  test("agendou com o profissional do cenário e citou o preço publicado: aprovado", () => {
    const r = avaliarCenarioBateria(alvo, fatos());
    expect(r).toMatchObject({ resultado: "aprovado", preco: "citado", agendouComAlvo: true });
    expect(r.motivos).toEqual([]);
  });

  test("agendou com outro profissional, encaminhou ou não concluiu: reprovado com o motivo", () => {
    expect(
      avaliarCenarioBateria(
        alvo,
        fatos({ agendamentos: [{ medicoId: "m-outro", inicio: null, procedimento: null }] }),
      ).motivos,
    ).toContain("Agendou com outro profissional, não com o do cenário.");
    expect(
      avaliarCenarioBateria(alvo, fatos({ agendamentos: [], encaminhada: true })).motivos,
    ).toEqual(["Encaminhou para a equipe em vez de agendar."]);
    expect(
      avaliarCenarioBateria(alvo, fatos({ agendamentos: [], fim: "sem_progresso" })).motivos,
    ).toEqual(["Não concluiu o agendamento (fim: sem_progresso)."]);
  });

  test("erro técnico reprova; sem nenhuma resposta da Nina fica inconclusivo", () => {
    expect(avaliarCenarioBateria(alvo, fatos({ errosTecnicos: 1 })).resultado).toBe("reprovado");
    expect(avaliarCenarioBateria(alvo, fatos({ respostasNina: [] })).resultado).toBe(
      "inconclusivo",
    );
  });

  test("ordem de chegada: aprovado quando orienta; reprovado quando marca horário", () => {
    const chegada = { ...alvo, esperado: "orientar_chegada" as const };
    expect(
      avaliarCenarioBateria(
        chegada,
        fatos({
          agendamentos: [],
          respostasNina: ["O atendimento é por ordem de chegada, a partir das 7h."],
        }),
      ).resultado,
    ).toBe("aprovado");
    expect(avaliarCenarioBateria(chegada, fatos()).motivos).toContain(
      "Marcou horário para atendimento por ordem de chegada.",
    );
  });

  test("sem vaga prevista: aceita aviso de falta de vaga ou encaminhamento; vaga encontrada vira observação", () => {
    const semVaga = { ...alvo, esperado: "sem_vaga" as const };
    expect(
      avaliarCenarioBateria(
        semVaga,
        fatos({
          agendamentos: [],
          respostasNina: ["No momento não há vagas para esse profissional."],
        }),
      ).resultado,
    ).toBe("aprovado");
    expect(
      avaliarCenarioBateria(semVaga, fatos({ agendamentos: [], respostasNina: ["Posso ajudar?"] }))
        .resultado,
    ).toBe("reprovado");
    const achou = avaliarCenarioBateria(semVaga, fatos());
    expect(achou.resultado).toBe("aprovado");
    expect(achou.observacoes[0]).toContain("Havia vaga além da previsão");
  });

  test("preço divergente e nome do médico na primeira mensagem ficam como observação", () => {
    const r = avaliarCenarioBateria(
      alvo,
      fatos({
        respostasNina: ["A consulta custa R$ 200,00."],
        mensagensPaciente: ["Quero marcar com a Dra. Iarmila"],
      }),
    );
    expect(r.resultado).toBe("aprovado");
    expect(r.preco).toBe("divergente");
    expect(r.primeiraMensagemCitouNome).toBe(true);
    expect(r.observacoes).toHaveLength(2);
  });

  test("valores em reais são lidos em centavos, com e sem milhar", () => {
    expect(valoresEmReais("De R$ 1.200,50 por R$120 e R$ 145,00")).toEqual([120050, 12000, 14500]);
    expect(valoresEmReais(null)).toEqual([]);
  });
});

describe("relatório da bateria", () => {
  test("uma linha por cenário, com situação, resultado, vagas devolvidas e tokens da Luna", () => {
    const [c1, c2] = montarCenariosBateria({
      consultas: consultasDoCatalogo(profissionais).slice(2, 4),
      vagasPorMedico: { "m-iarmila": 3 },
      variacoesPorConsulta: 1,
    });
    const itens = montarItensBateria(
      [c1!, c2!],
      [
        { id: "lead-0", indice: 1 },
        { id: "lead-1", indice: 2 },
      ],
      4,
    );
    const de = (cenarioId: string, tipo: string, ordem = 0) =>
      itens.find((i) => i.cenarioId === cenarioId && i.tipo === tipo && i.ordemNoCenario >= ordem)!
        .indice;
    const bateria = {
      versao: 1 as const,
      turnos: 4,
      esperaAposReinicioMs: 0,
      janelaVagasDias: 60,
      duracaoMaxS: 600,
      cenarios: [c1!, c2!],
    };
    const r = relatorioBateria(
      bateria,
      itens,
      [
        {
          indice: de(c1!.id, "turno", 0),
          status: "ok",
          latencia_ms: 20_000,
          resultado: { luna: { entrada: 100, saida: 10 } },
        },
        {
          indice: de(c1!.id, "turno", 1),
          status: "dispensado",
          resultado: { fim: "agendado", luna: { entrada: 50, saida: 5 } },
        },
        {
          indice: de(c1!.id, "verificar"),
          status: "verificado",
          resultado: {
            avaliacao: { resultado: "aprovado", motivos: [], observacoes: [], preco: "citado" },
            agendamentos: [{ inicio: "2026-10-01T11:00:00Z" }],
            fim: "agendado",
          },
        },
        { indice: de(c1!.id, "devolver"), status: "devolvido", resultado: { vagasDevolvidas: 1 } },
        { indice: de(c2!.id, "turno", 0), status: "ok", latencia_ms: 40_000 },
      ],
      0,
    );
    expect(
      r.linhas.map((l) => [l.situacao, l.resultado, l.vagasDevolvidas, l.mensagensEnviadas]),
    ).toEqual([
      ["devolvido", "aprovado", 1, 1],
      ["conversando", null, null, 1],
    ]);
    expect(r.totais).toMatchObject({
      cenarios: 2,
      aprovados: 1,
      emAndamento: 1,
      vagasPendentes: 0,
    });
    expect(r.tokensLuna).toBe(165);
    expect(r.linhas[1]!.latenciaMediaMs).toBe(40_000);
  });
});
