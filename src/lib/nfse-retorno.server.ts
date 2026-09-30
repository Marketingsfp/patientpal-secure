import { montarCamposAutorizados, type RetornoFocus } from "./nfse-retorno";

type Body = RetornoFocus & {
  url_xml_nota_fiscal?: string | null;
  caminho_xml_nota_fiscal?: string | null;
};

/** Baixa o XML autorizado da Focus. Falha vira null (campos ficam nulos). */
async function baixarXml(body: Body, token: string | undefined): Promise<string | null> {
  const url =
    body.url_xml_nota_fiscal ??
    (body.caminho_xml_nota_fiscal ? `https://api.focusnfe.com.br${body.caminho_xml_nota_fiscal}` : null);
  if (!url) return null;
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = "Basic " + Buffer.from(`${token}:`).toString("base64");
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/**
 * Campos para gravar na nota autorizada, tirados do retorno da prefeitura.
 * Divergência de alíquota é só registrada em `retorno_conferencia` e no log.
 */
export async function camposDoRetornoAutorizado(
  body: Body,
  opts: { token: string | undefined; aliquotaCadastro: number | null; nfseRef?: string | null },
): Promise<Record<string, unknown>> {
  const xml = await baixarXml(body, opts.token);
  const { campos, conferencia } = montarCamposAutorizados(body, xml, opts.aliquotaCadastro);
  if (conferencia.faltando.length || conferencia.divergencia_aliquota) {
    console.warn("[nfse-retorno] conferência", { ref: opts.nfseRef, ...conferencia });
  }
  return { ...campos, retorno_conferencia: conferencia };
}
