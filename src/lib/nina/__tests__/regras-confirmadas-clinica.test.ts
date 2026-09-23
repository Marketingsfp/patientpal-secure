import { describe, expect, test } from "bun:test";
import { modalidadeEstruturada, pendenciasEstrutura, INSTRUCAO_DADOS_CATALOGO } from "../catalogo-estrutura";
import { profissionalParaRegistro } from "../catalogo-conhecimento";
import { REGRA_HORARIOS_PUBLICADOS, REGRA_ANESTESIA_ADICIONAL, REGRA_MODALIDADES_CONFIRMADAS } from "../regras-administrativas-confirmadas";
import { PROMPT_NINA_WHATSAPP_V4 } from "../prompt/behavior-v4";
import { instrucoesCatalogoIA } from "../catalogo-ia";

const atendimento = (nome: string, obs: string, chegada = "Manhã e tarde") =>
  `${nome}\nEspecialidade: CARDIOLOGIA\nProfissional: Alex Louza\nDias e horários: Quarta 13h\nObservação: ${obs}\nPode chegar até que horas: ${chegada}`;

describe("definições confirmadas pela clínica", () => {
  test("modalidade publicada chega ao resultado usado pelas ferramentas da agenda", () => {
    for (const [rotulo, modo] of [["Agendado", "hora_marcada"], ["Ordem de chegada", "chegada_sem_pre_agendamento"], ["Ordem de chegada com pré-agendamento", "chegada_com_pre_agendamento"], ["Ordem de chegada sem pré-agendamento", "chegada_sem_pre_agendamento"]]) {
      const registro = profissionalParaRegistro({ nome: "Alex Louza", tipo_atendimento: "Consulta", observacao_publica: atendimento("CONSULTA CARDIOLOGIA", rotulo!) } as any, "2026-09-21");
      expect(registro.extras?.modalidade_atendimento).toBe(modo);
    }
  });
  test("não estende a modalidade de uma consulta para outra desconhecida", () => {
    const misto = atendimento("CONSULTA CARDIOLOGIA", "Agendado") + "\n\n" + atendimento("CONSULTA CLÍNICO GERAL", "20 vagas");
    expect(modalidadeEstruturada(misto, null, "Alex Louza", "Consulta")).toBe("nao_definida");
    expect(modalidadeEstruturada(atendimento("CONSULTA", "Agendado"), null, "Alex Louza", "Por ficha")).toBe("nao_definida");
    expect(modalidadeEstruturada(atendimento("CONSULTA", "20 vagas"), null, "Sandro", "Consulta")).toBeNull();
  });
  test("ausência de término e limite publicado de Karen não geram horários inventados", () => {
    const registro = profissionalParaRegistro({ nome: "Karen", observacao_publica: atendimento("AVALIAÇÃO ODONTOLÓGICA", "Ordem de chegada", "Até 17h"), horarios: [{ dia: "Sábado", inicio: "08:00", fim: null }] } as any, "2026-09-21");
    expect(registro.observacoes).toContain("Até 17h");
    expect(registro.observacoes).not.toContain("14:00");
    expect(registro.extras?.horarios).toEqual([{ dia: "Sábado", inicio: "08:00", fim: null }]);
  });
  test("anestesia com valor definido deixa de ser ambiguidade, valor ausente continua pendente", () => {
    expect(pendenciasEstrutura(atendimento("EXAME", "R$ 500,00 (anestesia)"), null).some(p => /anestesia/.test(p))).toBe(false);
    expect(pendenciasEstrutura(atendimento("EXAME", "Anestesia a confirmar; procedimento R$ 500,00"), null).some(p => /anestesia/.test(p))).toBe(true);
  });
  test("peso e referência quinzenal continuam pendentes", () => {
    const texto = atendimento("CONSULTA", "Agendado; a cada 15 dias") + "\nIdade/critério informado: 40 kg";
    expect(pendenciasEstrutura(texto, null).join(" ")).toMatch(/40 kg/);
    expect(pendenciasEstrutura(texto, null).join(" ")).toMatch(/recorrência sem data/);
  });
  test("prompt e retorno da ferramenta compartilham as definições sem regra antiga contrária", () => {
    for (const regra of [REGRA_HORARIOS_PUBLICADOS, REGRA_ANESTESIA_ADICIONAL, REGRA_MODALIDADES_CONFIRMADAS]) {
      expect(INSTRUCAO_DADOS_CATALOGO).toContain(regra);
      expect(PROMPT_NINA_WHATSAPP_V4).toContain(regra);
    }
    expect(PROMPT_NINA_WHATSAPP_V4).not.toContain("Valor de anestesia sem condição não autoriza somar");
    expect(PROMPT_NINA_WHATSAPP_V4).not.toContain("'Agendado' ou só 'Ordem de chegada' não definem");
    for (const tipo of ["servico", "profissional"] as const) {
      expect(instrucoesCatalogoIA(tipo)).toContain(REGRA_MODALIDADES_CONFIRMADAS);
      expect(instrucoesCatalogoIA(tipo)).not.toContain("salvo indicação explícita de sem pré-agendamento");
    }
  });
});
