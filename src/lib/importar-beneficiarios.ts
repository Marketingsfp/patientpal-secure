/**
 * Leitura e conferência da planilha de beneficiários do Cartão Benefícios
 * (arquivo UNIMED_MJ.xlsx e parecidos).
 *
 * Este arquivo NÃO fala com o banco: ele só transforma o Excel em linhas
 * limpas e aponta os problemas. Quem grava é a tela
 * `app.cartao-beneficios.importar.tsx`. Separado assim porque as regras de
 * limpeza (CPF sem zero à esquerda, data em formato brasileiro, "M"/"F")
 * precisam de teste automatizado, e teste de tela é caro.
 *
 * A biblioteca `xlsx` é carregada sob demanda (import dinâmico): ela pesa
 * perto de 400 KB e só é necessária para quem abre a tela de importação —
 * não deve entrar no pacote que todo mundo baixa ao abrir o sistema.
 */

/** Linha de cabeçalho da planilha (linha 7 na tela do Excel = índice 6). */
export const LINHAS_IGNORADAS = 6;

/** Abas lidas por padrão. */
export const ABAS_PADRAO = ["2025", "2026"];

export type TipoBeneficiario = "titular" | "dependente";

export interface LinhaBeneficiario {
  aba: string;
  /** Número da linha como aparece no Excel, para o operador conferir. */
  linhaExcel: number;
  nome: string;
  cpf: string | null;
  nascimento: string | null; // yyyy-mm-dd
  sexo: "masculino" | "feminino" | "outro" | "nao_informar";
  tipo: TipoBeneficiario;
  /** Vira o código de prontuário do paciente. */
  matricula: string;
  /** Matrícula do titular — usada para amarrar o dependente. */
  matriculaTitular: string | null;
}

export interface ResultadoLeitura {
  linhas: LinhaBeneficiario[];
  titulares: LinhaBeneficiario[];
  dependentes: LinhaBeneficiario[];
  /** Dependentes cuja "Matrícula Titular" não existe entre os titulares. */
  orfaos: LinhaBeneficiario[];
  avisos: string[];
  /** Uma entrada por aba lida, para mostrar na tela o que foi reconhecido. */
  abas: {
    nome: string;
    linhas: number;
    colunas: Record<string, string | null>;
  }[];
}

/** Tira acentos, deixa minúsculo e troca pontuação por espaço. */
export function chaveTexto(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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
      if (k.startsWith(alvo) || k.includes(alvo)) return original;
    }
  }
  return null;
}

/**
 * CPF só com dígitos. Devolve null quando não dá para confiar — o Excel come
 * o zero à esquerda e transforma "012..." em 11 dígitos falsos ou 10 reais.
 * A tabela `pacientes` exige 11 a 14 caracteres e recusa CPF repetido na
 * mesma clínica, então CPF duvidoso entra vazio em vez de derrubar a linha.
 */
export function normalizarCpf(valor: unknown): string | null {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (digitos.length !== 11) return null;
  if (/^(\d)\1{10}$/.test(digitos)) return null;
  return digitos;
}

/** Converte para yyyy-mm-dd aceitando Date, "dd/mm/aaaa", ISO e serial do Excel. */
export function normalizarData(valor: unknown): string | null {
  if (valor == null || valor === "") return null;

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const ano = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const dia = String(valor.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  const texto = String(valor).trim();

  const brasileira = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (brasileira) {
    const dia = brasileira[1];
    const mes = brasileira[2];
    let ano = brasileira[3];
    if (ano.length === 2) ano = Number(ano) > 30 ? `19${ano}` : `20${ano}`;
    const d = Number(dia);
    const m = Number(mes);
    if (d < 1 || d > 31 || m < 1 || m > 12) return null;
    return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  }

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Número de série do Excel: dias contados a partir de 30/12/1899.
  const serial = Number(texto);
  if (Number.isFinite(serial) && serial > 0 && serial < 80000) {
    const data = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return data.toISOString().slice(0, 10);
  }

  return null;
}

/** A tabela `pacientes` só aceita masculino | feminino | outro | nao_informar. */
export function normalizarSexo(valor: unknown): LinhaBeneficiario["sexo"] {
  const k = chaveTexto(valor);
  if (!k) return "nao_informar";
  if (k.startsWith("m")) return "masculino";
  if (k.startsWith("f")) return "feminino";
  return "outro";
}

/** "TITULAR", "DEPENDENTE", "AGREGADO" e abreviações. Vazio vira titular. */
export function normalizarTipo(valor: unknown): TipoBeneficiario {
  const k = chaveTexto(valor);
  if (k.startsWith("d") || k.startsWith("a")) return "dependente";
  return "titular";
}

/** Excel costuma entregar matrícula numérica como "1234" ou "1234.0". */
export function normalizarMatricula(valor: unknown): string | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  return texto.replace(/\.0+$/, "").toUpperCase();
}

