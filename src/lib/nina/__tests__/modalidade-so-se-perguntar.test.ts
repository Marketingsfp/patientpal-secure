import { describe, expect, test } from "bun:test";
import {
  pacientePerguntouModalidade,
  removerModalidadeNaoPerguntada,
} from "../modalidade-nao-informada";

describe("modalidade só quando o paciente pergunta", () => {
  test("reconhece a pergunta sobre a forma de atendimento", () => {
    expect(pacientePerguntouModalidade("É por ordem de chegada ou fica um horário certinho?")).toBe(
      true,
    );
    expect(pacientePerguntouModalidade("Precisa marcar ou é só chegar?")).toBe(true);
    expect(pacientePerguntouModalidade("Como funciona o atendimento com ela?")).toBe(true);
    expect(
      pacientePerguntouModalidade("Oi! Queria informações sobre a consulta de endocrinologia."),
    ).toBe(false);
    expect(pacientePerguntouModalidade("Quanto custa?")).toBe(false);
  });

  test("tira a frase sobre a forma de atendimento e mantém o resto", () => {
    const texto =
      "Temos atendimento em Nutrição! Veja os detalhes da consulta:\n*Valores:* Dinheiro: R$ 120,00\n*Profissionais e horários habituais:* • Dra. Paciente Teste Sábado: 08:00 às 11:00\nA forma de atendimento (se horário marcado ou ordem de chegada) é informada pela nossa equipe de atendimento.\nVocê tem interesse em agendar a consulta?";
    expect(removerModalidadeNaoPerguntada(texto)).toBe(
      "Temos atendimento em Nutrição! Veja os detalhes da consulta:\n*Valores:* Dinheiro: R$ 120,00\n*Profissionais e horários habituais:* • Dra. Paciente Teste Sábado: 08:00 às 11:00\nVocê tem interesse em agendar a consulta?",
    );
  });

  test("remove linhas e rótulos de modalidade", () => {
    expect(
      removerModalidadeNaoPerguntada(
        "*Horário:* Sábado\n*Modalidade:* Hora marcada\n*Valor:* R$ 120,00",
      ),
    ).toBe("*Horário:* Sábado\n*Valor:* R$ 120,00");
    expect(removerModalidadeNaoPerguntada("• Modalidade: Hora marcada\nAtende às quintas.")).toBe(
      "Atende às quintas.",
    );
    expect(
      removerModalidadeNaoPerguntada(
        "*Profissional:* Dra. Paciente Teste *Horário habitual:* Sábado, das 09:00 às 11:00 *Modalidade:* Agendamento prévio com horário marcado",
      ),
    ).toBe("*Profissional:* Dra. Paciente Teste *Horário habitual:* Sábado, das 09:00 às 11:00");
  });

  test("tira só o trecho da modalidade numa frase com dias e horários", () => {
    expect(
      removerModalidadeNaoPerguntada(
        "A Dra. Paciente Teste atende consultas de ortopedia aos sábados, das 08h30 às 12h00, na modalidade de hora marcada.",
      ),
    ).toBe("A Dra. Paciente Teste atende consultas de ortopedia aos sábados, das 08h30 às 12h00.");
    expect(removerModalidadeNaoPerguntada("- Sexta-feira: 13:00 às 16:30 (ordem de chegada)")).toBe(
      "- Sexta-feira: 13:00 às 16:30",
    );
  });

  test("texto sem modalidade fica igual e a resposta nunca fica vazia", () => {
    const t = "Atendemos às quintas, das 10:30 às 13:00. Valor: R$ 145,00.";
    expect(removerModalidadeNaoPerguntada(t)).toBe(t);
    const so = "A forma de atendimento é informada pela nossa equipe.";
    expect(removerModalidadeNaoPerguntada(so)).toBe(so);
  });
});
