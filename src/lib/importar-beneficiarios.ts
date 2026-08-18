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
 * perto de 870 KB e só é necessária para quem abre a tela de importação —
 * não deve entrar no pacote que todo mundo baixa ao abrir o sistema.
 */

import { telefoneInutilComoPista } from "@/lib/convenio/vidas-contrato";

/**
 * Onde o cabeçalho costuma ficar quando não dá para detectar (índice 6 =
 * linha 7 na tela do Excel). É só rede de segurança: cada aba tem a sua
 * linha de cabeçalho descoberta em `detectarLinhaCabecalho`, porque no
 * UNIMED_MJ.xlsx a aba 2025 usa a linha 6 e a aba 2026 usa a linha 7.
 */
export const LINHA_CABECALHO_PADRAO = 6;

/** Até onde vale a pena procurar o cabeçalho antes de desistir. */
const MAX_LINHAS_PROCURA_CABECALHO = 25;

/** Abas lidas por padrão. */
export const ABAS_PADRAO = ["2025", "2026"];

export type TipoBeneficiario = "titular" | "dependente";

/** Motivo pelo qual um dependente não pôde ser importado. */
export type MotivoOrfao = "sem-titular-informado" | "titular-nao-encontrado";

/**
 * Telefone gravado quando a planilha não traz nenhum utilizável.
 *
 * O banco tem um gatilho (`pacientes_require_telefone_fn`) que recusa
 * paciente novo sem pelo menos 10 dígitos de telefone — foi ele que barrou 70
 * cadastros na primeira importação. Onze zeros satisfazem o gatilho e já são
 * a marca de "telefone que não serve" reconhecida pelo resto do sistema:
 * `telefoneInutilComoPista` em `src/lib/convenio/vidas-contrato.ts` trata
 * `00000000000` como inútil, e a migration dos boletos (20260812133348) já
 * exclui esse número dos envios.
 *
 * Ou seja: o paciente entra, mas ninguém confunde isso com contato real.
 */
export const TELEFONE_AUSENTE = "00000000000";

export interface LinhaBeneficiario {
  aba: string;
  /** Número da linha como aparece no Excel, para o operador conferir. */
  linhaExcel: number;
  nome: string;
  cpf: string | null;
  /** Só dígitos, já com DDD. `null` quando a planilha não traz nada usável. */
  telefone: string | null;
  nascimento: string | null; // yyyy-mm-dd
  sexo: "masculino" | "feminino" | "outro" | "nao_informar";
  tipo: TipoBeneficiario;
  /** Vira o código de prontuário do paciente. */
  matricula: string;
  /** Matrícula do titular — usada para amarrar o dependente. */
  matriculaTitular: string | null;
}

export interface Orfao {
  linha: LinhaBeneficiario;
  motivo: MotivoOrfao;
}

/**
 * Aviso com categoria, para a tela agrupar. Uma planilha real gera centenas
 * de avisos e uma lista solta com 400 itens não é lida por ninguém — o que
 * interessa é "98 dependentes sem titular informado", com os exemplos à mão.
 */
export interface Aviso {
  categoria: string;
  mensagem: string;
}

export interface GrupoAvisos {
  categoria: string;
  quantidade: number;
  mensagens: string[];
}

export interface AbaLida {
  nome: string;
  /** Linha do cabeçalho como aparece no Excel (1 = primeira linha). */
  linhaCabecalho: number | null;
  linhas: number;
  colunas: Record<string, string | null>;
}

export interface ResultadoLeitura {
  linhas: LinhaBeneficiario[];
  titulares: LinhaBeneficiario[];
  dependentes: LinhaBeneficiario[];
  /** Dependentes que não dá para amarrar a nenhum titular do arquivo. */
  orfaos: Orfao[];
  avisos: Aviso[];
  abas: AbaLida[];
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
      if (k.startsWith(alvo) || k.includes(alvo)) return original;
    }
  }
  return null;
}

/**
 * Descobre em qual linha está o cabeçalho de verdade.
 *
 * Cada aba do arquivo real traz um número diferente de linhas de enfeite
 * antes da tabela (título do relatório, filtros, linhas em branco), então
 * pular um número fixo de linhas quebra silenciosamente: a aba inteira sai
 * da importação sem que ninguém perceba o motivo.
 *
 * Em vez de fixar, cada linha ganha uma pontuação pelos nomes de coluna que
 * reconhece. Vence a linha com mais pontos, e "Nome" mais "Matrícula" são
 * obrigatórios porque são as duas colunas sem as quais nada pode ser
 * importado. Devolve `null` quando nenhuma linha convence.
 */
