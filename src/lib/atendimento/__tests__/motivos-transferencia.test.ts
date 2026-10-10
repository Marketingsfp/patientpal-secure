import { describe, expect, it } from "bun:test";
import { motivoParaAtendimento } from "../texto-interno-apresentacao";
import { textoMarcadorSistema } from "../marcador-handoff";
import {
  evidenciaRegraHumano,
  motivoRegraHumano,
  resultadoExigeHumano,
} from "@/lib/nina/regras-catalogo";

describe("causa interna de transferência", () => {
  for (const [codigo, explicacao] of [
    ["PROFISSIONAL_SFP", "Regra SFP"],
    ["MULTIPLOS_ATENDIMENTOS", "dois ou mais atendimentos"],
    ["CATALOGO_ATENDIMENTO_HUMANO", "cadastro consultado exige"],
    ["JEV_URGENCIA_CLINICA", "possível urgência"],
    ["JEV_PEDIDO_ATENDENTE", "pedido do paciente"],
    ["JEV_IRRITACAO", "irritação"],
    ["JEV_DUVIDA_REPETIDA", "dificuldade persistente"],
    ["FOTO_NAO_LIDA_APOS_NOVA_TENTATIVA", "nova foto"],
    ["FOTO_FALHA_TECNICA_PERSISTENTE", "Falha técnica no processamento da foto"],
    ["FOTO_REQUER_AVALIACAO_HUMANA", "avaliação humana"],
    ["VAGA_ESCOLHIDA_INDISPONIVEL", "reserva da vaga"],
    ["NINA_PROCESSING_FAILED", "falhou definitivamente"],
    ["LIMITE_RODADAS", "limite de etapas"],
    ["MOTIVO_NAO_INFORMADO", "não informou o motivo"],
    ["patient_response_timeout", "30 minutos"],
    ["CATALOGO_SEM_REGISTRO", "não encontrou a consulta"],
    ["CATALOGO_MEDICO_SEM_REGISTRO", "não encontrou o médico"],
    ["CATALOGO_MEDICO_NAO_IDENTIFICADO", "identificar o médico"],
    ["CATALOGO_IDENTIFICACAO_NAO_ESCLARECIDA", "pediu esclarecimento"],
    ["AGENDA_SEM_VAGAS", "não encontrou vagas"],
    ["FALHA_OPERACIONAL_AGENDAMENTO", "falha operacional"],
    ["MODALIDADE_NAO_DEFINIDA", "modalidade de agendamento"],
    ["MODALIDADE_ALTERADA", "mudou após a escolha"],
  ])
    it(codigo!, () => expect(motivoParaAtendimento("[Outro] " + codigo)).toContain(explicacao!));

  it("preserva detalhes úteis e não vaza erros ou payloads", () => {
    expect(
      motivoParaAtendimento(
        "MULTIPLOS_ATENDIMENTOS: o paciente enviou pedido médico com 2 exames (ECG; TSH).",
      ),
    ).toContain("2 exames (ECG; TSH)");
    expect(motivoParaAtendimento("PROFISSIONAL_SFP: Eletrocardiograma")).toContain(
      "Eletrocardiograma",
    );
    expect(
      motivoParaAtendimento("CATALOGO_ATENDIMENTO_HUMANO / PROFISSIONAL_SFP: Eletrocardiograma"),
    ).toContain("Regra SFP");
    expect(motivoParaAtendimento("Confirmar recebimento de pagamento")).toBe(
      "Confirmar recebimento de pagamento",
    );
    expect(motivoParaAtendimento("NINA_PROCESSING_FAILED: Error {segredo:123}")).not.toContain(
      "123",
    );
    expect(motivoParaAtendimento("CODIGO_NOVO: Error {segredo:123}")).toContain(
      "detalhes técnicos",
    );
    expect(motivoParaAtendimento(null)).toBeNull();
  });

  it("SFP na seleção confirmada, nunca em outro resultado da busca", () => {
    const records = [
      {
        id: "sfp",
        procedimento: "Exame parceiro",
        medico: "SFP",
        extras: { atendimento_humano_obrigatorio: true },
      },
      {
        id: "ana",
        procedimento: "Consulta",
        medico: "Ana",
        extras: { atendimento_humano_obrigatorio: true },
      },
    ];
    expect(motivoRegraHumano(evidenciaRegraHumano({ records }, ["sfp"]))).toContain(
      "PROFISSIONAL_SFP",
    );
    expect(motivoRegraHumano(evidenciaRegraHumano({ records }, ["ana"]))).not.toContain("SFP");
    expect(motivoRegraHumano(evidenciaRegraHumano({ records }))).not.toContain("SFP");
    expect(motivoRegraHumano([{ nome: "Exame", profissional: "SFP, Ana" }])).not.toContain("SFP");
    expect(motivoRegraHumano([])).not.toContain("SFP");
    expect(resultadoExigeHumano({ records: [{ medico: "SFP" }] })).toBe(false);
  });

  it("marcadores antigos preservam o motivo SFP sem depender de resumo", () => {
    for (const prefixo of [
      "🔁 Conversa transferida da Nina para atendimento humano",
      "🧾 Handoff realizado pela Nina",
    ]) {
      expect(textoMarcadorSistema(prefixo + " · Motivo: PROFISSIONAL_SFP: ECG")).toContain(
        "Regra SFP",
      );
    }
  });
});

it("motivo livre do SFP conserva o procedimento e não sobrepõe outra causa", () => {
  expect(
    motivoParaAtendimento(
      "Profissional SFP exige atendimento humano para Anestesia da Videohisteroscopia",
    ),
  ).toContain("Anestesia da Videohisteroscopia");
  expect(
    motivoParaAtendimento("JEV_URGENCIA_CLINICA: paciente buscava profissional SFP"),
  ).toContain("possível urgência");
});
