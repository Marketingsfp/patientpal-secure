import { servicoSchema } from "../catalogo";
import { describe, expect, it } from "bun:test";
import {
  organizarTextoCatalogo,
  separarAtendimentos,
  atendimentosEstruturados,
  estruturaCatalogoSchema,
  pendenciasEstrutura,
  modalidadeEstruturada,
  pagamentosJaDescritos,
} from "../catalogo-estrutura";
import { servicoParaRegistro, profissionalParaRegistro } from "../catalogo-conhecimento";
import { profissionalSfp, registroExigeHumano } from "../regras-catalogo";
import { aplicarEdicaoCatalogoIA } from "../catalogo-edicao-ia";

const adulto =
  "CONSULTA CARDIOLOGIA | Especialidade: CARDIOLOGIA | Profissional: Alex Louza | Dias e horários: Quarta 13h | Idade/critério informado: a partir de 15 anos | Dinheiro: R$ 120,00 | Pix/cartão: R$ 145,00 | Observação: Agendado | Pode chegar até que horas: Manhã e tarde";
const infantil =
  "CONSULTA CARDIOLOGIA INFANTIL | Especialidade: CARDIOLOGIA | Profissional: Alex Louza | Dias e horários: Quarta 13h | Idade/critério informado: a partir de 1 mês | Dinheiro: R$ 160,00 | Pix/cartão: R$ 190,00 | Observação: Agendado | Pode chegar até que horas: Manhã e tarde";