export function detectarLinhaCabecalho(matriz: unknown[][]): number | null {
  let melhorIndice: number | null = null;
  let melhorPontuacao = 0;

  const limite = Math.min(matriz.length, MAX_LINHAS_PROCURA_CABECALHO);
  for (let i = 0; i < limite; i++) {
    const celulas = (matriz[i] ?? []).map(chaveTexto).filter(Boolean);
    if (!celulas.length) continue;

    const temNome = celulas.some((c) => c === "nome" || c.startsWith("nome "));
    const temMatricula = celulas.some((c) => c.startsWith("matricula"));
    if (!temNome || !temMatricula) continue;

    let pontuacao = 2;
    if (celulas.some((c) => c === "cpf")) pontuacao++;
    if (celulas.some((c) => c.includes("nascimento"))) pontuacao++;
    if (celulas.some((c) => c === "sexo")) pontuacao++;
    if (celulas.some((c) => c.includes("titular ou dependente"))) pontuacao++;
    if (celulas.some((c) => c.includes("matricula titular"))) pontuacao++;

    if (pontuacao > melhorPontuacao) {
      melhorPontuacao = pontuacao;
      melhorIndice = i;
    }
  }
  return melhorIndice;
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

/**
 * Telefone só com dígitos, pronto para o banco (que guarda sem pontuação).
 *
 * Devolve null para tudo que o sistema não aceitaria como contato: menos de
 * 10 dígitos (número sem DDD), e os números de enchimento que o próprio
 * sistema já classifica como inúteis — zeros, dígito repetido, 21999999999.
 * Deixar um desses passar seria pior que o campo vazio: a recepção acharia
 * que tem telefone e ninguém pediria o número certo.
 */
export function normalizarTelefone(valor: unknown): string | null {
  let digitos = String(valor ?? "").replace(/\D/g, "");
  if (!digitos) return null;

  // Código do país e zero de operadora que às vezes vêm colados.
  if (digitos.length > 11 && digitos.startsWith("55")) digitos = digitos.slice(2);
  if (digitos.length > 11 && digitos.startsWith("0")) digitos = digitos.replace(/^0+/, "");

  if (digitos.length < 10 || digitos.length > 11) return null;
  if (telefoneInutilComoPista(digitos)) return null;
  return digitos;
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

/**
 * Excel costuma entregar matrícula numérica como "1234" ou "1234.0".
 * Devolve null para célula vazia e para o lixo que aparece no lugar de uma
 * matrícula ausente ("-", "0", "N/A", "SEM TITULAR"), porque tratar isso
 * como matrícula válida faria o dependente ser amarrado ao titular errado.
 */
export function normalizarMatricula(valor: unknown): string | null {
  const texto = String(valor ?? "")
    .trim()
    .replace(/\.0+$/, "")
    .toUpperCase();
  if (!texto) return null;
  if (/^[-–—.,;/\\_*]+$/.test(texto)) return null;
  if (/^0+$/.test(texto)) return null;
  const semPontuacao = chaveTexto(texto);
  if (["n a", "na", "nao informado", "sem titular", "sem", "nenhum", "null"].includes(semPontuacao))
    return null;
  return texto;
}

/** Nome limpo e dentro do limite da coluna (2 a 200 caracteres). */
export function normalizarNome(valor: unknown): string {
  return String(valor ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

/** Junta os avisos por categoria para a tela não despejar 400 linhas soltas. */
export function agruparAvisos(avisos: Aviso[]): GrupoAvisos[] {
  const mapa = new Map<string, string[]>();
  for (const aviso of avisos) {
    const atual = mapa.get(aviso.categoria);
    if (atual) atual.push(aviso.mensagem);
    else mapa.set(aviso.categoria, [aviso.mensagem]);
  }
  return [...mapa.entries()]
    .map(([categoria, mensagens]) => ({
      categoria,
      quantidade: mensagens.length,
      mensagens,
    }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

/**
 * Lê o arquivo enviado pelo operador e devolve as linhas já conferidas.
 *
 * Nada aqui interrompe a leitura: todo problema vira aviso e as demais
 * linhas seguem. Regras aplicadas:
 * - a linha do cabeçalho é procurada em cada aba, separadamente;
 * - linha sem nome ou sem matrícula é descartada;
 * - matrícula repetida no arquivo: fica a primeira;
 * - CPF repetido no arquivo: o segundo entra sem CPF, porque a tabela
 *   `pacientes` tem CPF único por clínica e o insert inteiro falharia;
 * - dependente sem "Matrícula Titular" preenchida, ou apontando para uma
 *   matrícula que não existe entre os titulares, sai da importação e vira
 *   aviso — não trava a leitura nem entra sem vínculo.
 */
export async function lerPlanilhaBeneficiarios(
  arquivo: ArrayBuffer,
  abasDesejadas: string[] = ABAS_PADRAO,
): Promise<ResultadoLeitura> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(arquivo, { type: "array", cellDates: true });

  const avisos: Aviso[] = [];
  const abas: AbaLida[] = [];
  const lidas: LinhaBeneficiario[] = [];

  const avisar = (categoria: string, mensagem: string) => avisos.push({ categoria, mensagem });

  for (const desejada of abasDesejadas) {
    const nomeReal = wb.SheetNames.find((n) => chaveTexto(n) === chaveTexto(desejada));
    if (!nomeReal) {
      avisar(
        "Aba não encontrada",
        `A aba "${desejada}" não existe neste arquivo. Abas encontradas: ${wb.SheetNames.join(", ")}.`,
      );
      continue;
    }

    const planilha = wb.Sheets[nomeReal];
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(planilha, {
      header: 1,
      blankrows: true,
      defval: null,
    });

    const indiceCabecalho = detectarLinhaCabecalho(matriz);
    if (indiceCabecalho === null) {
      abas.push({ nome: nomeReal, linhaCabecalho: null, linhas: 0, colunas: {} });
      avisar(
        "Cabeçalho não encontrado",
        `Na aba "${nomeReal}" não achei uma linha de cabeçalho com as colunas Nome e Matrícula ` +
          `nas primeiras ${MAX_LINHAS_PROCURA_CABECALHO} linhas.`,
      );
      continue;
    }

    const brutas = XLSX.utils.sheet_to_json<Record<string, unknown>>(planilha, {
      range: indiceCabecalho,
      defval: null,
      blankrows: false,
    });
    if (!brutas.length) {
      abas.push({
        nome: nomeReal,
        linhaCabecalho: indiceCabecalho + 1,
        linhas: 0,
        colunas: {},
      });
      avisar(
        "Aba vazia",
        `A aba "${nomeReal}" não tem dados abaixo do cabeçalho (linha ${indiceCabecalho + 1}).`,
      );
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
    const colTelefone = acharColuna(cabecalhos, [
      "Telefone",
      "Celular",
      "WhatsApp",
      "Fone",
      "Contato",
    ]);
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
      linhaCabecalho: indiceCabecalho + 1,
      linhas: brutas.length,
      colunas: {
        Nome: colNome,
        CPF: colCpf,
        Nascimento: colNascimento,
        Sexo: colSexo,
        Telefone: colTelefone,
        "Titular ou dependente": colTipo,
        Matrícula: colMatricula,
        "Matrícula Titular": colMatriculaTitular,
      },
    });

    if (!colNome || !colMatricula) {
      avisar(
        "Colunas obrigatórias ausentes",
        `Na aba "${nomeReal}" não encontrei as colunas Nome e Matrícula. ` +
          `Cabeçalhos lidos na linha ${indiceCabecalho + 1}: ${cabecalhos.join(" | ")}.`,
      );
      continue;
    }

    brutas.forEach((linha, indice) => {
      const nome = normalizarNome(linha[colNome]);
      const matricula = normalizarMatricula(linha[colMatricula]);
      // O cabeçalho está em `indiceCabecalho + 1`, então os dados começam na
      // linha seguinte.
      const linhaExcel = indice + indiceCabecalho + 2;

      if (nome.length < 2) return; // linha em branco ou rodapé
      if (!matricula) {
        avisar(
          "Sem matrícula",
          `${nomeReal}, linha ${linhaExcel}: "${nome}" está sem matrícula — ignorado.`,
        );
        return;
      }

      lidas.push({
        aba: nomeReal,
        linhaExcel,
        nome,
        cpf: colCpf ? normalizarCpf(linha[colCpf]) : null,
        telefone: colTelefone ? normalizarTelefone(linha[colTelefone]) : null,
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
      avisar(
        "Matrícula repetida",
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
      avisar(
        "CPF repetido",
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

  const dependentes: LinhaBeneficiario[] = [];
  const orfaos: Orfao[] = [];
  for (const d of linhas) {
    if (d.tipo !== "dependente") continue;

    if (!d.matriculaTitular) {
      orfaos.push({ linha: d, motivo: "sem-titular-informado" });
      avisar(
        "Dependente sem titular informado",
        `Dependente "${d.nome}" (${d.aba}, linha ${d.linhaExcel}) ignorado: a planilha não informa ` +
          `a Matrícula Titular.`,
      );
      continue;
    }
    if (!matriculasDeTitular.has(d.matriculaTitular)) {
      orfaos.push({ linha: d, motivo: "titular-nao-encontrado" });
      avisar(
        "Titular não encontrado",
        `Dependente "${d.nome}" (${d.aba}, linha ${d.linhaExcel}) ignorado: a Matrícula Titular ` +
          `"${d.matriculaTitular}" não existe entre os titulares do arquivo.`,
      );
      continue;
    }
    dependentes.push(d);
  }

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
