/**
 * Retorno autorizado da NFS-e — parte pura, testável.
 *
 * Grava na nota o que a prefeitura AUTORIZOU (JSON da Focus + XML oficial),
 * nunca o que foi calculado antes do envio. Campo que não veio fica nulo e é
 * listado em `faltando`. Divergência de alíquota com o cadastro do emitente
 * é só registrada — o cadastro nunca é corrigido automaticamente.
 */

export type RetornoFocus = {
  numero?: string | null;
  serie?: string | null;
  numero_rps?: string | number | null;
  serie_rps?: string | null;
  codigo_verificacao?: string | null;
  chave_nfse?: string | null;
  url?: string | null;
};

export type CamposAutorizados = {
  numero: string | null;
  serie: string | null;
  rps_numero: number | null;
  rps_serie: string | null;
  aliquota_iss: number | null; // fração: 0.03 = 3%
  /** Ausente quando o XML não foi lido: não sobrescreve o que já está gravado. */
  valor_iss?: number;
  chave_acesso: string | null;
};

export type Conferencia = {
  conferido_em: string;
  xml_lido: boolean;
  faltando: (keyof CamposAutorizados)[];
  /** XML autorizado lido e sem vISSQN: a nota não destaca ISS (valor_iss gravado = 0). */
  sem_iss_destacado?: boolean;
  divergencia_aliquota: null | {
    cadastro_emitente: number;
    autorizada: number;
  };
};

function tag(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}>([^<]*)</(?:\\w+:)?${nome}>`));
  const v = m?.[1]?.trim();
  return v ? v : null;
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function vazio(v: string | null | undefined): string | null {
  const s = v == null ? "" : String(v).trim();
  return s ? s : null;
}

/** Lê do XML oficial da NFS-e (padrão nacional) os campos autorizados. */
export function lerXmlNfse(xml: string) {
  const idNfse = xml.match(/Id="NFS(\d{50})"/)?.[1] ?? null;
  // A série do XML nacional fica dentro de infDPS: é a série da DPS.
  const infDps = xml.match(/<(?:\w+:)?infDPS[\s\S]*?<\/(?:\w+:)?infDPS>/)?.[0] ?? "";
  const aliqPct = num(tag(xml, "pAliqAplic") ?? tag(infDps, "pAliq"));
  return {
    numero: tag(xml, "nNFSe"),
    rps_numero: num(tag(infDps || xml, "nDPS")),
    rps_serie: tag(infDps || xml, "serie"),
    aliquota_iss: aliqPct === null ? null : Math.round(aliqPct * 100) / 10000,
    valor_iss: num(tag(xml, "vISSQN")),
    chave_acesso: idNfse,
  };
}

function chaveDoJson(body: RetornoFocus): string | null {
  const direta = vazio(body.chave_nfse);
  if (direta) return direta;
  const daUrl = body.url?.match(/chave=(\d{50})/)?.[1];
  if (daUrl) return daUrl;
  const cv = vazio(body.codigo_verificacao);
  return cv && /^\d{50}$/.test(cv) ? cv : null;
}

export function montarCamposAutorizados(
  body: RetornoFocus,
  xml: string | null,
  aliquotaCadastro: number | null,
  agora: Date = new Date(),
): { campos: CamposAutorizados; conferencia: Conferencia } {
  const x = xml ? lerXmlNfse(xml) : null;
  const campos: CamposAutorizados = {
    numero: vazio(body.numero) ?? x?.numero ?? null,
    serie: vazio(body.serie),
    rps_numero: num(body.numero_rps) ?? x?.rps_numero ?? null,
    rps_serie: vazio(body.serie_rps) ?? x?.rps_serie ?? null,
    aliquota_iss: x?.aliquota_iss ?? null,
    // XML autorizado lido sem vISSQN: a nota autorizada não destaca ISS, então
    // o ISS dela é zero — zero é o fato, não um palpite. Continua proibido usar
    // o valor calculado por nós. Sem XML lido não há fato: a chave é omitida
    // (ver abaixo), para não sobrescrever o gravado nem derrubar a linha (NOT NULL).
    chave_acesso: chaveDoJson(body) ?? x?.chave_acesso ?? null,
  };
  if (x) campos.valor_iss = x.valor_iss ?? 0;
  const semIss = !!x && x.valor_iss === null;
  const faltando = (Object.keys(campos) as (keyof CamposAutorizados)[]).filter(
    (k) => campos[k] === null || (k === "valor_iss" && semIss),
  );
  // Sem XML lido o ISS não foi conferido (marca: xml_lido=false).
  if (!x) faltando.push("valor_iss");
  const divergente =
    campos.aliquota_iss !== null &&
    aliquotaCadastro !== null &&
    Math.abs(campos.aliquota_iss - Number(aliquotaCadastro)) > 0.00001;
  return {
    campos,
    conferencia: {
      conferido_em: agora.toISOString(),
      xml_lido: !!x,
      faltando,
      ...(semIss ? { sem_iss_destacado: true } : {}),
      divergencia_aliquota: divergente
        ? { cadastro_emitente: Number(aliquotaCadastro), autorizada: campos.aliquota_iss! }
        : null,
    },
  };
}
