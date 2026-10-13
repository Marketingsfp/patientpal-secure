/**
 * FASE 3 — todos os consumidores usam a identidade publicada.
 */
import { describe, expect, it } from "bun:test";
import { avaliarSaudacao, checarElementosSaudacao } from "../saudacao-sessao";
import {
  avisoTransferenciaHumano,
  nomeCompletoEstabelecimento,
  resolverIdentidadeEfetiva,
  textoApresentacaoIA,
  valoresIdentidade,
} from "../identidade-efetiva";
import {
  promptMensagemHandoff,
  montarMensagemHandoffFallback,
  validarMensagemHandoff,
} from "@/lib/atendimento/mensagem-handoff";

const BLOCO = [
  "[IDENTIDADE DO ATENDIMENTO]",
  "Nome da atendente virtual: Sofia",
  "Nome do estabelecimento: Santa Marta",
  "Tipo do estabelecimento: Clínica",
  "[/IDENTIDADE DO ATENDIMENTO]",
].join("\n");

describe("saudação segue a identidade publicada, não a palavra Nina", () => {
  it("aceita apresentação com o novo nome publicado", () => {
    const texto =
      "Bom dia! Sou a Sofia, eu sou inteligência artificial da Clínica Santa Marta. Como posso te ajudar?";
    const d = avaliarSaudacao(texto, { assistente: "Sofia", estabelecimento: "Santa Marta" });
    expect(d.completa).toBe(true);
    expect(d.saudacaoAusente).toBe(false);
  });

  it("não exige a palavra Nina quando a identidade publicada é outra", () => {
    const texto =
      "Bom dia! Sou a Sofia, eu sou inteligência artificial da Clínica Santa Marta. Como posso te ajudar?";
    expect(checarElementosSaudacao(texto, { assistente: "Sofia" }).assistente).toBe(true);
    expect(/nina/i.test(texto)).toBe(false);
  });

  it("sem identidade publicada não reprova por nome", () => {
    const texto =
      "Bom dia! Eu sou inteligência artificial deste atendimento. Como posso te ajudar?";
    const d = avaliarSaudacao(texto, { assistente: null, estabelecimento: null });
    expect(d.elementos.assistente).toBe(true);
    expect(d.completa).toBe(true);
  });
});

describe("composição do nome do estabelecimento", () => {
  it("monta a apresentação como IA com os nomes publicados", () => {
    expect(
      textoApresentacaoIA(
        {
          assistente: "Sofia",
          estabelecimento: "Menino Jesus",
          tipoEstabelecimento: "Policlínica",
        },
        // 13:33 em Brasília.
        new Date("2026-09-05T16:33:00Z"),
      ),
    ).toBe("Boa tarde! Me chamo Sofia, sou a inteligência artificial da Policlínica Menino Jesus.");
  });

  it("não duplica o tipo já presente na grafia configurada", () => {
    expect(
      nomeCompletoEstabelecimento({
        estabelecimento: "Policlínica Menino Jesus",
        tipoEstabelecimento: "Policlínica",
      }),
    ).toBe("Policlínica Menino Jesus");
  });

  it("compõe quando o nome não traz o tipo", () => {
    expect(
      nomeCompletoEstabelecimento({
        estabelecimento: "Santa Marta",
        tipoEstabelecimento: "Clínica",
      }),
    ).toBe("Clínica Santa Marta");
    const efetiva = resolverIdentidadeEfetiva({
      template: BLOCO,
      origem: "publicada",
      versao: 9,
      versaoId: "v9",
    });
    expect(valoresIdentidade(efetiva)["${nomeUnidade}"]).toBe("Clínica Santa Marta");
  });
});

describe("mensagem de transferência recebe a identidade efetiva", () => {
  it("usa o nome publicado no prompt do texto de handoff", () => {
    const p = promptMensagemHandoff({
      protocolo: "MJ-77",
      identidade: { assistente: "Sofia", estabelecimento: "Santa Marta" },
    });
    expect(p).toContain("Você é Sofia");
    expect(p).toContain("Santa Marta");
    expect(p).not.toContain("Nina");
  });

  it("sem identidade publicada o prompt é neutro, sem persona fixa", () => {
    const p = promptMensagemHandoff({ protocolo: "MJ-77" });
    expect(p).toContain("Você é a assistente virtual");
    expect(p).not.toContain("Nina");
  });

  it("contingência continua com protocolo, equipe e mesmo canal", () => {
    const texto = montarMensagemHandoffFallback({ protocolo: "MJ-77", motivo: "agendamento" });
    expect(validarMensagemHandoff(texto, { protocolo: "MJ-77" }).ok).toBe(true);
  });
});

describe("aviso fixo de transferência usa a identidade publicada", () => {
  const publicada = {
    ok: true,
    apresentacao: {
      assistente: "Sofia",
      estabelecimento: "Santa Marta",
      tipoEstabelecimento: "Clínica",
    },
  };

  it("cita o nome publicado da assistente, nunca Nina", () => {
    const aviso = avisoTransferenciaHumano(publicada);
    expect(aviso).toContain(
      "Você não está mais falando com Sofia, a inteligência artificial do atendimento",
    );
    expect(aviso).toStartWith("*Transferido para atendimento humano.*");
    expect(aviso).not.toContain("Nina");
  });

  it("sem identidade válida o aviso é neutro", () => {
    const aviso = avisoTransferenciaHumano({ ...publicada, ok: false });
    expect(aviso).toContain(
      "Você não está mais falando com a inteligência artificial do atendimento",
    );
    expect(aviso).not.toContain("Sofia");
    expect(aviso).not.toContain("Nina");
  });
});