/** Nome limpo e dentro do limite da coluna (2 a 200 caracteres). */
export function normalizarNome(valor: unknown): string {
  return String(valor ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

/**
 * Lê o arquivo enviado pelo operador e devolve as linhas já conferidas.
 *
 * Regras aplicadas aqui (todas viram aviso na tela, nunca erro silencioso):
 * - linha sem nome ou sem matrícula é descartada;
 * - matrícula repetida no arquivo: fica a primeira;
 * - CPF repetido no arquivo: o segundo entra sem CPF, porque a tabela
 *   `pacientes` tem CPF único por clínica e o insert inteiro falharia;
 * - dependente cuja "Matrícula Titular" não aparece entre os titulares é
 *   separado em `orfaos` e não é importado.
 */
export async function lerPlanilhaBeneficiarios(
  arquivo: ArrayBuffer,
  abasDesejadas: string[] = ABAS_PADRAO,
): Promise<ResultadoLeitura> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(arquivo, { type: "array", cellDates: true });

  const avisos: string[] = [];
  const abas: ResultadoLeitura["abas"] = [];
  const lidas: LinhaBeneficiario[] = [];

  for (const desejada of abasDesejadas) {
    const nomeReal = wb.SheetNames.find((n) => chaveTexto(n) === chaveTexto(desejada));
    if (!nomeReal) {
      avisos.push(
        `A aba "${desejada}" não existe neste arquivo. Abas encontradas: ${wb.SheetNames.join(", ")}.`,
      );
      continue;
    }

    const brutas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nomeReal], {
      range: LINHAS_IGNORADAS,
      defval: null,
      blankrows: false,
    });
    if (!brutas.length) {
      avisos.push(`A aba "${nomeReal}" não tem dados a partir da linha 7.`);
      continue;
    }

    const cabecalhos = Object.keys(brutas[0]);
    const colNome = acharColuna(cabecalhos, ["Nome", "Nome Completo", "Beneficiario"]);
    const colCpf = acharColuna(cabecalhos, ["CPF"]);
    const colNascimento = acharColuna(cabecalhos, [
      "Nascimento",
      "Data Nascimento",
      "Data de Nascimento",
    ]);
    const colSexo = acharColuna(cabecalhos, ["Sexo"]);
    const colTipo = acharColuna(cabecalhos, [
      "TITULAR OU DEPENDENTE?",
      "Titular ou Dependente",
      "Tipo",
    ]);
    const colMatriculaTitular = acharColuna(cabecalhos, ["Matricula Titular"]);
    // Procurada depois da "Matrícula Titular" para as duas não se confundirem.
    const colMatricula =
      cabecalhos.find((h) => h !== colMatriculaTitular && /^matricula/.test(chaveTexto(h))) ?? null;

    abas.push({
      nome: nomeReal,
      linhas: brutas.length,
      colunas: {
        Nome: colNome,
        CPF: colCpf,
        Nascimento: colNascimento,
        Sexo: colSexo,
        "Titular ou dependente": colTipo,
        Matrícula: colMatricula,
        "Matrícula Titular": colMatriculaTitular,
      },
    });

    if (!colNome || !colMatricula) {
      avisos.push(
        `Na aba "${nomeReal}" não encontrei as colunas obrigatórias Nome e Matrícula. ` +
          `Cabeçalhos lidos na linha 7: ${cabecalhos.join(" | ")}.`,
      );
      continue;
    }

    brutas.forEach((linha, indice) => {
      const nome = normalizarNome(linha[colNome]);
      const matricula = normalizarMatricula(linha[colMatricula]);
      // 7 é o cabeçalho, então os dados começam na linha 8 do Excel.
      const linhaExcel = indice + LINHAS_IGNORADAS + 2;

      if (nome.length < 2) return; // linha em branco ou rodapé
      if (!matricula) {
        avisos.push(`${nomeReal}, linha ${linhaExcel}: "${nome}" está sem matrícula — ignorado.`);
        return;
      }

      lidas.push({
        aba: nomeReal,
        linhaExcel,
        nome,
        cpf: colCpf ? normalizarCpf(linha[colCpf]) : null,
        nascimento: colNascimento ? normalizarData(linha[colNascimento]) : null,
        sexo: colSexo ? normalizarSexo(linha[colSexo]) : "nao_informar",
        tipo: colTipo ? normalizarTipo(linha[colTipo]) : "titular",
        matricula,
        matriculaTitular: colMatriculaTitular
          ? normalizarMatricula(linha[colMatriculaTitular])
          : null,
      });
    });
  }

  // Matrícula repetida: fica a primeira ocorrência.
  const porMatricula = new Map<string, LinhaBeneficiario>();
  const linhas: LinhaBeneficiario[] = [];
  for (const l of lidas) {
    const anterior = porMatricula.get(l.matricula);
    if (anterior) {
      avisos.push(
        `Matrícula ${l.matricula} aparece mais de uma vez: fica "${anterior.nome}" ` +
          `(${anterior.aba}, linha ${anterior.linhaExcel}) e sai "${l.nome}" ` +
          `(${l.aba}, linha ${l.linhaExcel}).`,
      );
      continue;
    }
    porMatricula.set(l.matricula, l);
    linhas.push(l);
  }

  // CPF repetido dentro do arquivo: o banco só aceita um CPF por clínica.
  const porCpf = new Map<string, LinhaBeneficiario>();
  for (const l of linhas) {
    if (!l.cpf) continue;
    const anterior = porCpf.get(l.cpf);
    if (anterior) {
      avisos.push(
        `CPF repetido no arquivo entre "${anterior.nome}" (matrícula ${anterior.matricula}) e ` +
          `"${l.nome}" (matrícula ${l.matricula}). O segundo será cadastrado sem CPF.`,
      );
      l.cpf = null;
    } else {
      porCpf.set(l.cpf, l);
    }
  }

  const titulares = linhas.filter((l) => l.tipo === "titular");
  const matriculasDeTitular = new Set(titulares.map((t) => t.matricula));
  const dependentesTodos = linhas.filter((l) => l.tipo === "dependente");

  const orfaos = dependentesTodos.filter(
    (d) => !d.matriculaTitular || !matriculasDeTitular.has(d.matriculaTitular),
  );
  for (const d of orfaos) {
    avisos.push(
      `Dependente "${d.nome}" (${d.aba}, linha ${d.linhaExcel}): a Matrícula Titular ` +
        `"${d.matriculaTitular ?? "(vazia)"}" não existe entre os titulares do arquivo — não será importado.`,
    );
  }
  const dependentes = dependentesTodos.filter((d) => !orfaos.includes(d));

  return { linhas, titulares, dependentes, orfaos, avisos, abas };
}

/**
 * Data de início do contrato a partir do nome da aba: "2025" vira 01/01/2025.
 * Aba sem ano reconhecível cai para a data informada (normalmente hoje).
 */
export function inicioContratoDaAba(aba: string, padraoIso: string): string {
  const ano = Number(aba.match(/\d{4}/)?.[0]);
  if (ano >= 2000 && ano <= 2100) return `${ano}-01-01`;
  return padraoIso;
}

/** Soma meses a uma data ISO e volta um dia (fim de vigência). */
export function fimDeVigencia(inicioIso: string, meses: number): string {
  const [ano, mes, dia] = inicioIso.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1 + meses, dia));
  data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}
