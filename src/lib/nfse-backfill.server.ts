import {
  LIMITE_SEM_SENTIDO,
  ORIGEM_BACKFILL,
  SEM_SENTIDO,
  resultadoBackfill,
  type FalhaBackfill,
} from "./nfse-backfill";

type Linha = {
  id: string;
  numero: string | null;
  emitente_id: string | null;
  aliquota_iss: number | null;
  valor_iss: number | null;
  valor_servicos: number | null;
  url_xml: string | null;
  payload_resposta: any;
};

async function baixar(url: string, token: string | undefined): Promise<string | null> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = "Basic " + Buffer.from(`${token}:`).toString("base64");
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

export async function executarLoteBackfill(
  admin: any,
  clinicaId: string,
  limite: number,
  opts: { emitenteId: string; reprocessarFalhas?: boolean },
) {
  let q = admin
    .from("nfse")
    .select(
      "id, numero, emitente_id, aliquota_iss, valor_iss, valor_servicos, url_xml, payload_resposta",
    )
    .eq("clinica_id", clinicaId)
    .eq("emitente_id", opts.emitenteId)
    .eq("status", "emitida");
  // Tentar de novo: só as que a própria rotina marcou como falha.
  q = opts.reprocessarFalhas
    ? q
        .eq("retorno_conferencia->>origem", ORIGEM_BACKFILL)
        .not("retorno_conferencia->>falha", "is", null)
    : q.is("retorno_conferencia", null);
  const { data: notas, error } = await q.order("created_at").limit(limite);
  if (error) throw new Error("Falha ao ler notas: " + error.message);
  const lista = (notas ?? []) as Linha[];

  const ids = [...new Set(lista.map((n) => n.emitente_id).filter(Boolean))];
  const { data: emits } = ids.length
    ? await admin.from("nfse_emitentes").select("id, focus_ambiente").in("id", ids)
    : { data: [] };
  const ambiente = new Map((emits ?? []).map((e: any) => [e.id, e.focus_ambiente]));
  const tokenDe = (id: string | null) =>
    ambiente.get(id) === "producao"
      ? process.env.FOCUS_NFE_TOKEN_PROD
      : (process.env.FOCUS_NFE_TOKEN_HML ?? process.env.FOCUS_NFE_TOKEN_PROD);

  // 1) Baixa e decide tudo antes de gravar (para a trava dos 5%).
  const decisoes: { n: Linha; r: ReturnType<typeof resultadoBackfill> }[] = [];
  for (let i = 0; i < lista.length; i += 5) {
    const grupo = lista.slice(i, i + 5);
    await Promise.all(
      grupo.map(async (n) => {
        const cam =
          n.payload_resposta?.url_xml_nota_fiscal ??
          (n.payload_resposta?.caminho_xml_nota_fiscal
            ? `https://api.focusnfe.com.br${n.payload_resposta.caminho_xml_nota_fiscal}`
            : null) ??
          n.url_xml;
        const xml = cam ? await baixar(cam, tokenDe(n.emitente_id)) : null;
        const falha = !cam ? "sem_caminho" : xml ? null : "xml_nao_baixou";
        decisoes.push({ n, r: resultadoBackfill(xml, n, falha) });
      }),
    );
  }

  const semSentido = decisoes.filter((d) => !d.r.ok && SEM_SENTIDO.includes(d.r.falha)).length;
  const parado = lista.length > 0 && semSentido / lista.length > LIMITE_SEM_SENTIDO;

  const falhas: Record<string, number> = {};
  let corrigidas = 0,
    comDivergencia = 0,
    divergServicos = 0,
    issAntes = 0,
    issDepois = 0;
  const itens: any[] = [];
  for (const { n, r } of decisoes) {
    const upd = r.ok
      ? { aliquota_iss: r.aliquota_iss, valor_iss: r.valor_iss, retorno_conferencia: r.conferencia }
      : { retorno_conferencia: r.conferencia };
    if (!parado) {
      let u = admin.from("nfse").update(upd).eq("id", n.id).eq("status", "emitida");
      u = opts.reprocessarFalhas
        ? u.not("retorno_conferencia->>falha", "is", null)
        : u.is("retorno_conferencia", null);
      const { error: eu } = await u;
      if (eu) {
        falhas.erro_gravacao = (falhas.erro_gravacao ?? 0) + 1;
        continue;
      }
    }
    if (r.ok) {
      corrigidas++;
      issAntes += Number(n.valor_iss ?? 0);
      issDepois += r.valor_iss;
      if (r.conferencia.divergencia_aliquota) comDivergencia++;
      if (r.conferencia.divergencia_servicos) divergServicos++;
    } else {
      falhas[r.falha as FalhaBackfill] = (falhas[r.falha] ?? 0) + 1;
    }
    itens.push({
      numero: n.numero,
      aliquota_antes: n.aliquota_iss,
      aliquota_xml: r.ok ? r.aliquota_iss : null,
      iss_antes: n.valor_iss,
      iss_depois: r.ok ? r.valor_iss : null,
      falha: r.ok ? null : r.falha,
      divergencia_servicos: r.conferencia.divergencia_servicos ?? null,
    });
  }
  return {
    processadas: lista.length,
    parado,
    semSentido,
    corrigidas,
    comDivergencia,
    divergServicos,
    issAntes: Math.round(issAntes * 100) / 100,
    issDepois: Math.round(issDepois * 100) / 100,
    falhas,
    itens,
  };
}
