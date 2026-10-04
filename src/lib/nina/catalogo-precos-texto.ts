import { formatarBRL } from "./catalogo";
import { separarAtendimentos } from "./catalogo-estrutura";
import type { TipoCatalogo } from "./catalogo-ia";

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const forma = (v: string) =>
  /dinheiro/i.test(v) ? "dinheiro" : /pix|cart[aã]o/i.test(v) ? "cartao" : null;

/** Sincroniza somente linhas de preços rotuladas, sem substituir números na prosa clínica. */
export function sincronizarPrecosPublicados(
  tipo: TipoCatalogo,
  antes: Record<string, any>,
  depois: Record<string, any>,
) {
  if (
    JSON.stringify(antes.formas_pagamento) === JSON.stringify(depois.formas_pagamento) &&
    antes.valor === depois.valor
  )
    return;
  const campo = tipo === "servico" ? "descricao_publica" : "observacao_publica";
  const texto = depois[campo] as string | null;
  if (!texto) return;
  const itens = separarAtendimentos(texto, tipo === "profissional" ? depois.nome : undefined);
  if (!itens.length) {
    if (/R\$\s*\d|(?:Dinheiro|Pix\/cartão|Cartão)\s*:\s*\d/i.test(texto))
      throw new Error(
        "A descrição contém preços sem blocos de atendimento identificados. Organize os preços por atendimento na edição manual antes de usar a IA.",
      );
    return;
  }
  const blocos = texto.trim().split(/\n\s*\n/);
  if (blocos.length !== itens.length)
    throw new Error(
      "Não foi possível conferir os preços por atendimento. Revise a descrição antes de publicar.",
    );
  depois[campo] = blocos
    .map((bloco, index) => {
      const item = itens[index]!;
      const alvo = norm(tipo === "profissional" ? item.atendimento : (item.profissional ?? ""));
      for (const grupo of ["dinheiro", "cartao"] as const) {
        const candidatas = (depois.formas_pagamento ?? []).filter(
          (p: any) => forma(p.forma) === grupo,
        );
        let aplicaveis = candidatas.filter(
          (p: any) =>
            !p.condicao || p.condicao.split(/[,;\n]/).some((c: string) => norm(c) === alvo),
        );
        if (itens.length === 1) aplicaveis = candidatas;
        const valores = [...new Set(aplicaveis.map((p: any) => p.valor))];
        const rotulo = grupo === "dinheiro" ? "Dinheiro" : "Pix/cartão";
        const regex =
          grupo === "dinheiro" ? /^Dinheiro\s*:.*$/im : /^(?:Pix\s*\/\s*)?Cart[aã]o\s*:.*$/im;
        if (!valores.length && !regex.test(bloco)) continue;
        if (valores.length !== 1)
          throw new Error(
            `Não foi possível associar o preço de ${rotulo} a ${item.atendimento} / ${item.profissional ?? depois.nome}. Separe as condições de pagamento por atendimento.`,
          );
        const valor = valores[0] as number | null;
        const linha = `${rotulo}: ${valor == null ? "Não informado" : formatarBRL(valor).replace(/\u00a0/g, " ")}`;
        // Não descartar parcelamento/condições escritos depois do preço.
        const existente = bloco.match(regex)?.[0];
        if (existente) {
          const sufixo = existente.replace(
            /^[^:]+:\s*(?:R\$\s*[\d.,]+|[\d.,]+|Não informado|Gratuito)/i,
            "",
          );
          if (sufixo === existente)
            throw new Error(`Confira manualmente o preço de ${rotulo} em ${item.atendimento}.`);
          bloco = bloco.replace(regex, linha + sufixo);
        } else bloco += `\n${linha}`;
      }
      return bloco;
    })
    .join("\n\n");
}
