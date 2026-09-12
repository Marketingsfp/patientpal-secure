/**
 * Leitura e conferência da planilha do Catálogo de Serviços.
 *
 * Este arquivo NÃO fala com o banco: ele só transforma a planilha em linhas
 * limpas e aponta os problemas. Quem grava é a tela
 * `app.procedimentos.importar.tsx`. Separado assim porque as regras de
 * limpeza (valor em formato brasileiro, "Sim"/"Não", categoria no plural)
 * precisam de teste automatizado, e teste de tela é caro.
 *
 * A biblioteca `xlsx` é carregada sob demanda (import dinâmico): ela pesa
 * perto de 870 KB e só é necessária para quem abre a tela de importação —
 * não deve entrar no pacote que todo mundo baixa ao abrir o sistema.
 */

/** Até onde vale a pena procurar o cabeçalho antes de desistir. */
const MAX_LINHAS_PROCURA_CABECALHO = 25;

/** As três categorias aceitas pelo catálogo. */
export const CATEGORIAS_VALIDAS = ["consulta", "exame", "procedimento"] as const;
export type CategoriaServico = (typeof CATEGORIAS_VALIDAS)[number];

export interface LinhaServico {
  /** Número da linha como aparece no Excel, para a funcionária conferir. */
  linhaExcel: number;
  nome: string;
  especialidade: string | null;
  categoria: CategoriaServico;
  codigo: string | null;
  valorDinheiro: number;
  valorCartao: number;
  valorCartaoConsulta: number;
  valorCartaoDesconto: number;
  duracaoMinutos: number;
  preparo: string | null;
  ativo: boolean;
  /** Lida só para avisar: repasse é cadastrado por médico, não no serviço. */
  repasse: number | null;
}

export interface LinhaRecusada {
  linhaExcel: number;
  nome: string;
  motivo: string;
}

export interface ResultadoLeituraServicos {
  /** Linhas boas, prontas para gravar. */
  linhas: LinhaServico[];
  /** Linhas que ficaram de fora, com o motivo em português simples. */
  recusadas: LinhaRecusada[];
  /** Especialidades da planilha que ainda não existem no cadastro. */
  especialidadesNovas: string[];
  /** Linha do cabeçalho como aparece no Excel (1 = primeira linha). */
  linhaCabecalho: number | null;
  /** Rótulo reconhecido -> nome real da coluna encontrada na planilha. */
  colunas: Record<string, string | null>;
}

