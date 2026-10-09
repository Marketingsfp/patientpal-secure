/**
 * NFS-e parte 1b — correção de alíquota/ISS das notas antigas pelo XML oficial.
 * Parte pura: decide o que gravar para UMA nota. Não mexe em payloads nem no
 * cadastro do emitente. Valor sem sentido nunca é gravado (vira falha).
 */
import { lerXmlNfse } from "./nfse-retorno";

export const ORIGEM_BACKFILL = "backfill_xml_1b";
export const LIMITE_SEM_SENTIDO = 0.05; // >5% do lote com valor absurdo = parar

export type FalhaBackfill =
  | "sem_caminho"
  | "xml_nao_baixou"
  | "xml_sem_campos"
  | "aliquota_fora_faixa"
  | "iss_nao_bate"
  | "iss_maior_que_servicos";

export const SEM_SENTIDO: FalhaBackfill[] = [
  "aliquota_fora_faixa",
  "iss_nao_bate",
  "iss_maior_que_servicos",
];

export type Gravado = {
  aliquota_iss: number | null;
  valor_iss: number | null;
  valor_servicos: number | null;
};

export type ResultadoNota =
  | { ok: true; aliquota_iss: number; valor_iss: number; conferencia: Record<string, unknown> }
  | { ok: false; falha: FalhaBackfill; conferencia: Record<string, unknown> };

function vServ(xml: string): number | null {
  const m = xml.match(/<(?:\w+:)?vServ>([^<]*)</);
  const n = m ? Number(m[1].trim().replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function resultadoBackfill(
  xml: string | null,
  gravado: Gravado,
  falhaDownload: "sem_caminho" | "xml_nao_baixou" | null,
  agora: Date = new Date(),
): ResultadoNota {
  const anterior = { aliquota: gravado.aliquota_iss, iss: gravado.valor_iss };
  const base = { origem: ORIGEM_BACKFILL, conferido_em: agora.toISOString(), anterior };
  if (falhaDownload || !xml) {
    const falha = falhaDownload ?? "xml_nao_baixou";
    return { ok: false, falha, conferencia: { ...base, xml_lido: false, falha } };
  }
  const x = lerXmlNfse(xml);
  const servXml = vServ(xml);
  const servGravado = gravado.valor_servicos == null ? null : Number(gravado.valor_servicos);
  const divergenciaServicos =
    servXml !== null && servGravado !== null && Math.abs(servXml - servGravado) > 0.009
      ? { gravado: servGravado, xml: servXml }
      : null;
  const lido = { aliquota: x.aliquota_iss, iss: x.valor_iss, v_serv: servXml };
  const falhar = (falha: FalhaBackfill) => ({
    ok: false as const,
    falha,
    conferencia: {
      ...base,
      xml_lido: true,
      falha,
      xml: lido,
      divergencia_servicos: divergenciaServicos,
    },
  });
  if (x.aliquota_iss === null || x.valor_iss === null) return falhar("xml_sem_campos");
  if (x.aliquota_iss < 0 || x.aliquota_iss > 0.05) return falhar("aliquota_fora_faixa");
  const servRef = servXml ?? servGravado;
  if (servRef !== null) {
    if (x.valor_iss > servRef) return falhar("iss_maior_que_servicos");
    if (Math.abs(r2(servRef * x.aliquota_iss) - x.valor_iss) > 0.02) return falhar("iss_nao_bate");
  }
  const divergente =
    gravado.aliquota_iss !== null &&
    Math.abs(Number(gravado.aliquota_iss) - x.aliquota_iss) > 0.00001;
  return {
    ok: true,
    aliquota_iss: x.aliquota_iss,
    valor_iss: x.valor_iss,
    conferencia: {
      ...base,
      xml_lido: true,
      xml: lido,
      divergencia_aliquota: divergente
        ? { gravada: Number(gravado.aliquota_iss), autorizada: x.aliquota_iss }
        : null,
      divergencia_servicos: divergenciaServicos,
    },
  };
}
