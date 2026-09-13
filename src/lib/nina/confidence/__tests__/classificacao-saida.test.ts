import { describe, expect, it } from "bun:test";

import {
  classificarSaida,
  podeExibirPorcentagem,
  ROTULO_ESTADO_AVISO,
  ROTULO_ESTADO_ENTREGA,
} from "../classificacao-saida";

const base = {
  carregou: true,
  avisoOperacional: false,
  temAvaliacao: true,
  avaliacaoAplicavel: true,
};

describe("o que a bolha é", () => {
  it("resposta avaliada quando a nota é do conteúdo entregue", () => {
    const r = classificarSaida({ ...base, motivoVinculo: "vinculo_exato" });
    expect(r.classe).toBe("resposta_avaliada");
    expect(podeExibirPorcentagem(r.classe)).toBe(true);
  });

  it("aviso do sistema nunca exibe porcentagem, mesmo com avaliação no turno", () => {
    const r = classificarSaida({ ...base, avisoOperacional: true });
    expect(r.classe).toBe("aviso_operacional");
    expect(podeExibirPorcentagem(r.classe)).toBe(false);
    expect(r.explicacao).toContain("não tem porcentagem");
  });

  it("texto alterado depois da avaliação explica que a nota é de outro texto", () => {
    const r = classificarSaida({
      ...base,
      avaliacaoAplicavel: false,
      motivoVinculo: "conteudo_divergente",
    });
    expect(r.classe).toBe("texto_alterado");
    expect(r.explicacao).toContain("pertence a outro conteúdo");
    expect(podeExibirPorcentagem(r.classe)).toBe(false);
  });

  it("sem avaliação registrada quando nada foi gravado", () => {
    const r = classificarSaida({ ...base, temAvaliacao: false, avaliacaoAplicavel: false });
    expect(r.classe).toBe("sem_avaliacao");
  });

  it("falha ao carregar não é confundida com ausência de avaliação", () => {
    const r = classificarSaida({ ...base, carregou: false });
    expect(r.classe).toBe("falha_ao_carregar");
    expect(r.explicacao).toContain("Não foi possível carregar");
  });

  it("declara a limitação de registro antigo sem apagar a nota", () => {
    const r = classificarSaida({ ...base, motivoVinculo: "registro_antigo_sem_hash" });
    expect(r.classe).toBe("resposta_avaliada");
    expect(r.limitacao).toContain("Registro antigo");
  });

  it("dá motivo específico para outra forma de entrega e outro escopo", () => {
    expect(
      classificarSaida({ ...base, avaliacaoAplicavel: false, motivoVinculo: "outra_representacao" })
        .explicacao,
    ).toContain("outra forma de entrega");
    expect(
      classificarSaida({ ...base, avaliacaoAplicavel: false, motivoVinculo: "outro_escopo" })
        .explicacao,
    ).toContain("outra conversa");
  });

  it("registro incompleto informa a limitação sem fabricar vínculo", () => {
    const r = classificarSaida({
      ...base,
      avaliacaoAplicavel: false,
      motivoVinculo: "vinculo_incompleto",
    });
    expect(r.classe).toBe("sem_avaliacao");
    expect(r.limitacao).toContain("faltam vínculos");
  });
});

describe("estados em linguagem do dia a dia", () => {
  it("traduz encaminhamento e entrega", () => {
    expect(ROTULO_ESTADO_AVISO["confirmado"]).toBe("Entregue ao paciente");
    expect(ROTULO_ESTADO_AVISO["incerto"]).toBe("Resultado desconhecido");
    expect(ROTULO_ESTADO_ENTREGA["confirmada"]).toBe("Confirmada pelo transporte");
  });
});
