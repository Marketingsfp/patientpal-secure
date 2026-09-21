import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  PUBLICACOES_CONSOLIDADAS,
  gerarMigrationConsolidacao,
  MIGRATION_CONSOLIDACAO,
} from "../../../../scripts/nina/gerar-consolidacao-instrucoes";
import { PROMPT_NINA_WHATSAPP_V4 } from "../prompt/behavior-v4";
import { PROMPT_NINA_PAINEL_INTERNO } from "../prompt/painel-interno";
import { renderizarTemplateInstrucoes, validarTemplateInstrucoes } from "../instrucoes-template";
import { resolverIdentidadeEfetiva, valoresIdentidade } from "../identidade-efetiva";
import { removerEmojisNina } from "../resposta/sem-emojis";
import anteriores from "./fixtures/instrucoes-antes-consolidacao.json";
import { atualizarLimiteEsclarecimento } from "../prompt/limite-esclarecimento";

describe("consolidação da publicação e do fallback", () => {
  it("publica exatamente as regras do fallback, preservando a identidade da versão auditada", () => {
    const nova = PUBLICACOES_CONSOLIDADAS[0]!;
    const identidade = resolverIdentidadeEfetiva({
      template: nova.conteudo,
      origem: "publicada",
      versao: 41,
      versaoId: "nova",
    });
    const antiga = resolverIdentidadeEfetiva({
      template: anteriores.whatsapp.conteudo,
      origem: "publicada",
      versao: 40,
      versaoId: "antiga",
    });
    expect(identidade.identidade).toEqual(antiga.identidade);
    expect(
      atualizarLimiteEsclarecimento(nova.conteudo).split("[/IDENTIDADE DO ATENDIMENTO]\n\n")[1],
    ).toBe(PROMPT_NINA_WHATSAPP_V4);
    const render = renderizarTemplateInstrucoes(nova.conteudo, valoresIdentidade(identidade));
    expect(render.ok).toBe(true);
    if (render.ok) {
      expect(render.texto).not.toContain("${");
      expect(render.texto).toContain("Menino Jesus");
    }
    expect(readFileSync(MIGRATION_CONSOLIDACAO, "utf8")).toBe(gerarMigrationConsolidacao());
  });

  it("restaura o contexto autorizado do painel e preserva texto literal dos dados", () => {
    expect(validarTemplateInstrucoes("painel_interno", anteriores.painel_interno.conteudo).ok).toBe(
      false,
    );
    expect(validarTemplateInstrucoes("painel_interno", PROMPT_NINA_PAINEL_INTERNO).ok).toBe(true);
    const contexto = "CLÍNICA AUTORIZADA\nDados com $& e acentos.";
    const r = renderizarTemplateInstrucoes(PROMPT_NINA_PAINEL_INTERNO, {
      "${contextoTexto}": contexto,
    });
    expect(r.ok && r.texto).toContain(contexto);
    expect(r.ok && r.texto).toContain("permissões do próprio colaborador");
  });

  it("remove as ordens conflitantes e deixa as exceções junto das decisões de atendimento", () => {
    const p = atualizarLimiteEsclarecimento(PUBLICACOES_CONSOLIDADAS[0]!.conteudo);
    for (const antiga of [
      "Não acrescente “a partir de”",
      "mesmo se forem iguais aos de outro",
      "diga que essa forma não é aceita",
      "TESTE-ARQUITETURA-9381",
      "Nenhuma transferência real foi realizada.",
    ]) {
      expect(p).not.toContain(antiga);
    }
    for (const regra of [
      "tipo consulta",
      "não envie a frase inteira",
      "ATÉ DUAS VEZES por solicitação",
      "Mais de quatro profissionais",
      "Se pelo menos um valor ou condição for diferente",
      "primeira data disponível ou deseja escolher outra data",
      "AGENDA_SEM_VAGAS",
      "SFP é sempre silencioso",
      "30 minutos",
      "Pix/cartão",
    ]) {
      expect(p).toContain(regra);
    }
    expect(p).toBe(removerEmojisNina(p));
    expect(p.length).toBeLessThanOrEqual(60000);
    const ids = [...p.matchAll(/^INSTRUÇÃO ([A-Z]+-\d+)/gm)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
