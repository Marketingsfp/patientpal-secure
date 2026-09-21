/**
 * Leitura e conferência da planilha de importação de médicos.
 *
 * Este arquivo NÃO fala com o banco: ele transforma a planilha em linhas
 * limpas, aponta os problemas e cruza o resultado com o que a clínica já tem
 * cadastrado. Quem grava é a tela `app.equipe.importar.tsx`. Separado assim
 * porque as regras (repasse em branco x zero, médico repetido, serviço que
 * não existe) precisam de teste automatizado, e teste de tela é caro.
 *
 * A planilha tem duas abas:
 *  - "Médicos": um médico por linha, com dados cadastrais e o repasse padrão;
 *  - "Repasse por serviço": os serviços que cada médico atende. Célula de
 *    repasse EM BRANCO = usa o repasse padrão do médico; 0 digitado = aquele
 *    serviço não paga repasse. É a mesma regra do cadastro manual.
 *
 * A biblioteca `xlsx` é carregada sob demanda (import dinâmico): ela pesa
 * perto de 870 KB e só é necessária para quem abre a tela de importação.
 */

import {
  abrirPlanilhaOuCsv,
  acharColuna,
  chaveTexto,
  normalizarMaiusculas,
  normalizarTexto,
} from "./importar-servicos";
import { normalizarData } from "./importar-beneficiarios";

/** Até onde vale a pena procurar o cabeçalho antes de desistir. */
const MAX_LINHAS_PROCURA_CABECALHO = 25;

export const ABA_MEDICOS = "Médicos";
export const ABA_REPASSES = "Repasse por serviço";

export type TipoRepasse = "percentual" | "valor";
export type Sexo = "masculino" | "feminino" | "outro" | "nao_informar";

export interface LinhaMedico {
  /** Número da linha como aparece no Excel, para a funcionária conferir. */
  linhaExcel: number;
  nome: string;
  crm: string;
  crmUf: string;
  /** Na ordem da planilha; a primeira é a principal. */
  especialidades: string[];
  rqe: string | null;
  cpf: string | null;
  dataNascimento: string | null;
  sexo: Sexo;
  email: string | null;
  telefone: string | null;
  telefone2: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  pixChave: string | null;
  /** `null` = a planilha não tem a coluna de repasse; vale o informado na tela. */
  tipoRepasse: TipoRepasse | null;
  repassePadrao: number | null;
  aceitaCartaoBeneficios: boolean;
  duracaoConsultaMin: number;
  ativo: boolean;
  /** Dados que faltaram na planilha; o médico entra e é completado no cadastro. */
  pendencias: string[];
}

export interface LinhaRepasseServico {
  linhaExcel: number;
  medicoNome: string;
  medicoCrm: string | null;
  servico: string;
  /** `null` = segue o tipo do repasse padrão do médico. */
  tipoRepasse: TipoRepasse | null;
  /** `null` = em branco (usa o padrão). 0 = sem repasse. */
  particular: number | null;
  convenio: number | null;
  cartaoConsulta: number | null;
  cartaoDesconto: number | null;
}

export interface LinhaRecusada {
  aba: string;
  linhaExcel: number;
  nome: string;
  motivo: string;
}

export interface ResultadoLeituraMedicos {
  medicos: LinhaMedico[];
  repasses: LinhaRepasseServico[];
  recusadas: LinhaRecusada[];
  /** Nome real das abas encontradas (null = não achou). */
  abaMedicos: string | null;
  abaRepasses: string | null;
  /** A aba de médicos não tem a coluna Repasse Padrão (planilha de outro sistema). */
  semRepasse: boolean;
}

export interface OpcoesLeituraMedicos {
  /** UF da clínica: vale como UF do CRM quando a planilha não informa. */
  ufPadrao?: string | null;
}

// ---------------------------------------------------------------------------
// Limpeza de células
// ---------------------------------------------------------------------------

const vazio = (v: unknown) => v == null || String(v).trim() === "";

/**
 * Número de repasse distinguindo EM BRANCO de ZERO.
 * `null` = célula vazia; `NaN` = texto que não é número (vira erro na linha).
 * Aceita "50%", "R$ 70,00", "1.234,56", "70.5" e número puro do Excel.
 */
export function numeroOuNulo(valor: unknown): number | null {
  if (vazio(valor)) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : NaN;

  let texto = String(valor).replace(/r\$/gi, "").replace(/%/g, "").replace(/\s/g, "").trim();
  if (!texto) return NaN;

  const temVirgula = texto.includes(",");
  const temPonto = texto.includes(".");
  if (temVirgula && temPonto) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    texto = texto.replace(",", ".");
  }
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : NaN;
}

/** "Percentual", "%", "Porcentagem" / "Valor", "R$", "Fixo". `null` = vazio ou não reconhecido. */
export function normalizarTipoRepasse(valor: unknown): TipoRepasse | null {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return null;
  if (bruto.includes("%")) return "percentual";
  if (/r\$/i.test(bruto)) return "valor";
  const k = chaveTexto(bruto);
  if (["percentual", "porcentagem", "percentagem", "porcento", "pct", "p"].includes(k)) {
    return "percentual";
  }
  if (["valor", "valor fixo", "fixo", "reais", "rs", "v"].includes(k)) return "valor";
  return null;
}

/** Sim/Não; vazio devolve o padrão informado. */
export function normalizarSimNao(valor: unknown, padrao: boolean): boolean {
  if (typeof valor === "boolean") return valor;
  const k = chaveTexto(valor);
  if (!k) return padrao;
  if (["nao", "n", "inativo", "0", "false", "desativado"].includes(k)) return false;
  if (["sim", "s", "ativo", "1", "true"].includes(k)) return true;
  return padrao;
}

export function normalizarSexo(valor: unknown): Sexo {
  const k = chaveTexto(valor);
  if (["m", "masculino", "masc", "homem"].includes(k)) return "masculino";
  if (["f", "feminino", "fem", "mulher"].includes(k)) return "feminino";
  if (["outro", "o"].includes(k)) return "outro";
  return "nao_informar";
}

