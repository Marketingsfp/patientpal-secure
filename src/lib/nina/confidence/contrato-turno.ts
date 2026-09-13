/**
 * FASE 1 — o contrato é FIXADO UMA VEZ POR TURNO.
 *
 * Compilar duas vezes no mesmo turno abre espaço para misturar versões
 * (publicação trocada no meio do atendimento). Aqui a compilação é memorizada
 * por escopo + hash do texto: mudou o texto, a entrada antiga não é mais
 * encontrada e a versão anterior sai do cache.
 *
 * A memória é pequena e derivada: NÃO é um segundo cadastro de comportamento.
 */
import { hashDoTexto } from "./hash";
import {
  compilarContratoRegras,
  contratoValidoParaPublicacao,
  type ContratoRegras,
  type MetaContrato,
} from "./contrato-regras";

const LIMITE = 8;
const memoria = new Map<string, ContratoRegras>();

function chaveCache(escopo: string, hash: string | null): string {
  return `${escopo}|${hash ?? "sem-hash"}`;
}

/** Compila (ou reaproveita) o contrato do texto exato usado neste turno. */
export function contratoDoTurno(
  texto: string | null | undefined,
  meta: MetaContrato,
): ContratoRegras {
  const hash = meta.hash ?? hashDoTexto(texto ?? null);
  const k = chaveCache(meta.escopo, hash);
  const guardado = memoria.get(k);
  if (guardado && contratoValidoParaPublicacao(guardado, hash)) return guardado;

  const contrato = compilarContratoRegras(texto, { ...meta, hash });
  memoria.set(k, contrato);
  if (memoria.size > LIMITE) {
    const primeira = memoria.keys().next().value;
    if (primeira !== undefined) memoria.delete(primeira);
  }
  return contrato;
}

/**
 * Invalida o cache após publicar. Sem argumentos, limpa tudo; com escopo,
 * limpa apenas aquele escopo (homologação não derruba produção).
 */
export function invalidarContratos(escopo?: string): void {
  if (!escopo) {
    memoria.clear();
    return;
  }
  for (const k of [...memoria.keys()]) {
    if (k.startsWith(`${escopo}|`)) memoria.delete(k);
  }
}

/** Só para conferência em teste/diagnóstico. */
export function contratosEmMemoria(): string[] {
  return [...memoria.keys()];
}
