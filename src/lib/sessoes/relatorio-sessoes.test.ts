import { describe, expect, it } from "bun:test";
import {
  COLUNAS_SESSOES,
  colunasSessoes,
  modoDoFiltro,
  resumoSessoes,
  filtrarSessoes,
  linhaExibida,
  linhasSessoes,
  precisaBuscaAtiva,
  rotuloSessoes,
  temPendenciaFinanceira,
  totaisSessoes,
  type LinhaSessao,
} from "./relatorio-sessoes";

/** Pacote de fisioterapia; cada teste sobrescreve só o que lhe interessa. */
const pacote = (over: Partial<LinhaSessao> = {}): LinhaSessao => ({
  origem: "pacote",
  paciente_id: "p1",
  paciente_nome: "MARIA DA SILVA",
  prontuario: "0012345",
  procedimento: "FISIOTERAPIA (5 SESSOES)",
  profissional: "DRA. ANA",
  total_sessoes: 5,
  realizadas: 2,
  faltas: 0,
  restantes: 3,
  valor_contratado: 200,
  valor_pago: 200,
  situacao_financeira: "pago",
  ultima_data: "2026-08-20",
  proxima_data: "2026-09-10",
  dias_parado: 0,
  pendencia: "Próxima em 10/09/2026",
  ...over,
});

/** Manutenção de aparelho: cobrada por visita, sem total contratado. */
const ciclo = (over: Partial<LinhaSessao> = {}): LinhaSessao => ({
  origem: "ciclo",
  paciente_id: "p2",
  paciente_nome: "JOAO PEREIRA",
  prontuario: "0067890",
  procedimento: "MANUTENCAO",
  profissional: "DR. CARLOS",
  total_sessoes: 0,
  realizadas: 3,
  faltas: 0,
  restantes: 0,
  valor_contratado: 0,
  valor_pago: 285,
  situacao_financeira: "por_visita",
  ultima_data: "2026-07-09",
  proxima_data: null,
  dias_parado: 56,
  pendencia: "Atrasado — 56 dias sem manutenção",
  ...over,
});

describe("busca ativa", () => {
  it("não cobra busca ativa de quem já tem data futura marcada", () => {
    expect(precisaBuscaAtiva(pacote({ proxima_data: "2026-09-10" }))).toBe(false);
    expect(precisaBuscaAtiva(ciclo({ proxima_data: "2026-10-01" }))).toBe(false);
  });

  it("aponta o pacote com sessão sobrando e sem agendamento", () => {
    expect(precisaBuscaAtiva(pacote({ proxima_data: null, restantes: 3 }))).toBe(true);
  });

  it("não persegue pacote já concluído", () => {
    expect(precisaBuscaAtiva(pacote({ proxima_data: null, restantes: 0 }))).toBe(false);
  });

  it("aponta a manutenção sem próxima data, mesmo sem sessão sobrando", () => {
    // O ciclo não tem fim: `restantes` é sempre 0 e não pode ser o critério.
    expect(precisaBuscaAtiva(ciclo({ proxima_data: null, restantes: 0 }))).toBe(true);
  });
});

describe("pendência financeira", () => {
  it("acusa pacote em aberto e parcial", () => {
    expect(temPendenciaFinanceira(pacote({ situacao_financeira: "aberto" }))).toBe(true);
    expect(temPendenciaFinanceira(pacote({ situacao_financeira: "parcial" }))).toBe(true);
  });

  it("não acusa pacote pago", () => {
    expect(temPendenciaFinanceira(pacote({ situacao_financeira: "pago" }))).toBe(false);
  });

  it("NUNCA acusa manutenção: faltar não gera dívida na ortodontia", () => {
    // Regra de negócio do dono: quem não compareceu no mês não deve
    // retroativo. Se este teste cair, o relatório passou a cobrar por
    // atendimento que nunca aconteceu.
    expect(temPendenciaFinanceira(ciclo({ valor_pago: 0, dias_parado: 300 }))).toBe(false);
  });
});

describe("filtros", () => {
  const base = [
    pacote(),
    pacote({ paciente_id: "p3", proxima_data: null, situacao_financeira: "aberto", valor_pago: 0 }),
    ciclo(),
  ];

  it("separa pacotes de manutenções", () => {
    expect(filtrarSessoes(base, "pacotes")).toHaveLength(2);
    expect(filtrarSessoes(base, "ciclos")).toHaveLength(1);
    expect(filtrarSessoes(base, "todos")).toHaveLength(3);
  });

  it("a busca ativa junta pacote sem agenda e manutenção parada", () => {
    const r = filtrarSessoes(base, "faltosos");
    expect(r.map((l) => l.paciente_id).sort()).toEqual(["p2", "p3"]);
  });

  it("a pendência financeira deixa a manutenção de fora", () => {
    const r = filtrarSessoes(base, "financeiro");
    expect(r.map((l) => l.paciente_id)).toEqual(["p3"]);
  });
});

