import { describe, expect, test } from "bun:test";
import { resumoDecisaoNina, type LinhaResumoDecisao } from "../catalogo-resumo-decisao";

const atendimento = (nome: string, extra: Record<string, unknown> = {}) => ({
  id: nome.toLowerCase(),
  nome,
  especialidade: "ORTOPEDIA",
  horarios: [],
  executantes: [],
  precos: [],
  ...extra,
});
const linha = (linhas: LinhaResumoDecisao[], campo: LinhaResumoDecisao["campo"]) =>
  linhas.find((l) => l.campo === campo)!;

describe("resumo do que decide a conduta da Nina", () => {
  test("profissional completo que a Nina agenda", () => {
    const r = resumoDecisaoNina(
      {
        nome: "Profissional Teste",
        medico_id: "00000000-0000-0000-0000-000000000001",
        estrutura: {
          nina_pode_agendar: true,
          encaminhamento_humano: false,
          pedido_medico: "dispensado",
          atendimentos: [
            atendimento("CONSULTA", {
              modalidade: "hora_marcada",
              horarios: [{ dia: "Sábado", inicio: "08:30", fim: "12:00" }],
              precos: [
                { forma: "Dinheiro", valor: 120 },
                { forma: "Pix/cartão", valor: 145 },
              ],
            }),
          ],
        },
      },
      "profissional",
    );
    expect(linha(r, "decisao").valor).toBe("Agenda");
    expect(linha(r, "modalidade")).toMatchObject({ valor: "Hora marcada", preenchido: true });
    expect(linha(r, "horarios")).toMatchObject({ valor: "Sábado 08:30–12:00", preenchido: true });
    expect(linha(r, "valores").valor).toContain("Dinheiro");
    expect(linha(r, "valores").valor).toContain("Pix/cartão");
    expect(r.every((l) => l.preenchido)).toBe(true);
  });

  test("lacunas aparecem por atendimento e como não preenchidas", () => {
    const r = resumoDecisaoNina(
      {
        nome: "Profissional Teste",
        estrutura: {
          atendimentos: [
            atendimento("CONSULTA", {
              modalidade: "hora_marcada",
              horarios: [{ dia: "Sábado", inicio: "08:30", fim: "12:00" }],
            }),
            atendimento("REVISAO"),
          ],
        },
      },
      "profissional",
    );
    expect(linha(r, "decisao").valor).toBe("Informa e encaminha à equipe");
    expect(linha(r, "nina_pode_agendar")).toMatchObject({
      valor: "Não informado",
      preenchido: false,
    });
    expect(linha(r, "modalidade")).toMatchObject({
      valor: "CONSULTA: Hora marcada · REVISAO: não informada",
      preenchido: false,
    });
    expect(linha(r, "horarios")).toMatchObject({
      valor: "Sábado 08:30–12:00 · sem horário: REVISAO",
      preenchido: false,
    });
    expect(linha(r, "valores")).toMatchObject({ valor: "não informados", preenchido: false });
    expect(linha(r, "pedido_medico").preenchido).toBe(false);
    // Sem "Nina pode agendar", a falta de vínculo com a agenda não é lacuna.
    expect(linha(r, "agenda")).toMatchObject({ valor: "Sem vínculo", preenchido: true });
  });

  test("exame usa os horários de quem realiza e a conduta respeita o encaminhamento", () => {
    const r = resumoDecisaoNina(
      {
        nome: "Exame Teste",
        estrutura: {
          nina_pode_agendar: true,
          encaminhamento_humano: true,
          atendimentos: [
            atendimento("EXAME", {
              modalidade: "chegada_sem_pre_agendamento",
              executantes: [
                {
                  nome: "Executante Teste",
                  horarios: [{ dia: "Segunda-feira", inicio: "07:00", fim: "10:00" }],
                },
              ],
              situacao_preco: "sob_consulta",
            }),
          ],
        },
      },
      "servico",
    );
    expect(linha(r, "decisao").valor).toBe("Encaminha à equipe (encaminhamento obrigatório)");
    expect(linha(r, "horarios").valor).toBe("Segunda-feira 07:00–10:00");
    expect(linha(r, "valores")).toMatchObject({ valor: "sob consulta", preenchido: true });
    expect(linha(r, "agenda")).toMatchObject({
      valor: "Sem vínculo (necessário para a Nina agendar)",
      preenchido: false,
    });
  });

  test("cadastro no formato antigo lê as colunas de sempre", () => {
    const r = resumoDecisaoNina(
      {
        nome: "Profissional Teste",
        tipo_atendimento: "Ordem de chegada",
        horarios: [],
        formas_pagamento: [{ forma: "Dinheiro", valor: 100 }],
        estrutura: {},
      },
      "profissional",
    );
    expect(linha(r, "horarios")).toMatchObject({ valor: "Não informados", preenchido: false });
    expect(linha(r, "valores").preenchido).toBe(true);
  });
});
