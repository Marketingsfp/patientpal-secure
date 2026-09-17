/**
 * Base de conhecimento do Coach WhatsApp montada a partir do PRÓPRIO SISTEMA.
 *
 * Por que este arquivo existe: até aqui o Coach usava dois catálogos escritos
 * à mão que vieram do projeto de origem (tabela da Menino Jesus e uma TAP
 * antiga). Isso significa que a IA treinava a atendente com preço, horário e
 * médico que podem não existir mais — e nenhuma clínica nova teria base
 * nenhuma. A fonte de verdade passa a ser a mesma que a Nina usa:
 * `procedimentos`, o catálogo publicado (`nina_cat_servicos` /
 * `nina_cat_profissionais`), `medicos` + `especialidades` e `unidades`.
 *
 * Este módulo é PURO de propósito (não conhece Supabase): recebe as linhas já
 * lidas e devolve texto. Assim dá para testar o formato e a seleção sem banco.
 * A leitura fica em `base-conhecimento.dados.ts`.
 */

export type ProcedimentoBase = {
  nome: string;
  tipo: string | null;
  grupo: string | null;
  valor_padrao: number | null;
  valor_dinheiro: number | null;
  valor_pix: number | null;
  valor_dinheiro_pix: number | null;
  valor_cartao: number | null;
  valor_cartao_credito: number | null;
  valor_cartao_debito: number | null;
  valor_cartao_consulta: number | null;
  valor_cartao_desconto: number | null;
  preparo: string | null;
  observacoes: string | null;
  duracao_minutos: number | null;
  requer_laudo: boolean | null;
  requer_medico: boolean | null;
};

export type CatServicoBase = {
  nome: string;
  valor: number | null;
  valor_observacao: string | null;
  descricao_publica: string | null;
  preparo: string | null;
  restricoes: string | null;
  executantes: unknown;
  formas_pagamento: unknown;
};

export type CatProfissionalBase = {
  nome: string;
  especialidades: unknown;
  horarios: unknown;
  tipo_atendimento: string | null;
  convenios: unknown;
  formas_pagamento: unknown;
  observacao_publica: string | null;
  aviso_dia: string | null;
  atende_consultorio: boolean | null;
};

export type MedicoBase = { nome: string; especialidade: string | null };

export type UnidadeBase = {
  nome: string;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
};

export type DadosBase = {
  clinicaNome: string;
  geradoEm: Date;
  procedimentos: ProcedimentoBase[];
  catalogoServicos: CatServicoBase[];
  catalogoProfissionais: CatProfissionalBase[];
  medicos: MedicoBase[];
  unidades: UnidadeBase[];
};

/** Marcadores de seção — a seleção por assunto reaproveita estes títulos. */
export const SECOES = {
  consultas: "## CONSULTAS POR ESPECIALIDADE",
  profissionais: "## PROFISSIONAIS E HORÁRIOS",
  comuns: "## EXAMES E PROCEDIMENTOS MAIS PROCURADOS",
  exames: "## EXAMES (lista completa)",
  procedimentos: "## PROCEDIMENTOS",
  unidades: "## UNIDADES E CONTATOS",
  pagamento: "## REGRAS DE PAGAMENTO",
  complemento: "## COMPLEMENTO DA GESTORA",
} as const;

/** Seções que vão SEMPRE inteiras para a IA (não dependem do assunto). */
const SECOES_FIXAS: string[] = [
  SECOES.consultas,
  SECOES.profissionais,
  SECOES.unidades,
  SECOES.pagamento,
];

export const TETO_PADRAO = 40_000;

// ————————————————————————————————————————— formatação

