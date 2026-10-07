import { describe, expect, test } from "bun:test";
import { lerObservacaoIntencao } from "../jev-observacao-intencao";
import {
  orientarIntencaoJev,
  instrucaoJevDoTurno,
  orientacaoDaDecisaoJev,
} from "../jev-orientacao-intencao";
import { resolverPrecedenciaDoTurno } from "../prompt/precedencia-turno";
import { comporRequestNina } from "../prompt-composer";

const orientar = (respostas: unknown) =>
  orientarIntencaoJev(lerObservacaoIntencao(respostas), ["medico"]);

describe("Jev: orientação ativa da resposta", () => {
  test("preserva vários pedidos na intenção enviada à Nina", () => {
    const o = orientar({
      obs_pedido_preco: { noul: 0.95 },
      obs_pedido_preparo: { noul: 0.9 },
      obs_pedido_localizacao: { noul: 0.99 },
    })!;
    expect(o.intencoes).toEqual(["medico", "valor", "preparo", "endereco"]);
    expect(o.pedidos).toEqual(["Preço", "Preparo", "Endereço / localização"]);
    expect(o.instrucoes.join("\n")).toContain("Responda a cada pedido na mesma resposta");
  });
  test("baixa certeza e respostas ausentes não geram nova orientação", () => {
    expect(
      orientar({
        obs_pedido_preco: { noul: 0.79 },
        obs_autorizacao: { choice: "confirmar_resumo", confidence: 0.7 },
      }),
    ).toBeNull();
    expect(orientar({})).toBeNull();
    expect(orientarIntencaoJev(null, ["valor"])).toBeNull();
  });
  test("perguntar se tem o atendimento leva à escolha antes da lista", () => {
    const o = orientar({ obs_pedido_profissionais: { noul: 0.95 } })!;
    const texto = o.instrucoes.join("\n");
    expect(texto).toContain("ESCOLHA_ANTES_DOS_DETALHES");
    expect(texto).toContain("sem listar nomes, escalas nem preços");
  });
  test("dias habituais orientam a base e oferta de consulta, sem virar disponibilidade", () => {
    const o = orientar({ obs_pedido_horario_habitual: { noul: 0.98 } })!;
    expect(o.intencoes).not.toContain("disponibilidade");
    expect(o.instrucoes.join("\n")).toContain("Escala habitual não comprova vaga");
    expect(o.instrucoes.join("\n")).toContain("não consulte vagas só por mencionar a escala");
  });
  test("escala e pedido explícito de vaga coexistem", () => {
    const o = orientar({
      obs_pedido_horario_habitual: { noul: 0.98 },
      obs_pedido_disponibilidade: { noul: 0.98 },
    })!;
    expect(o.intencoes).toContain("disponibilidade");
    expect(o.instrucoes.join("\n")).toContain("Só apresente vagas retornadas pelo sistema");
  });
  test("aceite de consulta não manda marcar; aceite de resumo preserva verificações", () => {
    const consulta = orientar({
      obs_autorizacao: { choice: "consultar_agenda", confidence: 0.99 },
    })!;
    expect(consulta.instrucoes.join("\n")).toContain(
      "Aceitar consultar NÃO autoriza gravar agendamento",
    );
    expect(consulta.instrucoes.join("\n")).not.toContain(
      "Prossiga pela verificação de confirmação",
    );
    const resumo = orientar({ obs_autorizacao: { choice: "confirmar_resumo", confidence: 0.99 } })!;
    expect(resumo.instrucoes.join("\n")).toContain(
      "apenas para o mesmo profissional, paciente, data e horário",
    );
    expect(resumo.instrucoes.join("\n")).toContain(
      "só anuncie reserva depois da confirmação do sistema",
    );
  });
  test("ambiguidade pede esclarecimento; condição/recusa não aceitam resumo", () => {
    expect(
      orientar({ obs_autorizacao: { choice: "ambigua", confidence: 0.99 } })!.instrucoes.join("\n"),
    ).toContain("Pergunte se o paciente quer apenas consultar opções");
    for (const choice of ["condicional", "recusou"]) {
      const texto = orientar({ obs_autorizacao: { choice, confidence: 0.99 } })!.instrucoes.join(
        "\n",
      );
      expect(texto).toContain("Não trate esta mensagem como aceite integral");
      expect(texto).not.toContain("Prossiga pela verificação de confirmação");
    }
  });
  test("correção prevalece sobre sinal contraditório de confirmar", () => {
    const o = orientar({
      obs_correcao: { choice: "especialidade", confidence: 0.99 },
      obs_autorizacao: { choice: "confirmar_resumo", confidence: 0.99 },
    })!;
    expect(o.instrucoes.join("\n")).toContain("Correção da especialidade");
    expect(o.instrucoes.join("\n")).toContain("Não use a seleção anterior como confirmação");
    expect(o.instrucoes.join("\n")).not.toContain("Prossiga pela verificação de confirmação");
  });
  test("nova orientação não altera dados do turno original", () => {
    const o = lerObservacaoIntencao({ obs_pedido_preco: { noul: 0.95 } });
    const copia = JSON.stringify(o);
    const atuais = ["medico" as const];
    orientarIntencaoJev(o, atuais);
    expect(JSON.stringify(o)).toBe(copia);
    expect(atuais).toEqual(["medico"]);
  });
  test("auditoria antiga permanece observação e a nova identifica orientação", () => {
    expect(orientacaoDaDecisaoJev({ _observacao_intencao: lerObservacaoIntencao({}) })).toBeNull();
    const o = orientar({ obs_pedido_preco: { noul: 0.95 } });
    expect(orientacaoDaDecisaoJev({ _orientacao_intencao: o })).toEqual(o);
  });
  test("orientação chega ao system prompt real pelo contrato, sem virar fato nem autorização de ferramenta", () => {
    const o = orientar({
      obs_pedido_preco: { noul: 0.98 },
      obs_correcao: { choice: "profissional", confidence: 0.9 },
    })!;
    const contrato = resolverPrecedenciaDoTurno({
      textoPublicado: "Use somente as fontes oficiais.",
      escopo: "whatsapp",
      ambiente: "producao",
      saudacaoObrigatoria: false,
      regrasPublicadasNoPrompt: true,
      instrucoesAdicionais: instrucaoJevDoTurno(o),
    });
    const request = comporRequestNina({
      behaviorPrompt: "Use somente as fontes oficiais.",
      runtimeContext: { intencoes: o.intencoes },
      contratoPrecedencia: contrato.contrato,
    });
    expect(request.systemPrompt).toContain("JEV_LEITURA_AMPLIADA_ATIVA");
    expect(request.systemPrompt).toContain("Responda a cada pedido na mesma resposta");
    expect(request.systemPrompt).toContain("Correção do profissional");
    expect(request.systemPrompt).toContain("Não use a seleção anterior como confirmação");
    expect(request.avisos).toEqual([]);
    expect(request.runtimeContext).toEqual({ intencoes: o.intencoes });
  });
});
