import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DetalhesMensagemNina } from "../DetalhesMensagemNina";
import type { LeituraDetalhesMensagem } from "@/lib/nina/detalhes-mensagem-contrato";

function leitura(parcial: Partial<LeituraDetalhesMensagem> = {}): LeituraDetalhesMensagem {
  return {
    resultado: "Mensagem registrada na homologação.",
    ambiente: "homologacao",
    mensagem: {
      id: "mensagem-selecionada",
      texto: "Olá! Como posso ajudar?",
      registradaEm: null,
      canal: "test-console",
      entrega: "registrada",
      origem: "Modelo",
    },
    entradas: ["oi bom dia"],
    respostaOriginal: "Olá! Como posso ajudar?",
    protocolo: null,
    modelo: "modelo-de-teste",
    versaoPrompt: 15,
    rodadas: 1,
    duracaoMs: 1250,
    avaliacoes: [],
    passos: [],
    alertas: [],
    ...parcial,
  };
}

function renderizar(dados: LeituraDetalhesMensagem, registros?: unknown) {
  return renderToStaticMarkup(createElement(DetalhesMensagemNina, { leitura: dados, registros }));
}

describe("Detalhes técnicos da mensagem — apresentação fiel", () => {
  it("MJ-55 preserva aviso e entrega sem exibir notas antigas", () => {
    const aviso = "Aviso simbólico: a equipe continuaria este atendimento. Protocolo MJ-55.";
    const dados = leitura({
      resultado: "Aviso de encaminhamento simulado registrado.",
      mensagem: {
        id: "mensagem-mj55",
        texto: aviso,
        registradaEm: null,
        canal: "test-console",
        entrega: "registrada",
        origem: "Aviso operacional do sistema",
      },
      entradas: ["vcs tem cardiologista?"],
      respostaOriginal: "Resposta original sobre cardiologia, antes do bloqueio.",
      protocolo: "MJ-55",
      avaliacoes: [
        {
          id: "seguranca",
          titulo: "Segurança da ação",
          nota: 0,
          nivel: "LOW",
          explicacao: "A execução da ação foi bloqueada.",
          motivos: ["Fonte oficial não comprovada."],
        },
        {
          id: "bloqueio",
          titulo: "Avaliação do texto bloqueado",
          nota: 63,
          nivel: "LOW",
          explicacao: "Esta nota pertence ao texto bloqueado e não ao aviso registrado.",
          motivos: [],
        },
      ],
      passos: [
        {
          id: "modelo",
          titulo: "Resposta preparada",
          descricao: "O modelo respondeu sobre cardiologia.",
          estado: "concluido",
          em: null,
          duracaoMs: 1000,
        },
        {
          id: "bloqueio",
          titulo: "Resposta bloqueada",
          descricao: "O conteúdo não foi liberado pelo motor.",
          estado: "concluido",
          em: null,
          duracaoMs: null,
        },
        {
          id: "simulacao",
          titulo: "Encaminhamento simulado",
          descricao: "Nenhuma pessoa real foi atribuída.",
          estado: "concluido",
          em: null,
          duracaoMs: null,
        },
        {
          id: "mensagem",
          titulo: "Aviso registrado",
          descricao: "A mensagem com o protocolo foi gravada na conversa.",
          estado: "concluido",
          em: null,
          duracaoMs: null,
        },
      ],
      alertas: ["O registro antigo descreve como mensagem final um texto vazio de controle."],
    });
    const html = renderizar(dados, {
      etapas: [
        { titulo: "Desfecho: HANDOFF_CONFIRMADO" },
        { titulo: "Mensagem final enviada", dados: { texto: "" } },
      ],
    });
    const principal = html.split('data-testid="registros-tecnicos"')[0];
    expect(principal).toContain(aviso);
    expect(principal).toContain('data-mensagem-id="mensagem-mj55"');
    expect(principal).toContain("Homologação");
    expect(principal).not.toContain("Avaliação do texto bloqueado");
    expect(principal).not.toContain("Nota 63/100");
    expect(principal).not.toContain("Confiança da mensagem registrada");
    expect(principal).not.toContain("HANDOFF_CONFIRMADO");
    expect(principal).not.toContain("Mensagem final enviada");
    expect(principal).not.toContain("não há validação automática");
    expect(html).toContain("Ver registros técnicos");
    expect(html).toContain("Registros da geração e da entrega desta mensagem.");
    expect(html).toContain("HANDOFF_CONFIRMADO");
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
    expect(html).toMatch(/<summary[^>]*>Última resposta do modelo registrada<\/summary>/);
  });

  it("resposta normal mostra o modelo e a duração sem exibir avaliação", () => {
    const html = renderizar(
      leitura({
        avaliacoes: [
          {
            id: "avaliacao-exata",
            titulo: "Confiança da mensagem registrada",
            nota: 90,
            nivel: "HIGH",
            explicacao: "O conteúdo avaliado corresponde à mensagem registrada.",
            motivos: [],
          },
        ],
      }),
    );
    expect(html).not.toContain("Confiança da mensagem registrada");
    expect(html).not.toContain("Nota 90/100");
    expect(html).not.toContain("O conteúdo avaliado corresponde à mensagem registrada.");
    expect(html).toContain("1,3 s");
    expect(html).not.toContain("texto bloqueado");
  });

  it("mensagem sem execução mantém seu texto e declara a falta de vínculo técnico", () => {
    const html = renderizar(
      leitura({
        modelo: null,
        versaoPrompt: null,
        rodadas: null,
        duracaoMs: null,
        respostaOriginal: null,
        mensagem: {
          id: "aviso-sem-execucao",
          texto: "Protocolo recebido.",
          registradaEm: null,
          canal: "test-console",
          entrega: "registrada",
          origem: "Não registrada",
        },
        alertas: ["Não foi localizada uma execução vinculada a esta mensagem."],
      }),
    );
    expect(html).toContain("Protocolo recebido.");
    expect(html).not.toContain("Nenhuma avaliação foi localizada para esta mensagem.");
    expect(html).toContain("Nenhuma resposta do modelo foi localizada nos registros.");
    expect(html).toContain("Não foi localizada uma execução vinculada a esta mensagem.");
    expect(html).not.toContain("Nota ");
    expect(html).not.toContain("Sem registro técnico para esta mensagem.");
  });

  it("mensagem não localizada não é substituída pelo texto de outra execução", () => {
    const html = renderizar(
      leitura({
        mensagem: null,
        resultado: "Mensagem não localizada.",
        ambiente: "nao_registrado",
        respostaOriginal: "Texto histórico do modelo.",
      }),
    );
    expect(html).toContain("A mensagem selecionada não foi localizada nos registros disponíveis.");
    expect(html).toContain("Ambiente não registrado");
    expect(html).not.toContain("data-mensagem-id");
    expect(html).not.toContain("<blockquote");
  });

  it("mantém oito passos visíveis e recolhe as etapas adicionais", () => {
    const html = renderizar(
      leitura({
        passos: Array.from({ length: 10 }, (_, indice) => ({
          id: `passo-${indice}`,
          titulo: `Etapa ${indice + 1}`,
          descricao: `Registro ${indice + 1}`,
          estado: "concluido" as const,
          em: null,
          duracaoMs: null,
        })),
      }),
    );
    const antesDasExtras = html.split("Outras etapas registradas")[0];
    expect(antesDasExtras).toContain("Etapa 8");
    expect(antesDasExtras).not.toContain("Etapa 9");
    expect(html).toContain("Outras etapas registradas (2)");
    expect(html).toContain("Etapa 10");
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
  });
});