function texto(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

export function moeda(v: number | null | undefined): string | null {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return null;
  return `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
}

/**
 * Valores por forma de pagamento, sem repetir o mesmo número.
 *
 * A regra da clínica é informar dinheiro/PIX e cartão juntos; juntar valores
 * iguais evita linhas do tipo "R$ 120 dinheiro, R$ 120 pix, R$ 120 cartão".
 */
export function valoresDoProcedimento(p: ProcedimentoBase): string {
  const pares: Array<[string, number | null]> = [
    ["dinheiro", p.valor_dinheiro ?? p.valor_dinheiro_pix],
    ["pix", p.valor_pix ?? p.valor_dinheiro_pix],
    ["cartão débito", p.valor_cartao_debito ?? p.valor_cartao],
    ["cartão crédito", p.valor_cartao_credito ?? p.valor_cartao],
    ["cartão benefícios", p.valor_cartao_consulta],
    ["cartão desconto", p.valor_cartao_desconto],
  ];
  const porValor = new Map<string, string[]>();
  for (const [forma, valor] of pares) {
    const m = moeda(valor ?? null);
    if (!m) continue;
    porValor.set(m, [...(porValor.get(m) ?? []), forma]);
  }
  if (porValor.size === 0) {
    const padrao = moeda(p.valor_padrao);
    return padrao ? `${padrao} (valor de referência)` : "valor não cadastrado";
  }
  return [...porValor.entries()].map(([v, formas]) => `${v} ${formas.join("/")}`).join(" · ");
}

function lista(v: unknown, campo = "nome"): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (typeof item === "string") return texto(item);
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        return texto(o[campo] ?? o["titulo"] ?? o["descricao"] ?? "");
      }
      return "";
    })
    .filter(Boolean);
}

function horariosTexto(v: unknown): string {
  if (!Array.isArray(v)) return "";
  return v
    .map((h) => {
      if (typeof h === "string") return texto(h);
      const o = (h ?? {}) as Record<string, unknown>;
      const partes = [
        texto(o["dia"]),
        texto(o["hora_inicio"] ?? o["hora"] ?? o["horario"]),
        texto(o["hora_fim"]) ? `às ${texto(o["hora_fim"])}` : "",
        texto(o["recorrencia"]),
        texto(o["observacao"] ?? o["observacao_publica"]),
      ].filter(Boolean);
      return partes.join(" ");
    })
    .filter(Boolean)
    .join("; ");
}

function campos(...partes: Array<string | null | undefined>): string {
  return partes.map((p) => texto(p)).filter(Boolean).join(" | ");
}

const RE_CONSULTA = /consulta|retorno|avalia[çc][ãa]o/i;

function chave(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ————————————————————————————————————————— montagem

/**
 * Monta a base completa em texto compacto, uma linha por item.
 *
 * O catálogo publicado da Nina PREVALECE sobre o `procedimentos` de mesmo
 * nome: ele é o conteúdo revisado para o paciente (descrição, restrição,
 * observação de valor). O `procedimentos` entra como a lista operacional
 * completa, que é o único que existe em clínica sem catálogo (hoje a SFP).
 */
export function montarBase(dados: DadosBase): string {
  const curados = new Map<string, CatServicoBase>();
  for (const s of dados.catalogoServicos) curados.set(chave(s.nome), s);

  const linhaCurada = (s: CatServicoBase): string => {
    const valor = moeda(s.valor);
    const formas = lista(s.formas_pagamento, "forma");
    return campos(
      s.nome.toUpperCase(),
      [valor, texto(s.valor_observacao)].filter(Boolean).join(" ") || null,
      formas.length ? `Pagamento: ${formas.join(", ")}` : null,
      texto(s.descricao_publica) || null,
      texto(s.preparo) ? `Preparo: ${texto(s.preparo)}` : null,
      texto(s.restricoes) ? `Restrições: ${texto(s.restricoes)}` : null,
      lista(s.executantes).length ? `Executa: ${lista(s.executantes).join(", ")}` : null,
    );
  };

  const linhaProcedimento = (p: ProcedimentoBase): string =>
    campos(
      p.nome.toUpperCase(),
      texto(p.grupo) || null,
      valoresDoProcedimento(p),
      p.duracao_minutos ? `${p.duracao_minutos} min` : null,
      texto(p.preparo) ? `Preparo: ${texto(p.preparo)}` : null,
      p.requer_laudo ? "Gera laudo" : null,
      p.requer_medico ? "Precisa de médico" : null,
      texto(p.observacoes) || null,
    );

  /** Uma linha por item: usa a versão publicada quando ela existe. */
  const linhaItem = (p: ProcedimentoBase): string => {
    const curado = curados.get(chave(p.nome));
    if (!curado) return linhaProcedimento(p);
    return `${linhaCurada(curado)} | Valores: ${valoresDoProcedimento(p)}`;
  };

  const consultas = dados.procedimentos.filter(
    (p) => p.tipo === "consulta" || RE_CONSULTA.test(p.nome),
  );
  const exames = dados.procedimentos.filter(
    (p) => !consultas.includes(p) && (p.tipo === "exame" || p.tipo === null),
  );
  const procedimentos = dados.procedimentos.filter(
    (p) => !consultas.includes(p) && !exames.includes(p),
  );

  // Profissionais por especialidade, para casar com a linha da consulta.
  const porEspecialidade = new Map<string, string[]>();
  for (const prof of dados.catalogoProfissionais) {
    const esps = lista(prof.especialidades);
    const resumo = campos(
      prof.nome,
      horariosTexto(prof.horarios) || null,
      texto(prof.tipo_atendimento) || null,
    );
    for (const e of esps.length ? esps : ["—"]) {
      porEspecialidade.set(chave(e), [...(porEspecialidade.get(chave(e)) ?? []), resumo]);
    }
  }
  for (const m of dados.medicos) {
    const e = chave(m.especialidade ?? "—");
    if (dados.catalogoProfissionais.length && porEspecialidade.has(e)) continue;
    porEspecialidade.set(e, [...(porEspecialidade.get(e) ?? []), m.nome]);
  }

  const blocos: string[] = [];

  blocos.push(
    [
      SECOES.consultas,
      ...consultas.map((c) => {
        const esp = chave(texto(c.grupo) || c.nome.replace(RE_CONSULTA, ""));
        const profs = porEspecialidade.get(esp) ?? [];
        return campos(
          linhaItem(c),
          profs.length ? `Profissionais: ${profs.slice(0, 8).join(" ; ")}` : null,
        );
      }),
    ].join("\n"),
  );

  const profissionais = dados.catalogoProfissionais.length
    ? dados.catalogoProfissionais.map((p) =>
        campos(
          p.nome,
          lista(p.especialidades).join(", ") || null,
          horariosTexto(p.horarios) || null,
          texto(p.tipo_atendimento) || null,
          lista(p.convenios).length ? `Convênios: ${lista(p.convenios).join(", ")}` : null,
          lista(p.formas_pagamento, "forma").length
            ? `Pagamento: ${lista(p.formas_pagamento, "forma").join(", ")}`
            : null,
          texto(p.observacao_publica) || null,
          texto(p.aviso_dia) ? `Aviso: ${texto(p.aviso_dia)}` : null,
        ),
      )
    : dados.medicos.map((m) => campos(m.nome, m.especialidade));
  blocos.push([SECOES.profissionais, ...profissionais].join("\n"));

  // Mais procurados: o que a clínica revisou no catálogo publicado vem
  // primeiro; sem catálogo, os primeiros itens de cada grupo, para que uma
  // clínica sem curadoria também tenha um recorte útil.
  const restantes = [...exames, ...procedimentos];
  const comuns: ProcedimentoBase[] = [];
  const vistos = new Set<string>();
  for (const p of restantes) {
    if (curados.has(chave(p.nome)) && !vistos.has(chave(p.nome))) {
      vistos.add(chave(p.nome));
      comuns.push(p);
    }
  }
  const porGrupo = new Map<string, number>();
  for (const p of restantes) {
    if (comuns.length >= 150) break;
    const g = chave(texto(p.grupo) || "sem grupo");
    const qt = porGrupo.get(g) ?? 0;
    if (qt >= 4 || vistos.has(chave(p.nome))) continue;
    porGrupo.set(g, qt + 1);
    vistos.add(chave(p.nome));
    comuns.push(p);
  }
  blocos.push([SECOES.comuns, ...comuns.map(linhaItem)].join("\n"));

  blocos.push([SECOES.exames, ...exames.map(linhaItem)].join("\n"));
  blocos.push([SECOES.procedimentos, ...procedimentos.map(linhaItem)].join("\n"));

  blocos.push(
    [
      SECOES.unidades,
      ...(dados.unidades.length
        ? dados.unidades.map((u) =>
            campos(u.nome, u.endereco, [u.cidade, u.estado].filter(Boolean).join("/"), u.telefone),
          )
        : ["Endereço e telefone não cadastrados no sistema — confirmar com a equipe."]),
    ].join("\n"),
  );

  blocos.push(
    [
      SECOES.pagamento,
      "Informe SEMPRE o valor junto da forma de pagamento correspondente; nunca cite só o menor valor.",
      "Dinheiro e PIX não são a mesma coisa quando o cadastro traz valores diferentes.",
      "Cartão de benefícios/desconto só vale para quem tem o cartão; não ofereça como preço geral.",
      "Valor em branco significa não cadastrado — confirme com a equipe em vez de estimar.",
      "Horário do cadastro é escala, não vaga: disponibilidade real vem da agenda.",
    ].join("\n"),
  );

  const cabecalho = `BASE DE CONHECIMENTO DO SISTEMA — ${dados.clinicaNome} (gerada em ${dados.geradoEm.toLocaleString(
    "pt-BR",
    { timeZone: "America/Sao_Paulo" },
  )})`;

  // O cadastro tem serviços repetidos (importações antigas). A linha repetida
  // não acrescenta informação e só consome espaço do prompt, então cada linha
  // idêntica aparece uma vez por seção. Nenhum valor é alterado.
  const semRepeticao = blocos.map((bloco) => {
    const [titulo, ...linhas] = bloco.split("\n");
    return [titulo, ...new Set(linhas)].join("\n");
  });

  return [cabecalho, ...semRepeticao].join("\n\n");
}

// ————————————————————————————————————————— seleção por assunto

function seccionar(base: string): { titulo: string; linhas: string[] }[] {
  const secoes: { titulo: string; linhas: string[] }[] = [];
  let atual: { titulo: string; linhas: string[] } | null = null;
  for (const linha of base.split("\n")) {
    if (linha.startsWith("## ")) {
      atual = { titulo: linha, linhas: [] };
      secoes.push(atual);
    } else if (atual && linha.trim()) {
      atual.linhas.push(linha);
    }
  }
  return secoes;
}

export function termosDoContexto(contexto: string): string[] {
  const palavras = contexto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
  return [...new Set(palavras)].slice(0, 40);
}

/**
 * Recorta a base para caber no prompt.
 *
 * A MJ tem ~4.600 procedimentos (3.400 de laboratório) e a SFP ~2.500: mandar
 * tudo estoura qualquer janela de contexto e ainda dilui o que interessa.
 * Regra: consultas, profissionais, unidades e pagamento vão sempre; dos
 * exames e procedimentos vão os que casam com o assunto da conversa mais os
 * mais procurados, respeitando o teto de caracteres.
 */
export function selecionarParaIA(
  base: string,
  opcoes: { contexto?: string; complemento?: string; teto?: number } = {},
): string {
  const texto0 = (base ?? "").trim();
  if (!texto0) return (opcoes.complemento ?? "").trim();
  const teto = opcoes.teto ?? TETO_PADRAO;
  const complemento = (opcoes.complemento ?? "").trim();
  const rodape = complemento ? `\n\n${SECOES.complemento}\n${complemento}` : "";

  const secoes = seccionar(texto0);
  const cabecalho = texto0.split("\n")[0] ?? "";
  const termos = termosDoContexto(opcoes.contexto ?? "");

  const partes: string[] = [cabecalho];
  let usado = cabecalho.length + rodape.length;

  const anexar = (titulo: string, linhas: string[]) => {
    if (!linhas.length) return;
    const escolhidas: string[] = [];
    let tamanho = titulo.length + 2;
    for (const l of linhas) {
      if (usado + tamanho + l.length + 1 > teto) break;
      escolhidas.push(l);
      tamanho += l.length + 1;
    }
    if (!escolhidas.length) return;
    partes.push([titulo, ...escolhidas].join("\n"));
    usado += tamanho;
  };

  for (const titulo of SECOES_FIXAS) {
    const s = secoes.find((x) => x.titulo === titulo);
    if (s) anexar(s.titulo, s.linhas);
  }

  const relevantes: string[] = [];
  if (termos.length) {
    for (const titulo of [SECOES.exames, SECOES.procedimentos]) {
      const s = secoes.find((x) => x.titulo === titulo);
      if (!s) continue;
      for (const linha of s.linhas) {
        const alvo = linha
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        if (termos.some((t) => alvo.includes(t))) relevantes.push(linha);
      }
    }
  }
  if (relevantes.length) anexar("## RELACIONADO AO ASSUNTO DA CONVERSA", relevantes.slice(0, 400));

  const comuns = secoes.find((x) => x.titulo === SECOES.comuns);
  if (comuns) anexar(comuns.titulo, comuns.linhas.filter((l) => !relevantes.includes(l)));

  return partes.join("\n\n") + rodape;
}
