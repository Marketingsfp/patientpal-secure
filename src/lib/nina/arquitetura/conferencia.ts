/**
 * Conferência do mapa da Arquitetura com o código (parte pura).
 *
 * O aviso do topo da página deixa de depender de um número de versão digitado
 * à mão. A cada abertura, ele compara o que o mapa declara com fatos importados
 * do próprio código do atendimento: a lista de ferramentas do broker e o
 * modelo da Nina. Não lê banco e não executa nada do atendimento.
 *
 * O que NÃO é conferido aqui (e por isso o aviso mostra a data da última
 * revisão completa): descrições, ligações e etapas internas. Esses pontos são
 * protegidos pelos testes em `__tests__/conferencia.test.ts`.
 */
import { CATALOGO_FERRAMENTAS } from "@/lib/nina/tool-broker";
import { MODELO_NINA_ALVO } from "@/lib/nina/modelo-nina";
import { MANIFESTO_ARQUITETURA, NODES_ARQUITETURA, type NodeArquitetura } from "./manifesto";
import { verificarIntegridade, type ProblemaIntegridade } from "./layout-incremental";

export type FatosDoCodigo = {
  /** Ferramentas que o atendimento oferece ao modelo. */
  ferramentas: readonly string[];
  /** Modelo que o atendimento usa. */
  modelo: string;
};

export const FATOS_DO_CODIGO: FatosDoCodigo = {
  ferramentas: Object.keys(CATALOGO_FERRAMENTAS),
  modelo: MODELO_NINA_ALVO,
};

export type Divergencia = {
  tipo: "ferramenta_sem_caixa" | "ferramenta_fora_do_codigo" | "ferramenta_repetida" | "modelo";
  detalhe: string;
};

/** Diferenças entre o que o mapa declara e o que o código usa. */
export function conferirMapaComCodigo(
  fatos: FatosDoCodigo = FATOS_DO_CODIGO,
  nodes: readonly NodeArquitetura[] = NODES_ARQUITETURA,
  modeloDoMapa: string = MANIFESTO_ARQUITETURA.modelo,
): Divergencia[] {
  const divergencias: Divergencia[] = [];
  const caixasPorFerramenta = new Map<string, string[]>();
  for (const node of nodes)
    for (const f of node.ferramentas ?? [])
      caixasPorFerramenta.set(f, [...(caixasPorFerramenta.get(f) ?? []), node.nome]);

  const doCodigo = new Set(fatos.ferramentas);
  for (const f of [...doCodigo].sort())
    if (!caixasPorFerramenta.has(f))
      divergencias.push({
        tipo: "ferramenta_sem_caixa",
        detalhe: `A ferramenta ${f} existe no código e não aparece no mapa.`,
      });
  for (const [f, caixas] of [...caixasPorFerramenta].sort(([a], [b]) => a.localeCompare(b))) {
    if (!doCodigo.has(f))
      divergencias.push({
        tipo: "ferramenta_fora_do_codigo",
        detalhe: `O mapa mostra a ferramenta ${f}, que não existe mais no código.`,
      });
    if (caixas.length > 1)
      divergencias.push({
        tipo: "ferramenta_repetida",
        detalhe: `A ferramenta ${f} aparece em mais de uma caixa: ${caixas.join(", ")}.`,
      });
  }
  if (fatos.modelo !== modeloDoMapa)
    divergencias.push({
      tipo: "modelo",
      detalhe: `O código usa o modelo ${fatos.modelo}, mas o mapa mostra ${modeloDoMapa}.`,
    });
  return divergencias;
}

export type StatusArquitetura = {
  nivel: "conferido" | "divergente" | "inconsistente";
  cor: "verde" | "amarelo" | "vermelho";
  titulo: string;
  detalhe: string;
  problemas: ProblemaIntegridade[];
  divergencias: Divergencia[];
};

function dataBrasileira(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

/**
 * Aviso do topo da página. Nunca fica verde com o mapa diferente do código:
 * desenho quebrado vira vermelho; ferramenta ou modelo diferente vira amarelo.
 */
export function statusArquitetura(
  nodes: NodeArquitetura[] = NODES_ARQUITETURA,
  divergencias: Divergencia[] = conferirMapaComCodigo(FATOS_DO_CODIGO, nodes),
  fatos: FatosDoCodigo = FATOS_DO_CODIGO,
  revisadoEm: string = MANIFESTO_ARQUITETURA.revisadoEm,
): StatusArquitetura {
  const problemas = verificarIntegridade(nodes);
  if (problemas.length > 0) {
    return {
      nivel: "inconsistente",
      cor: "vermelho",
      titulo: "Inconsistência no desenho do mapa",
      detalhe: `${problemas.length} problema(s) estrutural(is): ${problemas
        .slice(0, 3)
        .map((p) => `${p.id} — ${p.problema}`)
        .join("; ")}${problemas.length > 3 ? "…" : ""}`,
      problemas,
      divergencias,
    };
  }
  if (divergencias.length > 0) {
    return {
      nivel: "divergente",
      cor: "amarelo",
      titulo: "O mapa está diferente do código",
      detalhe: `${divergencias.length} diferença(s) encontrada(s). O mapa precisa de revisão.`,
      problemas,
      divergencias,
    };
  }
  return {
    nivel: "conferido",
    cor: "verde",
    titulo: "Mapa conferido com o código",
    detalhe: `As ${fatos.ferramentas.length} ferramentas e o modelo (${fatos.modelo}) batem com o código. Revisão completa do mapa em ${dataBrasileira(revisadoEm)}; mudanças em outras partes do código depois dessa data podem ainda não aparecer.`,
    problemas,
    divergencias,
  };
}