describe("apresentação da linha", () => {
  it('mostra "2/5" no pacote', () => {
    expect(rotuloSessoes(pacote({ realizadas: 2, total_sessoes: 5 }))).toBe("2/5");
  });

  it("mostra visitas na manutenção, e nunca um total contratado que não existe", () => {
    expect(rotuloSessoes(ciclo({ realizadas: 3 }))).toBe("3 visitas");
    expect(rotuloSessoes(ciclo({ realizadas: 1 }))).toBe("1 visita");
  });

  it("deixa Contratado e A fazer vazios na manutenção, em vez de zero", () => {
    // Zero nessas colunas leria como "contratou R$ 0,00" e "não falta nada".
    const l = linhaExibida(ciclo());
    expect(l.valor_contratado).toBeNull();
    expect(l.restantes).toBeNull();
  });

  it("toda coluna declarada existe na linha exibida", () => {
    const l = linhaExibida(pacote());
    for (const c of COLUNAS_SESSOES) expect(Object.hasOwn(l, c.chave)).toBe(true);
  });

  it("linhasSessoes aplica o filtro antes de formatar", () => {
    expect(linhasSessoes([pacote(), ciclo()], "ciclos")).toHaveLength(1);
  });
});

describe("totais", () => {
  it("soma contratado só dos pacotes e recebido de todos", () => {
    const t = totaisSessoes([pacote(), ciclo()]);
    expect(t.pacotes).toBe(1);
    expect(t.ciclos).toBe(1);
    expect(t.contratado).toBe(200);
    expect(t.recebido).toBe(485);
    expect(t.sessoesContratadas).toBe(5);
  });

  it("NÃO soma visita de manutenção com sessão de pacote", () => {
    // O defeito que isto trava: com um pacote de 10 sessões (nenhuma feita) e
    // 30 visitas de manutenção, o cartão exibia "30 realizadas de 10
    // contratadas". As duas naturezas não se somam — manutenção não tem total
    // contratado nenhum.
    const t = totaisSessoes([
      pacote({ total_sessoes: 10, realizadas: 0, restantes: 10 }),
      ciclo({ realizadas: 12 }),
      ciclo({ realizadas: 18 }),
    ]);
    expect(t.sessoesContratadas).toBe(10);
    expect(t.sessoesRealizadas).toBe(0);
    expect(t.visitasManutencao).toBe(30);
  });

  it("separa falta de pacote de falta de manutenção, mas soma a coluna", () => {
    // `faltasColuna` existe para o rodapé fechar com o que está impresso na
    // coluna Faltas, que traz as duas naturezas.
    const t = totaisSessoes([pacote({ faltas: 2 }), ciclo({ faltas: 3 })]);
    expect(t.faltasPacote).toBe(2);
    expect(t.faltasManutencao).toBe(3);
    expect(t.faltasColuna).toBe(5);
  });

  it("sessões a fazer conta só pacote, para bater com a coluna A fazer", () => {
    const t = totaisSessoes([pacote({ restantes: 3 }), pacote({ restantes: 4 }), ciclo()]);
    expect(t.sessoesRestantes).toBe(7);
  });

  it("saldo a receber ignora a manutenção", () => {
    // A manutenção tem valor_contratado 0; se entrasse na conta, um paciente
    // parado há meses viraria saldo devedor.
    const t = totaisSessoes([ciclo({ valor_pago: 0 })]);
    expect(t.emAberto).toBe(0);
  });

  it("saldo a receber do pacote é o que falta, nunca negativo", () => {
    const t = totaisSessoes([
      pacote({ valor_contratado: 200, valor_pago: 50 }),
      pacote({ valor_contratado: 200, valor_pago: 250 }),
    ]);
    expect(t.emAberto).toBe(150);
  });

  it("conta quem precisa de busca ativa", () => {
    const t = totaisSessoes([pacote({ proxima_data: null }), pacote(), ciclo()]);
    expect(t.buscaAtiva).toBe(2);
  });
});

describe("modo movimento", () => {
  it("o seletor só troca de modo na opção de movimento", () => {
    // As outras opções são recorte em memória da mesma lista; movimento é
    // outra consulta. Se isto quebrar, alternar entre as visões passa a
    // reaproveitar o resultado do modo errado.
    expect(modoDoFiltro("movimento")).toBe("movimento");
    for (const f of ["todos", "pacotes", "ciclos", "faltosos", "financeiro"] as const) {
      expect(modoDoFiltro(f)).toBe("posicao");
    }
  });

  it("não escreve '3/5' num pacote quando a folha é do período", () => {
    // "3/5" leria como se o pacote inteiro coubesse no mês consultado.
    const l = pacote({ realizadas: 3, total_sessoes: 5 });
    expect(rotuloSessoes(l, "posicao")).toBe("3/5");
    expect(rotuloSessoes(l, "movimento")).toBe("3 sessões");
    expect(rotuloSessoes(pacote({ realizadas: 1 }), "movimento")).toBe("1 sessão");
  });

  it("as colunas do período largam o que descreve o pacote inteiro", () => {
    const chaves = colunasSessoes("movimento").map((c) => c.chave);
    for (const fora of ["valor_contratado", "restantes", "situacao", "dias_parado"]) {
      expect(chaves).not.toContain(fora);
    }
    expect(chaves).toContain("valor_pago");
    expect(chaves).toContain("sessoes");
  });

  it("o quadro do período não mostra contratadas nem saldo zerados", () => {
    // No movimento esses campos vêm 0 do banco de propósito; exibi-los faria a
    // folha dizer "0 a fazer" e "nada a receber", que não é verdade.
    const t = totaisSessoes([pacote({ total_sessoes: 0, restantes: 0, valor_contratado: 0 })]);
    const rotulos = resumoSessoes(t, "movimento").map((i) => i.rotulo);
    expect(rotulos).not.toContain("Sessões contratadas");
    expect(rotulos).not.toContain("Sessões a fazer");
    expect(rotulos.some((r) => r.includes("Saldo"))).toBe(false);
    expect(rotulos).toContain("Recebido no período");
  });
});
