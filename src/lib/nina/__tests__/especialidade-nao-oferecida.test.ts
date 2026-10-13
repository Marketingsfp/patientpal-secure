import { describe, expect, test } from "bun:test";
import { especialidadeNaoOferecida } from "../jev-especialidade";
import {
  avisoEspecialidadeNaoOferecida,
  encaminhamentoEspecialidadeNaoOferecida,
} from "../catalogo-sem-registro";
import { pendenciasAPerguntar } from "../perguntas-independentes";
import type { ConhecimentoSessao } from "../confidence/conhecimento-sessao";

const OPCOES = ["CARDIOLOGIA", "NEUROLOGIA", "ORTOPEDIA"];

describe("especialidade que a clínica não oferece", () => {
  test("Jev responde 'nenhuma' com confiança alta: não oferecida", () => {
    expect(especialidadeNaoOferecida({ choice: "nenhuma", confidence: 1 } as never, OPCOES)).toBe(
      true,
    );
    // Confiança baixa, outra escolha ou lista vazia não concluem nada.
    expect(especialidadeNaoOferecida({ choice: "nenhuma", confidence: 0.6 } as never, OPCOES)).toBe(
      false,
    );
    expect(
      especialidadeNaoOferecida({ choice: "NEUROLOGIA", confidence: 1 } as never, OPCOES),
    ).toBe(false);
    expect(especialidadeNaoOferecida({ choice: "nenhuma", confidence: 1 } as never, [])).toBe(
      false,
    );
  });

  test("a busca com a limitação vira encaminhamento à recepção com aviso ao paciente", () => {
    const r = {
      success: true,
      dados: {
        limitacao_catalogo: { codigo: "ESPECIALIDADE_NAO_OFERECIDA", pedido: "pneumologia" },
      },
    };
    const enc = encaminhamentoEspecialidadeNaoOferecida(r as never);
    expect(enc?.motivo).toBe("ESPECIALIDADE_NAO_OFERECIDA: pneumologia");
    expect(enc?.resumo).toContain("recepção");
    expect(avisoEspecialidadeNaoOferecida(enc!.motivo)).toBe(
      "Não temos atendimento de Pneumologia aqui na clínica.",
    );
    // Outras limitações e resultados comuns não encaminham por aqui.
    expect(
      encaminhamentoEspecialidadeNaoOferecida({
        success: true,
        dados: { limitacao_catalogo: { codigo: "SEM_ATENDIMENTO_NO_DIA", pedido: "x" } },
      } as never),
    ).toBeNull();
    expect(avisoEspecialidadeNaoOferecida("CATALOGO_SEM_REGISTRO: x")).toBeNull();
  });

  test("o mesmo pedido pesquisado de jeitos diferentes vira uma pergunta só", () => {
    const pendencia = (termo: string): ConhecimentoSessao => ({
      versao: 1,
      clinicaId: "c",
      sessionId: "s",
      consulta: { termo, medico: "", tipo_atendimento: "consulta" },
      referencias: [],
      esclarecimento: { tipo: "procedimento", opcoes: [], pergunta: `Não encontrei "${termo}".` },
      esclarecimentoTentativas: 1,
    });
    const lista = [pendencia("pneumologia"), pendencia("PNEUMOLOGIA"), pendencia("pneumo")];
    expect(pendenciasAPerguntar("", lista)).toHaveLength(1);
    // Pedidos diferentes continuam com a sua pergunta.
    expect(
      pendenciasAPerguntar("", [pendencia("pneumologia"), pendencia("angiologia")]),
    ).toHaveLength(2);
  });
});