describe("organização conservadora do catálogo", () => {
  it("mantém valores e idades associados à consulta adulta e infantil", () => {
    const itens = separarAtendimentos(`${adulto}\n\n${infantil}`);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toMatchObject({
      idade_minima: 15,
      unidade_idade: "anos",
      dinheiro: "R$ 120,00",
      pix_cartao: "R$ 145,00",
      modalidade: "hora_marcada",
    });
    expect(itens[1]).toMatchObject({
      idade_minima: 1,
      unidade_idade: "meses",
      dinheiro: "R$ 160,00",
      pix_cartao: "R$ 190,00",
    });
    expect(itens[0]!.chave).not.toBe(itens[1]!.chave);
    expect(separarAtendimentos(organizarTextoCatalogo(`${adulto}\n\n${infantil}`))).toEqual(itens);
  });
  it("não transforma ambiguidades em fatos", () => {
    const texto = adulto
      .replace("a partir de 15 anos", "40 kg")
      .replace("Agendado", "A cada 15 dias; R$ 500,00 (anestesia)");
    expect(separarAtendimentos(texto)[0]).toMatchObject({
      idade_minima: null,
      unidade_idade: null,
      modalidade: null,
      criterio_publicado: "40 kg",
      chegada_publicada: "Manhã e tarde",
    });
    expect(pendenciasEstrutura(texto, null)).toHaveLength(3);
  });
  it("preserva campos adicionais e não descarta texto sem estrutura reconhecida", () => {
    expect(separarAtendimentos(adulto + " | Exceção: regra preservada")[0]!.outros).toEqual([
      "Exceção: regra preservada",
    ]);
    expect(separarAtendimentos("Texto livre sem formato importado")).toEqual([]);
    expect(separarAtendimentos(adulto + "\n\nNão atende feriados.")).toEqual([]);
  });
  it("associa complementos somente à chave confirmada", () => {
    const chave = separarAtendimentos(infantil)[0]!.chave;
    const itens = atendimentosEstruturados(adulto + "\n\n" + infantil, {
      complementos: [{ chave, modalidade: "hora_marcada" }],
    });
    expect(itens[0]!.complemento).toBeUndefined();
    expect(itens[1]!.complemento?.modalidade).toBe("hora_marcada");
    expect(
      estruturaCatalogoSchema.safeParse({ complementos: [{ chave, idade_minima: 12 }] }).success,
    ).toBe(false);
  });
  it("modalidades por atendimento não viram uma modalidade geral por suposição", () => {
    const adultoId = separarAtendimentos(adulto)[0]!.chave;
    const infantilId = separarAtendimentos(infantil)[0]!.chave;
    expect(
      modalidadeEstruturada(
        adulto,
        { complementos: [{ chave: adultoId, modalidade: "hora_marcada" }] },
        "Alex Louza",
        "Consulta",
      ),
    ).toBe("hora_marcada");
    expect(
      modalidadeEstruturada(
        adulto + "\n\n" + infantil,
        { complementos: [{ chave: adultoId, modalidade: "hora_marcada" }] },
        "Alex Louza",
        "Consulta",
      ),
    ).toBe("hora_marcada");
    expect(
      modalidadeEstruturada(
        adulto + "\n\n" + infantil,
        {
          complementos: [
            { chave: adultoId, modalidade: "hora_marcada" },
            { chave: infantilId, modalidade: "ficha" },
          ],
        },
        "Alex Louza",
        "Consulta",
      ),
    ).toBe("nao_definida");
  });
  it("só remove repetição de pagamento se os valores e condições forem idênticos", () => {
    const itens = separarAtendimentos(adulto);
    const formas = [
      { forma: "Dinheiro", valor: 120 },
      { forma: "Pix/cartão", valor: 145 },
    ];
    expect(pagamentosJaDescritos(formas, itens)).toBe(true);
    expect(pagamentosJaDescritos([{ forma: "Dinheiro", valor: 125 }], itens)).toBe(false);
    expect(
      pagamentosJaDescritos(
        [{ forma: "Dinheiro", valor: 120, observacao: "condição adicional" }],
        itens,
      ),
    ).toBe(false);
    expect(pagamentosJaDescritos(formas, separarAtendimentos(adulto + "\n\n" + infantil))).toBe(
      false,
    );
  });
  it("SFP e variante legada acionam o mesmo encaminhamento", () => {
    expect(profissionalSfp("SPF")).toBe(true);
    expect(profissionalSfp("SFP")).toBe(true);
    expect(profissionalSfp("Dr. SPF Silva")).toBe(false);
    expect(organizarTextoCatalogo("Profissional: SPF | R$ 120,00")).toBe(
      "Profissional: SFP\nR$ 120,00",
    );
    const registro = servicoParaRegistro({
      id: "1",
      nome: "Exame",
      estrutura: { encaminhamento_humano: true },
      executantes: [],
    } as any);
    expect(registroExigeHumano(registro)).toBe(true);
  });
  it("atualiza o estado do preparo sem quebrar a edição existente e recusa contradição", () => {
    expect(servicoSchema.parse({nome:"Exame",preparo:null,estrutura:{preparo_status:"informado"}}).estrutura?.preparo_status).toBe("nao_informado");
    expect(servicoSchema.parse({nome:"Exame",preparo:"Orientação confirmada",estrutura:{}}).estrutura?.preparo_status).toBe("informado");
    expect(() => servicoSchema.parse({nome:"Exame",preparo:"Orientação confirmada",estrutura:{preparo_status:"sem_preparo"}})).toThrow();
  });
  it("ausência de preparo e convênios permanece desconhecida", () => {
    const s = servicoParaRegistro({ id: "1", nome: "Exame", executantes: [] } as any);
    const p = profissionalParaRegistro(
      {
        id: "2",
        nome: "Alex",
        convenios: [],
        observacao_publica: adulto + "\n\n" + infantil,
      } as any,
      "2026-09-20",
    );
    expect(s.extras?.preparo_status).toBe("nao_informado");
    expect(p.extras?.convenios_status).toBe("nao_informado");
    expect(p.extras?.atendimentos_publicados).toHaveLength(2);
  });
  it("edição assistida preserva estrutura e exige prévia manual de mudanças estruturadas no rascunho", () => {
    const estrutura = { aliases: ["ECG"] };
    const proposta = {
      alteracoes: [{ operacao: "definir", caminho: "/preparo", valor_json: '"Regra confirmada"' }],
      pendencias: [],
      ambiguidades: [],
    };
    const atual = { nome: "Eletrocardiograma", estrutura };
    expect(aplicarEdicaoCatalogoIA("servico", atual, proposta).dados.estrutura?.aliases).toEqual([
      "ECG",
    ]);
    expect(() =>
      aplicarEdicaoCatalogoIA(
        "servico",
        { ...atual, rascunho: { estrutura: { aliases: ["Outro"] } } },
        proposta,
      ),
    ).toThrow("regras estruturadas");
  });
});