/** CPF com máscara (é como o cadastro manual grava). `""` = inválido; `null` = vazio. */
export function normalizarCpf(valor: unknown): string | null {
  if (vazio(valor)) return null;
  let d = String(valor).replace(/\D/g, "");
  // O Excel come o zero à esquerda quando a coluna é número.
  if (d.length > 0 && d.length < 11) d = d.padStart(11, "0");
  if (d.length !== 11) return "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Chave de comparação de CRM: só letras e números, sem zero à esquerda. */
export function chaveCrm(crm: unknown, uf: unknown): string {
  const numero = String(crm ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^0+/, "");
  const estado = String(uf ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return numero ? `${numero}|${estado}` : "";
}

/** Nome sem "Dr."/"Dra." — o cadastro manual grava assim. */
export function limparPrefixoMedico(nome: string): string {
  return nome.replace(/^(\s*(dr|dra)\.?\s+)+/i, "").trim();
}

/** Chave de comparação de nome de médico. */
export function chaveNomeMedico(nome: unknown): string {
  return chaveTexto(limparPrefixoMedico(String(nome ?? "")));
}

/** "CARDIOLOGIA; CLÍNICA MÉDICA" -> lista sem repetição, em maiúsculas. */
export function separarEspecialidades(valor: unknown): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const parte of String(valor ?? "").split(/[;,/|\n]+/)) {
    const nome = normalizarMaiusculas(parte, 120);
    const k = chaveTexto(nome);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    saida.push(nome);
  }
  return saida;
}

/** O modelo traz linhas marcadas "(EXEMPLO)"; importar uma delas criaria médico falso. */
export const ehLinhaDeExemplo = (nome: string) => /\(\s*EXEMPLO\s*\)/i.test(nome);

const textoOuNulo = (valor: unknown, limite = 200) => normalizarTexto(valor, limite) || null;

/** Célula de identificação (CRM, conta, agência): número do Excel vira texto sem ".0". */
const idOuNulo = (valor: unknown, limite = 60) => {
  if (vazio(valor)) return null;
  const texto = typeof valor === "number" ? String(Math.trunc(valor)) : String(valor);
  return normalizarMaiusculas(texto, limite) || null;
};

// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------

const COLUNAS_MEDICO = {
  nome: ["Nome", "Nome do Médico", "Médico", "Profissional"],
  crm: ["CRM", "Conselho", "Registro"],
  uf: ["UF do CRM", "UF CRM", "CRM UF", "UF"],
  especialidade: ["Especialidades", "Especialidade"],
  rqe: ["RQE"],
  cpf: ["CPF"],
  nascimento: ["Data de Nascimento", "Nascimento"],
  sexo: ["Sexo"],
  email: ["E-mail", "Email"],
  telefone: ["Telefone", "Celular", "WhatsApp"],
  telefone2: ["Telefone 2", "Telefone2", "Outro Telefone"],
  cep: ["CEP"],
  logradouro: ["Endereço", "Logradouro", "Rua"],
  numero: ["Número", "Numero", "Nº"],
  complemento: ["Complemento"],
  bairro: ["Bairro"],
  cidade: ["Cidade", "Município"],
  estado: ["Estado", "UF do Endereço"],
  banco: ["Banco"],
  agencia: ["Agência", "Agencia"],
  conta: ["Conta"],
  pix: ["Chave Pix", "Pix"],
  tipoRepasse: ["Tipo de Repasse", "Tipo Repasse"],
  // Sem o apelido solto "Repasse": ele casaria com "Repasse Particular" da outra aba.
  repassePadrao: ["Repasse Padrão", "Repasse Padrao"],
  cartaoBeneficios: ["Aceita Cartão Benefícios", "Cartão Benefícios", "Cartao Beneficios"],
  duracao: ["Duração da Consulta (min)", "Duração (min)", "Duração", "Duracao"],
  ativo: ["Ativo", "Situação", "Status"],
};

const COLUNAS_REPASSE = {
  medico: ["Médico", "Medico", "Nome do Médico", "Profissional"],
  crm: ["CRM"],
  servico: ["Serviço", "Servico", "Nome do Serviço", "Procedimento"],
  tipoRepasse: ["Tipo de Repasse", "Tipo Repasse"],
  particular: ["Repasse Particular", "Particular"],
  convenio: ["Repasse Convênio", "Repasse Convenio", "Convênio", "Convenio"],
  cartaoConsulta: ["Repasse Cartão Consulta (R$)", "Repasse Cartão Consulta", "Cartão Consulta"],
  cartaoDesconto: ["Repasse Cartão Desconto (R$)", "Repasse Cartão Desconto", "Cartão Desconto"],
};

/**
 * Descobre em qual linha está o cabeçalho: a planilha pode ter título ou
 * instruções antes da tabela. Vence a linha que reconhece mais colunas e que
 * tem a coluna obrigatória (`exige`).
 */
export function detectarLinhaCabecalho(
  matriz: unknown[][],
  apelidos: Record<string, string[]>,
  exige: string[],
): number | null {
  let melhor: number | null = null;
  let melhorPontos = 0;
  const limite = Math.min(matriz.length, MAX_LINHAS_PROCURA_CABECALHO);
  for (let i = 0; i < limite; i++) {
    const celulas = (matriz[i] ?? []).map((c) => String(c ?? "")).filter((c) => c.trim());
    if (!celulas.length) continue;
    const temObrigatoria = exige.every((chave) => acharColuna(celulas, apelidos[chave]) !== null);
    if (!temObrigatoria) continue;
    const pontos = Object.values(apelidos).filter((a) => acharColuna(celulas, a) !== null).length;
    if (pontos > melhorPontos) {
      melhorPontos = pontos;
      melhor = i;
    }
  }
  return melhor;
}

type XlsxModulo = typeof import("xlsx");

