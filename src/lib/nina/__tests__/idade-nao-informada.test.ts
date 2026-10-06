import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { idadeNaoInformada, REGRA_IDADE_NAO_INFORMADA } from "../regras-administrativas-confirmadas";
import { pendenciasEstrutura, separarAtendimentos, atendimentosEstruturados } from "../catalogo-estrutura";
import { montarResultadoCatalogo, type ServicoPublicado, type ProfissionalPublicado } from "../catalogo-conhecimento";
import { camposDoCatalogo } from "../catalogo-mapa-campos";
import { PROMPT_NINA_WHATSAPP_V4 } from "../prompt/behavior-v4";

const bloco = (nome: string, idade: string) => `${nome}\nEspecialidade: TESTE\nIdade/critério informado: ${idade}\nObservação: Agendado`;
test.each(["", "  ", "-", "—", "Não informado", "não informada"])("idade %j não gera pendência nem inventa zero", idade => {
  expect(idadeNaoInformada(idade)).toBe(true);
  for (const nome of ["CONSULTA", "ELETROENCEFALOGRAMA", "APLICAÇÃO DE INJEÇÃO"]) {
    const texto = bloco(nome, idade);
    expect(pendenciasEstrutura(texto, null)).toEqual([]);
    const item = separarAtendimentos(texto)[0]!;
    expect(item.idade_minima).toBeNull();
    expect(item.unidade_idade).toBeNull();
    expect(item.criterio_publicado).toBe(idade.trim() || null);
  }
});

test("idades preenchidas e outros critérios continuam preservados por atendimento", () => {
  expect(idadeNaoInformada(null)).toBe(true);
  for (const idade of ["0 anos", "6 meses", "18 anos", "40 kg", "somente adultos"])
    expect(idadeNaoInformada(idade)).toBe(false);
  const texto = bloco("CONSULTA A", "18 anos") + "\n\n" + bloco("EXAME B", "Não informado") + "\n\n" + bloco("CONSULTA C", "0 anos");
  expect(separarAtendimentos(texto).map(a => a.idade_minima)).toEqual([18, null, 0]);
  expect(pendenciasEstrutura(bloco("EXAME", "40 kg"), null).join(" ")).toContain("40 kg");
  const chave = separarAtendimentos(bloco("EXAME", ""))[0]!.chave;
  const itens = atendimentosEstruturados(bloco("EXAME", ""), { complementos: [{ chave, idade_minima: 6, unidade_idade: "meses" }] });
  expect(itens[0]!.complemento?.idade_minima).toBe(6);
});

test("retorno publicado e mapa explicam a exceção sem dispensar preparo ou pedido médico", () => {
  const servico: ServicoPublicado = { id: "exame", nome: "Eletroencefalograma", descricao_publica: bloco("ELETROENCEFALOGRAMA", ""),
    valor: null, valor_observacao: null, preparo: "Preparo específico publicado", restricoes: null, executantes: [], formas_pagamento: [] };
  const profissional = { id: "consulta", nome: "Dra. Ana", observacao_publica: bloco("CONSULTA", "Não informado"),
    especialidades: [], horarios: [], formas_pagamento: [], convenios: [] } as unknown as ProfissionalPublicado;
  for (const entrada of [{ servicos: [servico], profissionais: [] }, { servicos: [], profissionais: [profissional] }]) {
    const resultado = montarResultadoCatalogo({ ...entrada, hojeISO: "2026-10-05" });
    expect(resultado.found).toBe(true);
    expect(resultado.instrucao).toContain(REGRA_IDADE_NAO_INFORMADA);
    expect(resultado.instrucao).toContain("Preparo não informado não significa sem preparo");
    expect(resultado.instrucao).toContain("Não informado não significa dispensado");
  }
  for (const tipo of ["servico", "profissional"] as const)
    expect(camposDoCatalogo(tipo).find(c => c.campo === "criterio_idade")?.orientacao).toContain(REGRA_IDADE_NAO_INFORMADA);
  expect(PROMPT_NINA_WHATSAPP_V4).toContain(REGRA_IDADE_NAO_INFORMADA);
  expect(PROMPT_NINA_WHATSAPP_V4).not.toContain("Campo sem idade continua desconhecido");
  expect(montarResultadoCatalogo({ servicos: [], profissionais: [], hojeISO: "2026-10-05" }).found).toBe(false);
});

for (const ambiente of ["producao", "homologacao"]) test(`${ambiente}: núcleo envia a regra obrigatória ao modelo`, () => {
  const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
  const p = Bun.spawnSync([process.execPath, fixture, ambiente, "direta"], {
    cwd: fileURLToPath(new URL("../../../../../", import.meta.url)), stdout: "pipe", stderr: "pipe", timeout: 15_000,
  });
  expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
  const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="));
  expect(linha).toBeDefined();
  const resultado = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
  expect(JSON.stringify(resultado.requests[0].messages)).toContain(REGRA_IDADE_NAO_INFORMADA);
  expect(resultado.rede).toBe(0);
});