/** Tira acentos, deixa minúsculo e troca pontuação por espaço. */
export function chaveTexto(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Acha o nome real de uma coluna a partir de apelidos possíveis. */
export function acharColuna(cabecalhos: string[], apelidos: string[]): string | null {
  const mapa = new Map(cabecalhos.map((h) => [chaveTexto(h), h]));
  for (const apelido of apelidos) {
    const exato = mapa.get(chaveTexto(apelido));
    if (exato) return exato;
  }
  for (const apelido of apelidos) {
    const alvo = chaveTexto(apelido);
    if (!alvo) continue;
    for (const [k, original] of mapa) {
      if (k.startsWith(alvo)) return original;
    }
  }
  return null;
}

/** Texto limpo em MAIÚSCULAS — é como o catálogo já está cadastrado. */
export function normalizarMaiusculas(valor: unknown, limite = 200): string {
  return String(valor ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .slice(0, limite);
}

/** Texto limpo, do jeito que foi digitado (o paciente lê o preparo). */
export function normalizarTexto(valor: unknown, limite = 2000): string {
  return String(valor ?? "")
    .trim()
    .replace(/[ \t]+/g, " ")
    .slice(0, limite);
}

/**
 * Valor em reais aceitando o que aparece na vida real: "R$ 1.234,56",
 * "1234.56", "80", número puro do Excel e célula vazia (= 0).
 */
export function normalizarValor(valor: unknown): number {
  if (valor == null || valor === "") return 0;
  if (typeof valor === "number") return Number.isFinite(valor) ? Math.max(0, valor) : 0;

  let texto = String(valor)
    .replace(/r\$/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!texto) return 0;

  const temVirgula = texto.includes(",");
  const temPonto = texto.includes(".");
  if (temVirgula && temPonto) {
    // Formato brasileiro: ponto é milhar, vírgula é decimal.
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    texto = texto.replace(",", ".");
  }

  const numero = Number(texto);
  if (!Number.isFinite(numero)) return 0;
  return Math.max(0, numero);
}

/** Duração em minutos; vazio ou inválido volta ao padrão de 30. */
export function normalizarDuracao(valor: unknown): number {
  const numero = Math.round(normalizarValor(valor));
  if (!numero || numero <= 0) return 30;
  return numero;
}

/** "Sim"/"Ativo"/"1"/vazio = ativo; "Não"/"Inativo"/"0"/"false" = inativo. */
export function normalizarAtivo(valor: unknown): boolean {
  if (typeof valor === "boolean") return valor;
  const k = chaveTexto(valor);
  if (!k) return true;
  if (["nao", "n", "inativo", "0", "false", "desativado"].includes(k)) return false;
  return true;
}

/**
 * Categoria do serviço. Compara sem acento e sem caixa, aceitando plural.
 * Vazio vira `exame`, que é o padrão do formulário. `null` = não reconhecida.
 */
export function normalizarCategoria(valor: unknown): CategoriaServico | null {
  const k = chaveTexto(valor);
  if (!k) return "exame";
  const singular = k.replace(/s$/, "");
  if (singular === "consulta") return "consulta";
  if (singular === "exame") return "exame";
  if (singular === "procedimento") return "procedimento";
  return null;
}

/** Compara nomes ignorando caixa, acento e espaços sobrando. */
export function chaveNomeServico(valor: unknown): string {
  return chaveTexto(valor);
}

/**
 * Descobre em qual linha está o cabeçalho de verdade.
 *
 * A planilha oficial das clínicas costuma trazer título e linhas em branco
 * antes da tabela. Cada linha ganha uma pontuação pelos nomes de coluna que
 * reconhece; vence a que tiver mais pontos, e a coluna do nome do serviço é
 * obrigatória porque sem ela nada pode ser importado.
 */
export function detectarLinhaCabecalho(matriz: unknown[][]): number | null {
  let melhorIndice: number | null = null;
  let melhorPontuacao = 0;

  const limite = Math.min(matriz.length, MAX_LINHAS_PROCURA_CABECALHO);
  for (let i = 0; i < limite; i++) {
    const celulas = (matriz[i] ?? []).map(chaveTexto).filter(Boolean);
    if (!celulas.length) continue;

    const temNome = celulas.some(
      (c) => c === "nome" || c.startsWith("nome ") || c === "servico" || c === "procedimento",
    );
    if (!temNome) continue;

    let pontuacao = 1;
    if (celulas.some((c) => c.startsWith("especialidade") || c === "grupo")) pontuacao++;
    if (celulas.some((c) => c.startsWith("categoria") || c === "tipo")) pontuacao++;
    if (celulas.some((c) => c.startsWith("dinheiro") || c.startsWith("valor"))) pontuacao++;
    if (celulas.some((c) => c.startsWith("cartao"))) pontuacao++;
    if (celulas.some((c) => c.startsWith("duracao"))) pontuacao++;
    if (celulas.some((c) => c === "ativo" || c.startsWith("situacao"))) pontuacao++;
    if (celulas.some((c) => c.startsWith("codigo"))) pontuacao++;

    if (pontuacao > melhorPontuacao) {
      melhorPontuacao = pontuacao;
      melhorIndice = i;
    }
  }
  return melhorIndice;
}

/** Tira o BOM do UTF-8 que o Excel grava no começo do CSV. */
function semBom(texto: string): string {
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

function pareceCsv(nomeArquivo: string | undefined, bytes: Uint8Array): boolean {
  if (nomeArquivo && /\.csv$/i.test(nomeArquivo)) return true;
  // .xlsx é um zip ("PK"), .xls começa com 0xD0CF. Qualquer outra coisa é texto.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return false;
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return false;
  return true;
}

const COLUNAS = {
  nome: ["Nome", "Nome do Serviço", "Servico", "Serviço", "Procedimento"],
  especialidade: ["Especialidade", "Grupo"],
  categoria: ["Categoria", "Tipo"],
  codigo: ["Código", "Codigo"],
  dinheiro: ["Dinheiro (R$)", "Valor Dinheiro", "Dinheiro", "Valor"],
  cartao: [
    "Cartão (R$)",
    "Valor Cartão",
    "Cartão",
    "Cartao",
    "Débito",
    "Crédito",
    "Valor Cartão/Débito/Crédito",
  ],
  cartaoConsulta: ["Cartão Consulta (R$)", "Cartao Consulta", "Cartão Consulta"],
  cartaoDesconto: ["Cartão Desconto (R$)", "Cartao Desconto", "Cartão Desconto"],
  duracao: ["Duração (min)", "Duracao", "Duração", "Tempo"],
  preparo: ["Preparo"],
  ativo: ["Ativo", "Situação", "Situacao", "Status"],
  repasse: ["Repasse", "Repasse Médico", "% Repasse"],
};

export interface OpcoesLeituraServicos {
  /** Nome do arquivo, só para saber se é CSV. */
  nomeArquivo?: string;
  /** Especialidades já cadastradas, para apontar as que faltam. */
  especialidadesExistentes?: string[];
}

/**
 * Lê o arquivo enviado pela funcionária e devolve as linhas já conferidas.
 *
 * Nada aqui interrompe a leitura: todo problema vira uma linha recusada e as
 * demais seguem. Regras aplicadas:
 * - linha sem nome é recusada;
 * - categoria fora de consulta/exame/procedimento é recusada;
 * - nome repetido dentro da própria planilha: fica a primeira ocorrência.
 */
export async function lerPlanilhaServicos(
  arquivo: ArrayBuffer,
  opcoes: OpcoesLeituraServicos = {},
): Promise<ResultadoLeituraServicos> {
  const XLSX = await import("xlsx");
  const bytes = new Uint8Array(arquivo);

  let wb: import("xlsx").WorkBook;
  if (pareceCsv(opcoes.nomeArquivo, bytes)) {
    const texto = semBom(new TextDecoder("utf-8").decode(bytes));
    const primeiraLinha = texto.split(/\r?\n/)[0] ?? "";
    const separador = (primeiraLinha.match(/;/g) ?? []).length >= (primeiraLinha.match(/,/g) ?? []).length
      ? ";"
      : ",";
    wb = XLSX.read(texto, { type: "string", FS: separador, raw: true });
  } else {
    wb = XLSX.read(arquivo, { type: "array" });
  }

  const vazio: ResultadoLeituraServicos = {
    linhas: [],
    recusadas: [],
    especialidadesNovas: [],
    linhaCabecalho: null,
    colunas: {},
  };

  const nomeAba = wb.SheetNames[0];
  if (!nomeAba) return vazio;
  const planilha = wb.Sheets[nomeAba];

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(planilha, {
    header: 1,
    blankrows: true,
    defval: null,
  });
  const indiceCabecalho = detectarLinhaCabecalho(matriz);
  if (indiceCabecalho === null) return vazio;

  const brutas = XLSX.utils.sheet_to_json<Record<string, unknown>>(planilha, {
    range: indiceCabecalho,
    defval: null,
    blankrows: false,
  });

  const cabecalhos = brutas.length ? Object.keys(brutas[0]) : [];
  const col = {
    nome: acharColuna(cabecalhos, COLUNAS.nome),
    especialidade: acharColuna(cabecalhos, COLUNAS.especialidade),
    categoria: acharColuna(cabecalhos, COLUNAS.categoria),
    codigo: acharColuna(cabecalhos, COLUNAS.codigo),
    dinheiro: acharColuna(cabecalhos, COLUNAS.dinheiro),
    cartaoConsulta: acharColuna(cabecalhos, COLUNAS.cartaoConsulta),
    cartaoDesconto: acharColuna(cabecalhos, COLUNAS.cartaoDesconto),
    duracao: acharColuna(cabecalhos, COLUNAS.duracao),
    preparo: acharColuna(cabecalhos, COLUNAS.preparo),
    ativo: acharColuna(cabecalhos, COLUNAS.ativo),
    repasse: acharColuna(cabecalhos, COLUNAS.repasse),
  };
  // "Cartão" é procurado depois das outras três para não roubar a coluna delas.
  const usadas = new Set(
    [col.cartaoConsulta, col.cartaoDesconto, col.dinheiro].filter(Boolean) as string[],
  );
  const colCartao =
    acharColuna(
      cabecalhos.filter((h) => !usadas.has(h)),
      COLUNAS.cartao,
    ) ?? null;

  const colunas: Record<string, string | null> = {
    Nome: col.nome,
    Especialidade: col.especialidade,
    Categoria: col.categoria,
    Código: col.codigo,
    "Dinheiro (R$)": col.dinheiro,
    "Cartão (R$)": colCartao,
    "Cartão Consulta (R$)": col.cartaoConsulta,
    "Cartão Desconto (R$)": col.cartaoDesconto,
    "Duração (min)": col.duracao,
    Preparo: col.preparo,
    Ativo: col.ativo,
    Repasse: col.repasse,
  };

  const linhas: LinhaServico[] = [];
  const recusadas: LinhaRecusada[] = [];
  const vistos = new Map<string, number>();

  if (!col.nome) {
    return { ...vazio, linhaCabecalho: indiceCabecalho + 1, colunas };
  }

  brutas.forEach((bruta, indice) => {
    const linhaExcel = indice + indiceCabecalho + 2;
    const nome = normalizarMaiusculas(bruta[col.nome!]);

    const vaziaDeVerdade = Object.values(bruta).every(
      (v) => v == null || String(v).trim() === "",
    );
    if (vaziaDeVerdade) return;

    if (!nome) {
      recusadas.push({
        linhaExcel,
        nome: "",
        motivo: "A linha está sem o nome do serviço.",
      });
      return;
    }

    const categoria = col.categoria ? normalizarCategoria(bruta[col.categoria]) : "exame";
    if (!categoria) {
      recusadas.push({
        linhaExcel,
        nome,
        motivo: `A categoria "${String(bruta[col.categoria!] ?? "").trim()}" não existe. Use Consulta, Exame ou Procedimento.`,
      });
      return;
    }

    const chave = chaveNomeServico(nome);
    const primeira = vistos.get(chave);
    if (primeira) {
      recusadas.push({
        linhaExcel,
        nome,
        motivo: `Este serviço já aparece na linha ${primeira} da planilha. Só a primeira será importada.`,
      });
      return;
    }
    vistos.set(chave, linhaExcel);

    const repasseBruto = col.repasse ? bruta[col.repasse] : null;
    const repasse =
      repasseBruto == null || String(repasseBruto).trim() === ""
        ? null
        : normalizarValor(repasseBruto);

    linhas.push({
      linhaExcel,
      nome,
      especialidade: col.especialidade
        ? normalizarMaiusculas(bruta[col.especialidade], 120) || null
        : null,
      categoria,
      codigo: col.codigo ? normalizarMaiusculas(bruta[col.codigo], 60) || null : null,
      valorDinheiro: col.dinheiro ? normalizarValor(bruta[col.dinheiro]) : 0,
      valorCartao: colCartao ? normalizarValor(bruta[colCartao]) : 0,
      valorCartaoConsulta: col.cartaoConsulta ? normalizarValor(bruta[col.cartaoConsulta]) : 0,
      valorCartaoDesconto: col.cartaoDesconto ? normalizarValor(bruta[col.cartaoDesconto]) : 0,
      duracaoMinutos: col.duracao ? normalizarDuracao(bruta[col.duracao]) : 30,
      preparo: col.preparo ? normalizarTexto(bruta[col.preparo]) || null : null,
      ativo: col.ativo ? normalizarAtivo(bruta[col.ativo]) : true,
      repasse,
    });
  });

  const jaCadastradas = new Set((opcoes.especialidadesExistentes ?? []).map(chaveTexto));
  const novas = new Map<string, string>();
  for (const l of linhas) {
    if (!l.especialidade) continue;
    const k = chaveTexto(l.especialidade);
    if (!k || jaCadastradas.has(k) || novas.has(k)) continue;
    novas.set(k, l.especialidade);
  }

  return {
    linhas,
    recusadas,
    especialidadesNovas: [...novas.values()].sort((a, b) => a.localeCompare(b, "pt-BR")),
    linhaCabecalho: indiceCabecalho + 1,
    colunas,
  };
}
