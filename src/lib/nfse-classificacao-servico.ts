/**
 * Código de tributação nacional (cTribNac) e NBS de cada tipo de serviço.
 *
 * Antes a nota saía sempre com o código único do cadastro do emitente: a MA
 * mandava 04.02.05 até para endoscopia, e a CASA DE SAUDE mandava 04.01.01 até
 * para exame. O portal da prefeitura usa um código por tipo de serviço. A
 * tabela abaixo vem da planilha de serviços da prefeitura de São José do Vale
 * do Rio Preto e das notas emitidas pelo portal (nota 3674 da MA, 4998 da
 * CASA DE SAUDE).
 *
 * Só decide quando a descrição inteira aponta para UM tipo. Descrição que mistura
 * tipos (nota agrupada de consulta + exame) ou que não bate com nada fica com o
 * código e o NBS do cadastro do emitente, como era antes.
 */

export interface ClassificacaoServico {
  tipo: "consulta" | "procedimento" | "imagem" | "laboratorio" | "protese";
  /** cTribNac, 6 dígitos. */
  codigo: string;
  /** NBS, 9 dígitos. */
  nbs: string;
}

const REGRAS: { re: RegExp; c: ClassificacaoServico }[] = [
  {
    // Exame de imagem e gráfico.
    re: /ultrass|ultra-?som|\busg\b|\brx\b|raio.?x|radiograf|mamograf|densitometr|tomograf|ressonan|\boct\b|ecocardio|eletrocardio|\becg\b|\beco\b|doppler|\bmapa\b|holter|ergom[eé]tric|\bitb\b|retinograf|mapeamento de retina|campo visual|microscopia especular|paquimetr|acuidade macular|ecobiometr|biometria|gonioscop|topografia de c[oó]rnea|ceratoscop|curva tensional|curva de pio|teste do olhinho|eletroencefalo|\beeg\b|eletroneuromiograf|audiometr|timpanometr|vectoeletronistagmo|espirometr/i,
    c: { tipo: "imagem", codigo: "040205", nbs: "123019400" },
  },
  {
    re: /laborat|hemograma|glicemia|\bhgt\b|urease|preventivo|citolog/i,
    c: { tipo: "laboratorio", codigo: "040201", nbs: "123019300" },
  },
  {
    re: /endoscop|colonoscop|videolaringo|histeroscop|bi[oó]psia|yag|capsulotomia|iridotomia|lavagem de ouvido|teste da linguinha|escleroterap|aplica[cç][aã]o|infiltra|eletrocauter|drenagem|imobiliza|inje[cç][aã]o|medica[cç][aã]o|procedimento dermatol/i,
    c: { tipo: "procedimento", codigo: "040101", nbs: "123012200" },
  },
  {
    re: /pr[oó]tese|\bcoroa\b|\bponte\b|\bpino\b|\broach\b/i,
    c: { tipo: "protese", codigo: "041401", nbs: "123012300" },
  },
  {
    // NBS da consulta igual ao da nota do portal (1.2301.22.00). A planilha
    // da prefeitura traz 1.2301.21.00 — validar com a contabilidade.
    re: /consulta/i,
    c: { tipo: "consulta", codigo: "040101", nbs: "123012200" },
  },
];

/** Tipo de serviço da descrição, ou `null` quando é misto ou desconhecido. */
export function classificarServicoNfse(
  descricao: string | null | undefined,
): ClassificacaoServico | null {
  const texto = (descricao ?? "").normalize("NFC");
  const achadas = REGRAS.filter((r) => r.re.test(texto)).map((r) => r.c);
  // "VIDEOHISTEROSCOPIA COM BIÓPSIA" casa duas vezes com procedimento; o que
  // importa é o código final ser um só.
  const codigos = new Set(achadas.map((c) => `${c.codigo}/${c.nbs}`));
  return codigos.size === 1 ? achadas[0] : null;
}

/**
 * Código e NBS da nota. Ordem: código forçado por quem chama (ex.: convênio do
 * Cartão Benefício) > tipo de serviço da descrição > cadastro do emitente.
 * `codigoMunicipalValido` diz se o código municipal do emitente ainda vale: ele
 * corresponde ao código do cadastro, e não a outro código escolhido aqui.
 */
export function codigoServicoDaNota(args: {
  descricao: string | null | undefined;
  codigoForcado?: string | null;
  codigoEmitente: string | null | undefined;
  nbsEmitente: string | null | undefined;
}): { codigo: string; nbs: string | null; codigoMunicipalValido: boolean } {
  const dig = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
  const codigoEmitente = dig(args.codigoEmitente);
  const nbsEmitente = dig(args.nbsEmitente) || null;
  const forcado = dig(args.codigoForcado);
  if (forcado) {
    return {
      codigo: forcado,
      nbs: forcado === codigoEmitente ? nbsEmitente : null,
      codigoMunicipalValido: forcado === codigoEmitente,
    };
  }
  const c = classificarServicoNfse(args.descricao);
  if (c) {
    return { codigo: c.codigo, nbs: c.nbs, codigoMunicipalValido: c.codigo === codigoEmitente };
  }
  return { codigo: codigoEmitente, nbs: nbsEmitente, codigoMunicipalValido: true };
}
