/**
 * FASE 1 — leitura determinística da identidade do atendimento.
 * Nenhuma chamada de IA: só texto publicado.
 */
import { describe, expect, it } from "vitest";
import {
  ABERTURA_IDENTIDADE,
  FECHAMENTO_IDENTIDADE,
  aplicarIdentidadeNoTexto,
  extrairIdentidade,
  montarBlocoIdentidade,
  validarIdentidadeParaPublicacao,
} from "@/lib/nina/identidade-atendimento";

const BLOCO_OK = [
  ABERTURA_IDENTIDADE,
  "Nome da atendente virtual: Nina",
  "Nome do estabelecimento: Menino Jesus",
  "Tipo do estabelecimento: Policlínica",
  FECHAMENTO_IDENTIDADE,
].join("\n");

const PROMPT = `${BLOCO_OK}\n\nVocê atende pacientes pelo WhatsApp.`;

describe("identidade do atendimento", () => {
  it("extrai os três campos do bloco", () => {
    const leitura = extrairIdentidade(PROMPT);
    expect(leitura.ok).toBe(true);
    if (!leitura.ok) return;
    expect(leitura.identidade).toEqual({
      assistente: "Nina",
      estabelecimento: "Menino Jesus",
      tipoEstabelecimento: "Policlínica",
    });
    expect(leitura.bloco).toBe(BLOCO_OK);
  });

  it("aceita espaçamento e caixa diferentes nos rótulos", () => {
    const texto = [
      ABERTURA_IDENTIDADE,
      "  nome da ATENDENTE virtual :  Sol ",
      "Nome do estabelecimento: Clínica Teste",
      "tipo do estabelecimento: Hospital",
      FECHAMENTO_IDENTIDADE,
    ].join("\n");
    const leitura = extrairIdentidade(texto);
    expect(leitura.ok).toBe(true);
    if (!leitura.ok) return;
    expect(leitura.identidade.assistente).toBe("Sol");
    expect(leitura.identidade.tipoEstabelecimento).toBe("Hospital");
  });

  it("reprova bloco ausente com pendência, sem inferir nome", () => {
    const leitura = extrairIdentidade("Prompt antigo sem identidade.");
    expect(leitura.ok).toBe(false);
    if (leitura.ok) return;
    expect(leitura.motivo).toBe("BLOCO_AUSENTE");

    const validacao = validarIdentidadeParaPublicacao("Prompt antigo sem identidade.");
    expect(validacao).toEqual({ ok: true, identidade: null, pendente: true });
  });

  it("reprova bloco duplicado", () => {
    const validacao = validarIdentidadeParaPublicacao(`${BLOCO_OK}\n\n${BLOCO_OK}`);
    expect(validacao.ok).toBe(false);
    if (validacao.ok) return;
    expect(validacao.motivo).toBe("BLOCO_DUPLICADO");
  });

  it("reprova campo ausente e campo vazio", () => {
    const semTipo = [
      ABERTURA_IDENTIDADE,
      "Nome da atendente virtual: Nina",
      "Nome do estabelecimento: Menino Jesus",
      FECHAMENTO_IDENTIDADE,
    ].join("\n");
    const a = extrairIdentidade(semTipo);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.motivo).toBe("CAMPO_AUSENTE");

    const vazio = BLOCO_OK.replace("Nina", " ");
    const b = extrairIdentidade(vazio);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.motivo).toBe("CAMPO_VAZIO");
  });

  it("reprova formato inválido e fechamento ausente", () => {
    const semFechamento = `${ABERTURA_IDENTIDADE}\nNome da atendente virtual: Nina`;
    const a = extrairIdentidade(semFechamento);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.motivo).toBe("FECHAMENTO_AUSENTE");

    const linhaSolta = BLOCO_OK.replace(
      "Tipo do estabelecimento: Policlínica",
      "Tipo do estabelecimento Policlínica",
    );
    const b = extrairIdentidade(linhaSolta);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.motivo).toBe("LINHA_NAO_RECONHECIDA");
  });

  it("formulário e edição direta produzem a mesma identidade", () => {
    const peloFormulario = aplicarIdentidadeNoTexto(PROMPT, {
      assistente: "Aurora",
      estabelecimento: "Menino Jesus",
      tipoEstabelecimento: "Policlínica",
    });
    const naMao = PROMPT.replace(
      "Nome da atendente virtual: Nina",
      "Nome da atendente virtual: Aurora",
    );
    expect(extrairIdentidade(peloFormulario)).toMatchObject(
      extrairIdentidade(naMao) as Record<string, unknown>,
    );
    expect(peloFormulario).toContain("Nome da atendente virtual: Aurora");
    // Uma única fonte: nenhum bloco extra é criado.
    expect(peloFormulario.split(ABERTURA_IDENTIDADE).length - 1).toBe(1);
  });

  it("insere o bloco no topo quando o texto antigo não tem identidade", () => {
    const novo = aplicarIdentidadeNoTexto("Texto antigo.", {
      assistente: "Nina",
      estabelecimento: "Menino Jesus",
      tipoEstabelecimento: "Policlínica",
    });
    expect(novo.startsWith(montarBlocoIdentidade({
      assistente: "Nina",
      estabelecimento: "Menino Jesus",
      tipoEstabelecimento: "Policlínica",
    }))).toBe(true);
    expect(novo).toContain("Texto antigo.");
  });

  it("não adivinha nada quando o bloco está duplicado", () => {
    const duplicado = `${BLOCO_OK}\n\n${BLOCO_OK}`;
    expect(
      aplicarIdentidadeNoTexto(duplicado, {
        assistente: "X",
        estabelecimento: "Y",
        tipoEstabelecimento: "Z",
      }),
    ).toBe(duplicado);
  });
});
