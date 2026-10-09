import { prepararBuscaCatalogo } from "@/lib/nina/catalogo-busca";
import { paraNumero, resumoHorarios } from "@/lib/nina/catalogo";
import type { ProfissionalPublicado, ServicoPublicado } from "@/lib/nina/catalogo-conhecimento";

export type FonteConsultaChat = {
  servicos: ServicoPublicado[];
  profissionais: ProfissionalPublicado[];
};
export type SelecaoBaseChat = { tipo: "servico" | "profissional"; id: string };
export type ItemBaseChat = SelecaoBaseChat & {
  titulo: string;
  subtitulo: string;
  fonte: string;
  campos: { nome: string; texto: string }[];
};
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const lista = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((i) => i && typeof i === "object") : [];
const reais = (v: unknown) => {
  const n = paraNumero(v);
  return n !== null && n >= 0
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : null;
};
/** Exibe literalmente as formas/condições da fonte, sem aplicar instruções de linguagem do modelo. */
function pagamentos(formas: unknown, referencia?: unknown) {
  const linhas = lista(formas)
    .filter((f) => texto(f.forma))
    .map((f) =>
      [
        texto(f.condicao),
        `${texto(f.forma)}: ${reais(f.valor) ?? "valor não informado"}`,
        texto(f.observacao),
      ]
        .filter(Boolean)
        .join(" — "),
    );
  return linhas.length
    ? linhas.join("\n")
    : reais(referencia)
      ? `${reais(referencia)} (valor de referência; forma de pagamento não informada)`
      : "";
}
function campos(precos: string, informacoes: string, preparo: string, horario: string) {
  return [
    { nome: "Valores", texto: precos },
    { nome: "Informações e condições", texto: informacoes },
    { nome: "Preparo", texto: preparo },
    {
      nome: "Horário habitual",
      texto: horario
        ? `${horario}\nHorário habitual cadastrado; vagas precisam ser verificadas na agenda.`
        : "",
    },
  ];
}
export function itensBaseChat(fonte: FonteConsultaChat, hoje: string): ItemBaseChat[] {
  return [
    ...fonte.servicos.map((s) => ({
      id: s.id,
      tipo: "servico" as const,
      titulo: s.nome,
      subtitulo: lista(s.executantes)
        .map((e) => texto(e.nome))
        .filter(Boolean)
        .join(", "),
      fonte: "Cadastro oficial — procedimentos",
      campos: campos(
        pagamentos(s.formas_pagamento, s.valor),
        [s.descricao_publica, s.valor_observacao, s.restricoes]
          .map(texto)
          .filter(Boolean)
          .join("\n"),
        texto(s.preparo),
        lista(s.executantes)
          .filter((e) => texto(e.horarios))
          .map((e) =>
            [texto(e.nome), texto(e.horarios), texto(e.observacao)].filter(Boolean).join(" · "),
          )
          .join("\n"),
      ),
    })),
    ...fonte.profissionais.map((p) => {
      const horarios = lista(p.horarios);
      const horario = horarios.length
        ? [
            resumoHorarios(horarios),
            ...horarios.map((h) => texto(h.observacao)).filter(Boolean),
          ].join(" · ")
        : "";
      const aviso =
        p.aviso_dia &&
        (!p.aviso_valido_de || hoje >= p.aviso_valido_de) &&
        (!p.aviso_valido_ate || hoje <= p.aviso_valido_ate)
          ? `Aviso vigente: ${p.aviso_dia}`
          : "";
      return {
        id: p.id,
        tipo: "profissional" as const,
        titulo: p.nome,
        subtitulo: [...lista(p.especialidades).map((e) => texto(e.nome)), texto(p.unidades?.nome)]
          .filter(Boolean)
          .join(" · "),
        fonte: "Cadastro oficial — profissionais e horários habituais",
        campos: campos(
          pagamentos(p.formas_pagamento),
          [texto(p.observacao_publica), texto(p.tipo_atendimento), aviso]
            .filter(Boolean)
            .join("\n"),
          "",
          horario,
        ),
      };
    }),
  ];
}
export function pesquisarBaseChat(itens: ItemBaseChat[], termo: string, pagina: number) {
  const busca = prepararBuscaCatalogo(
    termo,
    itens.map((i) => `${i.titulo} ${i.subtitulo}`),
  );
  const encontrados = itens
    .map((i) => ({ item: i, score: busca.pontuar(i.titulo, i.subtitulo) }))
    .filter((i) => i.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.titulo.localeCompare(b.item.titulo, "pt-BR") ||
        a.item.id.localeCompare(b.item.id),
    );
  return {
    total: encontrados.length,
    itens: encontrados.slice(pagina * 20, pagina * 20 + 20).map((i) => i.item),
    pagina,
  };
}
/** Copia somente campos públicos existentes. A referência acompanha o rascunho, nunca dispara envio. */
export function textoBaseParaRascunho(i: ItemBaseChat, consultadoEm: string) {
  return [
    i.titulo,
    i.subtitulo,
    ...i.campos.filter((c) => c.texto).map((c) => `${c.nome}:\n${c.texto}`),
    `Fonte: ${i.fonte} · ${i.titulo}. Consultado em ${new Date(consultadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function acrescentarBaseAoRascunho(anterior: string, trecho: string) {
  return anterior.trim() ? `${anterior}\n\n${trecho}` : trecho;
}