function lerAba(
  XLSX: XlsxModulo,
  wb: import("xlsx").WorkBook,
  nomeAba: string,
  apelidos: Record<string, string[]>,
  exige: string[],
) {
  const planilha = wb.Sheets[nomeAba];
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(planilha, {
    header: 1,
    blankrows: true,
    defval: null,
  });
  const indice = detectarLinhaCabecalho(matriz, apelidos, exige);
  if (indice === null) return null;
  const brutas = XLSX.utils.sheet_to_json<Record<string, unknown>>(planilha, {
    range: indice,
    defval: null,
    blankrows: true,
  });
  const cabecalhos = (matriz[indice] ?? []).map((c) => String(c ?? "")).filter((c) => c.trim());
  const col: Record<string, string | null> = {};
  // Apelidos mais específicos primeiro: "UF do CRM" antes de "Estado", e as
  // colunas de cartão do repasse antes de "Convênio".
  const usadas = new Set<string>();
  for (const [chave, lista] of Object.entries(apelidos)) {
    const achada = acharColuna(
      cabecalhos.filter((h) => !usadas.has(h)),
      lista,
    );
    col[chave] = achada;
    if (achada) usadas.add(achada);
  }
  return { indice, brutas, col };
}

/** Acha a aba pelo nome; se não houver, a primeira que tiver o cabeçalho esperado. */
function acharAba(
  XLSX: XlsxModulo,
  wb: import("xlsx").WorkBook,
  nomes: string[],
  apelidos: Record<string, string[]>,
  exige: string[],
  ignorar: string | null,
): string | null {
  const porNome = wb.SheetNames.find((n) =>
    nomes.some((alvo) => chaveTexto(n) === chaveTexto(alvo)),
  );
  if (porNome) return porNome;
  for (const n of wb.SheetNames) {
    if (n === ignorar) continue;
    if (lerAba(XLSX, wb, n, apelidos, exige)) return n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/**
 * Lê o .xlsx do modelo ou um .csv. O CSV tem uma aba só, reconhecida pelo
 * cabeçalho: aba de médicos (Nome, CRM, Repasse Padrão) ou de repasse por
 * serviço (Médico, Serviço).
 */
export async function lerPlanilhaMedicos(
  arquivo: ArrayBuffer,
  nomeArquivo?: string,
  opcoes: OpcoesLeituraMedicos = {},
): Promise<ResultadoLeituraMedicos> {
  const XLSX = await import("xlsx");
  const wb = abrirPlanilhaOuCsv(XLSX, arquivo, nomeArquivo, { cellDates: true });

  const recusadas: LinhaRecusada[] = [];
  const medicos: LinhaMedico[] = [];
  const repasses: LinhaRepasseServico[] = [];

  // "Médico" e "CRM" também são colunas da aba de repasses; por isso a aba de
  // médicos exige, além deles, o Repasse Padrão — ou, na planilha de outro
  // sistema que não traz repasse, as Especialidades. Nenhuma das duas existe
  // na aba de repasses.
  const EXIGE_MEDICOS = ["nome", "crm", "repassePadrao"];
  const EXIGE_MEDICOS_SEM_REPASSE = ["nome", "crm", "especialidade"];
  const nomesAbaMedicos = [ABA_MEDICOS, "Medicos", "Cadastro"];
  let exigeMedicos = EXIGE_MEDICOS;
  let abaMedicos = acharAba(XLSX, wb, nomesAbaMedicos, COLUNAS_MEDICO, EXIGE_MEDICOS, null);
  if (!abaMedicos || !lerAba(XLSX, wb, abaMedicos, COLUNAS_MEDICO, EXIGE_MEDICOS)) {
    const semRepasse = acharAba(
      XLSX,
      wb,
      nomesAbaMedicos,
      COLUNAS_MEDICO,
      EXIGE_MEDICOS_SEM_REPASSE,
      null,
    );
    if (semRepasse && lerAba(XLSX, wb, semRepasse, COLUNAS_MEDICO, EXIGE_MEDICOS_SEM_REPASSE)) {
      abaMedicos = semRepasse;
      exigeMedicos = EXIGE_MEDICOS_SEM_REPASSE;
    }
  }
  const abaRepasses = acharAba(
    XLSX,
    wb,
    [ABA_REPASSES, "Repasses", "Repasse por servico", "Servicos"],
    COLUNAS_REPASSE,
    ["medico", "servico"],
    abaMedicos,
  );

  let semRepasse = false;
  if (abaMedicos) {
    const lida = lerAba(XLSX, wb, abaMedicos, COLUNAS_MEDICO, exigeMedicos);
    if (lida) {
      semRepasse = !lida.col.repassePadrao;
      lerMedicos(lida, abaMedicos, medicos, recusadas, opcoes);
    } else {
      abaMedicos = null;
    }
  }
  if (abaRepasses) {
    const lida = lerAba(XLSX, wb, abaRepasses, COLUNAS_REPASSE, ["medico", "servico"]);
    if (lida) lerRepasses(lida, abaRepasses, repasses, recusadas);
  }

  return { medicos, repasses, recusadas, abaMedicos, abaRepasses, semRepasse };
}

type AbaLida = NonNullable<ReturnType<typeof lerAba>>;

function lerMedicos(
  { indice, brutas, col }: AbaLida,
  aba: string,
  medicos: LinhaMedico[],
  recusadas: LinhaRecusada[],
  opcoes: OpcoesLeituraMedicos,
) {
  const get = (bruta: Record<string, unknown>, chave: string) =>
    col[chave] ? bruta[col[chave]!] : null;
  const porCrm = new Map<string, number>();
  const porCpf = new Map<string, number>();

  brutas.forEach((bruta, i) => {
    const linhaExcel = indice + i + 2;
    if (Object.values(bruta).every(vazio)) return;

    const nome = limparPrefixoMedico(normalizarMaiusculas(get(bruta, "nome")));
    const recusar = (motivo: string) =>
      recusadas.push({ aba, linhaExcel, nome: nome || "", motivo });

    if (!nome || nome.length < 2) return recusar("A linha está sem o nome do médico.");
    if (ehLinhaDeExemplo(nome))
      return recusar("É a linha de exemplo do modelo. Apague antes de importar.");

    // CRM: aceita "52123456-7" com a UF em outra coluna, ou "52123456-7/RJ".
    // Planilhas de outros sistemas trazem o RQE e registros de outros estados
    // na mesma célula ("5278651-9/RJ / RQE N.: 15256"): o RQE é aproveitado e
    // vale o primeiro registro.
    let crm = idOuNulo(get(bruta, "crm"), 80) ?? "";
    const rqeNoCrm = crm.match(/\bRQE\b[\sNº°O.:]*([\w.-]+)/);
    crm = crm
      .replace(/\bRQE\b.*$/, "")
      .split(/\s+\/\s+/)[0]
      .replace(/[\s/]+$/, "");
    let uf = normalizarMaiusculas(get(bruta, "uf"), 10).replace(/[^A-Z]/g, "");
    const ufGrudada = crm.match(/^(.*?)[\s/-]+([A-Z]{2})$/);
    if (ufGrudada) {
      crm = ufGrudada[1].trim();
      if (!uf) uf = ufGrudada[2];
    }
    // "5274391-7/R": UF cortada pela metade não vale como UF.
    crm = crm
      .replace(/\/[A-Z]$/, "")
      .replace(/^CRM[\s\-:]*/i, "")
      .trim();
    // Sem UF na planilha, vale a UF da clínica: quase todo profissional atende
    // com o registro do próprio estado.
    if (!uf) uf = normalizarMaiusculas(opcoes.ufPadrao, 10).replace(/[^A-Z]/g, "");
    // Dado que falta não tira o profissional da importação: ele entra com a
    // pendência anotada, para ser completado no cadastro. O banco exige CRM
    // (único na clínica), então quem vem sem ganha um provisório com a linha
    // da planilha — impossível de confundir com um CRM de verdade.
    const pendencias: string[] = [];
    if (crm.length > 20) {
      pendencias.push(`CRM ilegível na planilha ("${crm}")`);
      crm = "";
    }
    if (!crm) {
      if (!pendencias.length) pendencias.push("sem CRM");
      crm = `PENDENTE ${linhaExcel}`;
    }
    if (uf.length !== 2) {
      pendencias.push("sem UF do CRM");
      uf = "RJ";
    }

    const especialidades = separarEspecialidades(get(bruta, "especialidade"));
    if (!especialidades.length) pendencias.push("sem especialidade");

    // Planilha sem a coluna Repasse Padrão: o repasse fica em branco aqui e a
    // funcionária informa um só na tela, que vale para todos (ver conferência).
    let tipoRepasse: TipoRepasse | null = null;
    let repassePadrao: number | null = null;
    if (col.repassePadrao) {
      const tipoBruto = get(bruta, "tipoRepasse");
      const repasseBruto = get(bruta, "repassePadrao");
      tipoRepasse = normalizarTipoRepasse(tipoBruto) ?? normalizarTipoRepasse(repasseBruto);
      if (!tipoRepasse) {
        return recusar('Informe o Tipo de Repasse: "Percentual" ou "Valor".');
      }
      repassePadrao = numeroOuNulo(repasseBruto);
      if (repassePadrao === null) {
        return recusar(
          "O Repasse Padrão está em branco. Todo médico precisa de um repasse padrão — digite 0 se ele não recebe repasse.",
        );
      }
      if (Number.isNaN(repassePadrao) || repassePadrao < 0) {
        return recusar(`O Repasse Padrão "${String(repasseBruto)}" não é um número válido.`);
      }
      if (tipoRepasse === "percentual" && repassePadrao > 100) {
        return recusar("O Repasse Padrão em percentual não pode passar de 100%.");
      }
    }

    let cpf = normalizarCpf(get(bruta, "cpf"));
    if (cpf === "") {
      pendencias.push(`CPF inválido na planilha ("${String(get(bruta, "cpf"))}")`);
      cpf = null;
    }

    // Sem telefone com DDD o banco não cria a ficha de paciente do médico
    // (a ficha exige telefone); o médico entra do mesmo jeito.
    // "(21) 99146-6993 / (21) 97024-1174": o segundo número vai para Telefone 2.
    const [telefone1, telefoneExtra] = String(get(bruta, "telefone") ?? "").split(/\s*\/\s*/);
    const telefone = idOuNulo(telefone1, 30);
    const telefone2 = idOuNulo(get(bruta, "telefone2"), 30) ?? idOuNulo(telefoneExtra, 30);
    if ((telefone ?? "").replace(/\D/g, "").length < 10) pendencias.push("sem telefone");

    const nascimentoBruto = get(bruta, "nascimento");
    const dataNascimento = normalizarData(nascimentoBruto);
    if (!vazio(nascimentoBruto) && !dataNascimento) {
      pendencias.push(`data de nascimento inválida ("${String(nascimentoBruto)}")`);
    }

    const duracaoBruta = numeroOuNulo(get(bruta, "duracao"));
    const duracaoLida =
      duracaoBruta === null || Number.isNaN(duracaoBruta) ? 15 : Math.round(duracaoBruta);
    const duracaoConsultaMin = duracaoLida >= 1 && duracaoLida <= 240 ? duracaoLida : 15;

    const chave = chaveCrm(crm, uf);
    const repetidaCrm = porCrm.get(chave);
    if (repetidaCrm) {
      return recusar(
        `Este CRM já aparece na linha ${repetidaCrm} da planilha. Só a primeira será importada.`,
      );
    }
    if (cpf) {
      const repetidaCpf = porCpf.get(cpf);
      if (repetidaCpf) {
        return recusar(
          `Este CPF já aparece na linha ${repetidaCpf} da planilha. Só a primeira será importada.`,
        );
      }
      porCpf.set(cpf, linhaExcel);
    }
    porCrm.set(chave, linhaExcel);

    const rqe = idOuNulo(get(bruta, "rqe"), 50) ?? (rqeNoCrm ? rqeNoCrm[1].slice(0, 50) : null);
    const estado = normalizarMaiusculas(get(bruta, "estado"), 2) || null;

    medicos.push({
      linhaExcel,
      nome,
      crm,
      crmUf: uf,
      especialidades,
      rqe,
      cpf,
      dataNascimento,
      sexo: normalizarSexo(get(bruta, "sexo")),
      email: textoOuNulo(get(bruta, "email"))?.toLowerCase() ?? null,
      telefone,
      telefone2,
      cep: idOuNulo(get(bruta, "cep"), 12),
      logradouro: normalizarMaiusculas(get(bruta, "logradouro")) || null,
      numero: idOuNulo(get(bruta, "numero"), 20),
      complemento: normalizarMaiusculas(get(bruta, "complemento")) || null,
      bairro: normalizarMaiusculas(get(bruta, "bairro"), 120) || null,
      cidade: normalizarMaiusculas(get(bruta, "cidade"), 120) || null,
      estado,
      banco: normalizarMaiusculas(get(bruta, "banco"), 120) || null,
      agencia: idOuNulo(get(bruta, "agencia"), 20),
      conta: idOuNulo(get(bruta, "conta"), 30),
      // Chave Pix fica como foi digitada: e-mail e chave aleatória diferenciam caixa.
      pixChave: textoOuNulo(get(bruta, "pix"), 120),
      tipoRepasse,
      repassePadrao,
      aceitaCartaoBeneficios: normalizarSimNao(get(bruta, "cartaoBeneficios"), true),
      duracaoConsultaMin,
      ativo: normalizarSimNao(get(bruta, "ativo"), true),
      pendencias,
    });
  });
}

function lerRepasses(
  { indice, brutas, col }: AbaLida,
  aba: string,
  repasses: LinhaRepasseServico[],
  recusadas: LinhaRecusada[],
) {
  const get = (bruta: Record<string, unknown>, chave: string) =>
    col[chave] ? bruta[col[chave]!] : null;

  brutas.forEach((bruta, i) => {
    const linhaExcel = indice + i + 2;
    if (Object.values(bruta).every(vazio)) return;

    const medicoNome = limparPrefixoMedico(normalizarMaiusculas(get(bruta, "medico")));
    const servico = normalizarMaiusculas(get(bruta, "servico"));
    const rotulo = [medicoNome, servico].filter(Boolean).join(" — ");
    const recusar = (motivo: string) => recusadas.push({ aba, linhaExcel, nome: rotulo, motivo });

    if (!medicoNome) return recusar("A linha está sem o nome do médico.");
    if (ehLinhaDeExemplo(medicoNome)) {
      return recusar("É a linha de exemplo do modelo. Apague antes de importar.");
    }
    if (!servico) return recusar("A linha está sem o nome do serviço.");

    const tipoBruto = get(bruta, "tipoRepasse");
    const tipoRepasse = normalizarTipoRepasse(tipoBruto);
    if (!vazio(tipoBruto) && !tipoRepasse) {
      return recusar(
        `Tipo de Repasse "${String(tipoBruto)}" não existe. Use "Percentual" ou "Valor".`,
      );
    }

    const valores = {
      particular: numeroOuNulo(get(bruta, "particular")),
      convenio: numeroOuNulo(get(bruta, "convenio")),
      cartaoConsulta: numeroOuNulo(get(bruta, "cartaoConsulta")),
      cartaoDesconto: numeroOuNulo(get(bruta, "cartaoDesconto")),
    };
    for (const [campo, v] of Object.entries(valores)) {
      if (v !== null && (Number.isNaN(v) || v < 0)) {
        const nomeCampo = {
          particular: "Repasse Particular",
          convenio: "Repasse Convênio",
          cartaoConsulta: "Repasse Cartão Consulta",
          cartaoDesconto: "Repasse Cartão Desconto",
        }[campo];
        return recusar(`${nomeCampo} não é um número válido.`);
      }
    }
    if (tipoRepasse === "percentual") {
      if ((valores.particular ?? 0) > 100 || (valores.convenio ?? 0) > 100) {
        return recusar("Repasse em percentual não pode passar de 100%.");
      }
    }

    repasses.push({
      linhaExcel,
      medicoNome,
      medicoCrm: idOuNulo(get(bruta, "crm"), 40),
      servico,
      tipoRepasse,
      ...valores,
    });
  });
}

// ---------------------------------------------------------------------------
// Conferência com o que já existe na clínica
// ---------------------------------------------------------------------------

export interface MedicoExistente {
  id: string;
  nome: string;
  crm: string | null;
  crm_uf: string | null;
  cpf: string | null;
}

export interface Opcao {
  id: string;
  nome: string;
}

/** Repasse pronto para gravar, já ligado ao serviço do catálogo. */
export interface RepasseConferido extends LinhaRepasseServico {
  procedimentoId: string;
  /** Nome exato do serviço no catálogo — é a chave que o cálculo do repasse usa. */
  procedimentoNome: string;
  /** Tipo efetivo: o da linha ou, em branco, o do repasse padrão do médico. */
  tipoEfetivo: TipoRepasse;
}

export interface MedicoConferido extends Omit<LinhaMedico, "tipoRepasse" | "repassePadrao"> {
  tipoRepasse: TipoRepasse;
  repassePadrao: number;
  /** O repasse veio do quadro da tela, não da planilha. */
  repasseDaTela: boolean;
  /** Especialidades da planilha ligadas ao cadastro; `id` null = ainda não existe. */
  especialidadesResolvidas: Array<{ nome: string; id: string | null }>;
  repasses: RepasseConferido[];
}

export interface ConferenciaMedicos {
  novos: MedicoConferido[];
  jaCadastrados: Array<{ linha: LinhaMedico; motivo: string }>;
  /** Linhas das duas abas que não serão gravadas. */
  recusadas: LinhaRecusada[];
  /** Especialidades citadas que não existem no cadastro (lista compartilhada). */
  especialidadesFaltando: string[];
  /** Nomes da planilha trocados pela especialidade do cadastro ("PISCOLOGIA" -> "PSICOLOGIA"). */
  especialidadesCorrigidas: Array<{ de: string; para: string }>;
}

/**
 * Nome da profissão escrito no lugar da especialidade. Só entra aqui o que
 * não tem outra leitura possível.
 */
const APELIDOS_ESPECIALIDADE: Record<string, string> = {
  alergista: "alergologia",
  nutricionista: "nutricao",
  fonoaudiologa: "fonoaudiologia",
  fonoaudiologo: "fonoaudiologia",
  fonodiologa: "fonoaudiologia",
  fonodiologo: "fonoaudiologia",
  psicologa: "psicologia",
  psicologo: "psicologia",
  fisioterapeuta: "fisioterapia",
  podologa: "podologia",
  podologo: "podologia",
  dentista: "odontologia",
  ecocardiologia: "ecocardiograma",
};

/** Distância de edição contando troca de duas letras vizinhas como 1 erro. */
function distanciaEdicao(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * Acha a especialidade do cadastro para o nome da planilha: igual (sem
 * acento), apelido de profissão ou um único erro de digitação em nome longo
 * ("DERMARTOLOGIA", "PISCOLOGIA"). Nome curto e empate não são corrigidos —
 * "NEUROLOGIA" nunca pode virar "UROLOGIA".
 */
export function resolverEspecialidade(nome: string, cadastro: Opcao[]): Opcao | null {
  const porChave = new Map(cadastro.map((e) => [chaveTexto(e.nome), e]));
  const k = chaveTexto(nome);
  const exata = porChave.get(k) ?? porChave.get(APELIDOS_ESPECIALIDADE[k] ?? "");
  if (exata) return exata;
  if (k.length < 8) return null;
  const perto = cadastro.filter((e) => distanciaEdicao(k, chaveTexto(e.nome)) === 1);
  return perto.length === 1 ? perto[0] : null;
}

export interface OpcoesConferencia {
  existentes: MedicoExistente[];
  especialidades: Opcao[];
  servicos: Opcao[];
  /** Se a funcionária marcou para criar as especialidades que faltam. */
  criarEspecialidades: boolean;
  /**
   * Repasse padrão informado na tela para a planilha que não traz repasse.
   * Sem ele, os médicos dessa planilha não são cadastrados: repasse errado
   * faz o financeiro pagar errado, então o sistema nunca supõe um valor.
   */
  repasseGeral?: { tipo: TipoRepasse; valor: number } | null;
}

/**
 * Cruza a planilha com a clínica aberta:
 * - médico que já existe (mesmo CRM+UF, CPF ou nome) é pulado, nunca duplicado
 *   nem sobrescrito — o repasse dele pode ter sido negociado caso a caso;
 * - linha de repasse precisa apontar para um médico NOVO desta planilha e para
 *   um serviço que exista no catálogo desta clínica;
 * - especialidade que não existe bloqueia o médico, a menos que a funcionária
 *   marque para criar.
 */
export function conferirImportacaoMedicos(
  leitura: ResultadoLeituraMedicos,
  opcoes: OpcoesConferencia,
): ConferenciaMedicos {
  const recusadas: LinhaRecusada[] = [...leitura.recusadas];
  const abaMedicos = leitura.abaMedicos ?? ABA_MEDICOS;
  const abaRepasses = leitura.abaRepasses ?? ABA_REPASSES;

  const existentesPorCrm = new Map<string, MedicoExistente>();
  const existentesPorCpf = new Map<string, MedicoExistente>();
  const existentesPorNome = new Map<string, MedicoExistente>();
  for (const m of opcoes.existentes) {
    const kc = chaveCrm(m.crm, m.crm_uf);
    if (kc && !existentesPorCrm.has(kc)) existentesPorCrm.set(kc, m);
    const cpf = normalizarCpf(m.cpf);
    if (cpf && !existentesPorCpf.has(cpf)) existentesPorCpf.set(cpf, m);
    const kn = chaveNomeMedico(m.nome);
    if (kn && !existentesPorNome.has(kn)) existentesPorNome.set(kn, m);
  }

  const servicoPorChave = new Map<string, Opcao>();
  for (const s of opcoes.servicos) {
    const k = chaveTexto(s.nome);
    if (k && !servicoPorChave.has(k)) servicoPorChave.set(k, s);
  }

  const faltando = new Map<string, string>();
  const corrigidas = new Map<string, { de: string; para: string }>();
  const jaCadastrados: ConferenciaMedicos["jaCadastrados"] = [];
  const novos: MedicoConferido[] = [];

  for (const linha of leitura.medicos) {
    const porCrm = existentesPorCrm.get(chaveCrm(linha.crm, linha.crmUf));
    const porCpf = linha.cpf ? existentesPorCpf.get(linha.cpf) : undefined;
    const porNome = existentesPorNome.get(chaveNomeMedico(linha.nome));
    const achado = porCrm ?? porCpf ?? porNome;
    if (achado) {
      const motivo = porCrm
        ? `Já existe médico com este CRM nesta clínica (${achado.nome}).`
        : porCpf
          ? `Já existe médico com este CPF nesta clínica (${achado.nome}).`
          : "Já existe médico com este nome nesta clínica.";
      jaCadastrados.push({ linha, motivo });
      continue;
    }

    const especialidadesResolvidas: MedicoConferido["especialidadesResolvidas"] = [];
    for (const nome of linha.especialidades) {
      const achada = resolverEspecialidade(nome, opcoes.especialidades);
      if (achada && chaveTexto(achada.nome) !== chaveTexto(nome)) {
        corrigidas.set(chaveTexto(nome), { de: nome, para: achada.nome });
      }
      const item = achada ? { nome: achada.nome, id: achada.id } : { nome, id: null };
      // "FONOAUDIOLOGA / FONOAUDIOLOGIA" vira uma especialidade só.
      if (!especialidadesResolvidas.some((e) => chaveTexto(e.nome) === chaveTexto(item.nome))) {
        especialidadesResolvidas.push(item);
      }
    }
    const semCadastro = especialidadesResolvidas.filter((e) => !e.id);
    for (const e of semCadastro) faltando.set(chaveTexto(e.nome), e.nome);
    if (semCadastro.length && !opcoes.criarEspecialidades) {
      recusadas.push({
        aba: abaMedicos,
        linhaExcel: linha.linhaExcel,
        nome: linha.nome,
        motivo: `A especialidade ${semCadastro.map((e) => `"${e.nome}"`).join(", ")} não existe no cadastro. Marque "Criar as especialidades que faltam" ou corrija o nome.`,
      });
      continue;
    }

    const daTela = linha.tipoRepasse === null || linha.repassePadrao === null;
    const tipoRepasse = daTela ? opcoes.repasseGeral?.tipo : linha.tipoRepasse;
    const repassePadrao = daTela ? opcoes.repasseGeral?.valor : linha.repassePadrao;
    if (tipoRepasse == null || repassePadrao == null) {
      recusadas.push({
        aba: abaMedicos,
        linhaExcel: linha.linhaExcel,
        nome: linha.nome,
        motivo: "A planilha não traz o repasse. Informe o repasse padrão no quadro da tela.",
      });
      continue;
    }

    novos.push({
      ...linha,
      tipoRepasse,
      repassePadrao,
      repasseDaTela: daTela,
      especialidadesResolvidas,
      repasses: [],
    });
  }

  // Liga cada linha de repasse ao médico novo.
  const novosPorCrm = new Map<string, MedicoConferido>();
  const novosPorNome = new Map<string, MedicoConferido[]>();
  for (const m of novos) {
    novosPorCrm.set(chaveCrm(m.crm, m.crmUf).split("|")[0], m);
    const k = chaveNomeMedico(m.nome);
    novosPorNome.set(k, [...(novosPorNome.get(k) ?? []), m]);
  }
  const nomesNaAbaMedicos = new Set(leitura.medicos.map((m) => chaveNomeMedico(m.nome)));
  const nomesJaCadastrados = new Set(jaCadastrados.map((j) => chaveNomeMedico(j.linha.nome)));
  const vistos = new Map<string, number>();

  for (const r of leitura.repasses) {
    const recusar = (motivo: string) =>
      recusadas.push({
        aba: abaRepasses,
        linhaExcel: r.linhaExcel,
        nome: `${r.medicoNome} — ${r.servico}`,
        motivo,
      });

    const kNome = chaveNomeMedico(r.medicoNome);
    let medico: MedicoConferido | undefined;
    if (r.medicoCrm) {
      medico = novosPorCrm.get(chaveCrm(r.medicoCrm, "").split("|")[0]);
    }
    if (!medico) {
      const candidatos = novosPorNome.get(kNome) ?? [];
      if (candidatos.length > 1) {
        recusar("Há mais de um médico com este nome na aba Médicos. Preencha a coluna CRM.");
        continue;
      }
      medico = candidatos[0];
    }
    if (!medico) {
      if (nomesJaCadastrados.has(kNome)) {
        recusar(
          "Este médico já estava cadastrado e foi pulado — o repasse dele não é alterado por aqui.",
        );
      } else if (nomesNaAbaMedicos.has(kNome)) {
        recusar("A linha deste médico na aba Médicos tem problema. Corrija lá primeiro.");
      } else {
        recusar("Este médico não aparece na aba Médicos (confira se o nome está escrito igual).");
      }
      continue;
    }

    const servico = servicoPorChave.get(chaveTexto(r.servico));
    if (!servico) {
      recusar(
        "Este serviço não existe no catálogo desta clínica. Importe ou cadastre os serviços antes.",
      );
      continue;
    }

    const chaveDupla = `${medico.linhaExcel}|${servico.id}`;
    const primeira = vistos.get(chaveDupla);
    if (primeira) {
      recusar(
        `Este serviço já aparece para este médico na linha ${primeira}. Só a primeira será usada.`,
      );
      continue;
    }
    vistos.set(chaveDupla, r.linhaExcel);

    medico.repasses.push({
      ...r,
      procedimentoId: servico.id,
      procedimentoNome: servico.nome,
      tipoEfetivo: r.tipoRepasse ?? medico.tipoRepasse,
    });
  }

  return {
    novos,
    jaCadastrados,
    recusadas,
    especialidadesFaltando: [...faltando.values()].sort((a, b) => a.localeCompare(b, "pt-BR")),
    especialidadesCorrigidas: [...corrigidas.values()].sort((a, b) =>
      a.de.localeCompare(b.de, "pt-BR"),
    ),
  };
}

/** A linha de repasse tem alguma célula preenchida (0 conta como preenchida)? */
export function repasseTemExcecao(r: LinhaRepasseServico): boolean {
  return [r.particular, r.convenio, r.cartaoConsulta, r.cartaoDesconto].some((v) => v !== null);
}

// ---------------------------------------------------------------------------
// Modelo para download
// ---------------------------------------------------------------------------

export const CABECALHO_MEDICOS = [
  "Nome",
  "CRM",
  "UF do CRM",
  "Especialidades",
  "RQE",
  "Tipo de Repasse",
  "Repasse Padrão",
  "Aceita Cartão Benefícios",
  "Duração da Consulta (min)",
  "CPF",
  "Data de Nascimento",
  "Sexo",
  "E-mail",
  "Telefone",
  "Telefone 2",
  "CEP",
  "Endereço",
  "Número",
  "Complemento",
  "Bairro",
  "Cidade",
  "Estado",
  "Banco",
  "Agência",
  "Conta",
  "Chave Pix",
  "Ativo",
];

export const CABECALHO_REPASSES = [
  "Médico",
  "CRM",
  "Serviço",
  "Tipo de Repasse",
  "Repasse Particular",
  "Repasse Convênio",
  "Repasse Cartão Consulta (R$)",
  "Repasse Cartão Desconto (R$)",
];

const LEIA_ME: string[][] = [
  ["COMO PREENCHER A PLANILHA DE MÉDICOS"],
  [""],
  ['Aba "Médicos" — um médico por linha.'],
  [
    "• Obrigatórios: Nome, CRM, UF do CRM, Especialidades, Tipo de Repasse, Repasse Padrão e Telefone com DDD.",
  ],
  [
    '• Especialidades: use o nome igual ao do sistema (aba "Especialidades"). Mais de uma? Separe com ponto e vírgula; a primeira é a principal.',
  ],
  ["• RQE: número do RQE da especialidade principal, se houver."],
  ["• Tipo de Repasse: escreva Percentual ou Valor."],
  [
    "• Repasse Padrão: Percentual = 60 quer dizer 60%. Valor = 70,00 quer dizer R$ 70,00 por atendimento.",
  ],
  ["• O Repasse Padrão NÃO pode ficar em branco. Se o médico não recebe repasse, digite 0."],
  [
    "• Aceita Cartão Benefícios e Ativo: Sim ou Não (em branco = Sim). Duração em branco = 15 minutos.",
  ],
  ["• Sexo: Masculino, Feminino ou em branco."],
  [""],
  ['Aba "Repasse por serviço" — os serviços que cada médico atende.'],
  [
    '• Uma linha por médico + serviço. O serviço precisa existir no catálogo da clínica (aba "Serviços da clínica").',
  ],
  ["• Todo serviço listado aqui passa a aparecer na Agenda para aquele médico."],
  ["• Célula de repasse EM BRANCO = usa o Repasse Padrão do médico."],
  ["• Célula com 0 = aquele serviço NÃO paga repasse. Cuidado para não digitar 0 sem querer."],
  ["• Tipo de Repasse vale para Particular e Convênio. Em branco = mesmo tipo do Repasse Padrão."],
  ["• Cartão Consulta e Cartão Desconto são sempre em reais (R$)."],
  ["• CRM é opcional; preencha só se houver dois médicos com o mesmo nome."],
  [""],
  ["Regras da importação"],
  [
    "• Médico que já existe na clínica (mesmo CRM, CPF ou nome) é pulado: não é duplicado nem alterado.",
  ],
  ["• Nada é gravado antes de a funcionária conferir tudo na tela e clicar em Importar."],
  ["• Os horários de atendimento de cada médico são cadastrados depois, na tela de agendas."],
  ["• Apague as linhas de exemplo antes de enviar."],
];

export interface OpcoesModelo {
  especialidades?: string[];
  servicos?: string[];
}

/** Monta a pasta de trabalho do modelo. Separado do download para poder testar. */
export function montarModeloMedicos(
  XLSX: XlsxModulo,
  opcoes: OpcoesModelo = {},
): import("xlsx").WorkBook {
  const wb = XLSX.utils.book_new();

  const leiaMe = XLSX.utils.aoa_to_sheet(LEIA_ME);
  leiaMe["!cols"] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, leiaMe, "LEIA-ME");

  const medicos = XLSX.utils.aoa_to_sheet([
    CABECALHO_MEDICOS,
    [
      "JOÃO DA SILVA (EXEMPLO)",
      "52123456-7",
      "RJ",
      "CARDIOLOGIA",
      "12345",
      "Percentual",
      "60",
      "Sim",
      "20",
      "123.456.789-09",
      "15/03/1975",
      "Masculino",
      "joao@exemplo.com",
      "(21) 99999-0000",
      "",
      "25555-000",
      "AV. COMENDADOR TELES",
      "100",
      "SALA 2",
      "VILAR DOS TELES",
      "SÃO JOÃO DE MERITI",
      "RJ",
      "ITAÚ",
      "1234",
      "56789-0",
      "joao@exemplo.com",
      "Sim",
    ],
    [
      "MARIA SOUZA (EXEMPLO)",
      "52987654-3",
      "RJ",
      "ULTRASSONOGRAFIA; GINECOLOGIA",
      "",
      "Valor",
      "70,00",
      "Sim",
      "30",
      "",
      "",
      "Feminino",
      "",
      "(21) 98888-0000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Sim",
    ],
  ]);
  medicos["!cols"] = CABECALHO_MEDICOS.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, medicos, ABA_MEDICOS);

  const repasses = XLSX.utils.aoa_to_sheet([
    CABECALHO_REPASSES,
    ["JOÃO DA SILVA (EXEMPLO)", "", "CONSULTA CARDIOLOGIA", "", "", "", "", ""],
    [
      "JOÃO DA SILVA (EXEMPLO)",
      "",
      "ELETROCARDIOGRAMA",
      "Valor",
      "40,00",
      "35,00",
      "30,00",
      "25,00",
    ],
    ["MARIA SOUZA (EXEMPLO)", "", "ULTRASSONOGRAFIA TRANSVAGINAL", "", "", "", "0", ""],
  ]);
  repasses["!cols"] = CABECALHO_REPASSES.map((h) => ({ wch: Math.max(16, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, repasses, ABA_REPASSES);

  if (opcoes.especialidades?.length) {
    const aba = XLSX.utils.aoa_to_sheet([
      ["Especialidades cadastradas no sistema"],
      ...opcoes.especialidades.map((e) => [e]),
    ]);
    aba["!cols"] = [{ wch: 50 }];
    XLSX.utils.book_append_sheet(wb, aba, "Especialidades");
  }
  if (opcoes.servicos?.length) {
    const aba = XLSX.utils.aoa_to_sheet([
      ["Serviços do catálogo desta clínica"],
      ...opcoes.servicos.map((s) => [s]),
    ]);
    aba["!cols"] = [{ wch: 60 }];
    XLSX.utils.book_append_sheet(wb, aba, "Serviços da clínica");
  }
  return wb;
}
