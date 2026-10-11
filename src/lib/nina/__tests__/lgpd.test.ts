import { describe, expect, test } from "bun:test";
import { anonimizar } from "../aprendizado.server";
import { REGRA_LGPD_NINA } from "../lgpd";
import { resolverPrecedenciaDoTurno } from "../prompt/precedencia-turno";

describe("LGPD da Nina", () => {
  test("aplica a proteção no contrato mesmo sem prompt publicado", () => {
    const resultado = resolverPrecedenciaDoTurno({
      textoPublicado: "",
      escopo: "whatsapp",
      mensagemPaciente: "Quero saber meus dados",
      ambiente: "producao",
      saudacaoObrigatoria: false,
      regrasPublicadasNoPrompt: true,
    });

    expect(resultado.resultado.vigentes).toContainEqual(
      expect.objectContaining({ codigo: "PRIVACIDADE_PACIENTE", nivel: "inegociavel" }),
    );
    expect(resultado.contrato).toContain("PRIVACIDADE_DIREITOS");
    expect(resultado.contrato).toContain("PRIVACIDADE_INCIDENTE");
    expect(resultado.contrato).toContain("eu sou inteligência artificial");
    expect(resultado.contrato).toContain("Não diga “eu sou uma inteligência artificial”");
    expect(resultado.contrato).toContain("nome da clínica definidos na identidade publicada");
  });

  test("preserva agendamento de dependentes sem liberar dados já existentes", () => {
    expect(REGRA_LGPD_NINA).toContain(
      "agendar para filha, filho, dependente ou outra pessoa continua permitido",
    );
    expect(REGRA_LGPD_NINA).toContain("Isso não autoriza revelar histórico");
    expect(REGRA_LGPD_NINA).toContain("telefone isolado");
  });

  test("remove identificadores explícitos das sugestões de aprendizado", () => {
    const original =
      "Paciente: Maria da Silva, CPF 123.456.789-00, telefone (22) 99999-8888, " +
      "email maria@example.com, nascimento 1990-04-12, prontuário ABC-12345, " +
      "CEP 25600-000 e id 123e4567-e89b-42d3-a456-426614174000.";
    const seguro = anonimizar(original);

    for (const dado of [
      "Maria da Silva",
      "123.456.789-00",
      "99999-8888",
      "maria@example.com",
      "1990-04-12",
      "ABC-12345",
      "25600-000",
      "123e4567-e89b-42d3-a456-426614174000",
    ]) {
      expect(seguro).not.toContain(dado);
    }
    expect(seguro).toContain("[NOME]");
    expect(seguro).toContain("[CPF]");
    expect(seguro).toContain("[IDENTIFICADOR]");
  });
});
