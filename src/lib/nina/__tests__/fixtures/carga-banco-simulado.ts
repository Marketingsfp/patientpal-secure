/** PostgREST simulado: UPDATE filtra atomicamente e trigger devolve revisão nova. */
import { normalizarConfig } from "../../carga";
import type { CargaPersistida } from "../../carga-controle";
export const CLINICA_CARGA = "11111111-1111-4111-8111-111111111111";
export const RUN_CARGA = "22222222-2222-4222-8222-222222222222";
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export function cargaFicticia(extra: Partial<CargaPersistida> = {}): CargaPersistida {
  const agora = new Date().toISOString();
  const config = normalizarConfig({
    perfil: "customizado",
    leadsAtivos: 2,
    conversasSimultaneas: 2,
    totalMensagens: 2,
    intervaloMs: 0,
    mensagensPorMinuto: 240,
  });
  return {
    id: RUN_CARGA,
    nome: "Carga simulada",
    clinica_id: CLINICA_CARGA,
    status: "executando",
    cancelar: false,
    updated_at: agora,
    created_at: agora,
    iniciado_em: agora,
    config,
    enviadas: 0,
    total_planejado: 2,
    sucesso: 0,
    erros: 0,
    timeouts: 0,
    chamadas_modelo: 0,
    plano: [0, 1].map((indice) => ({
      indice,
      leadId: `lead-${indice}`,
      leadIndice: indice + 1,
      mensagem: "oi",
      cenario: "fictício",
    })),
    preflight: [0, 1].map((indice) => ({
      runId: RUN_CARGA,
      leadId: `lead-${indice}`,
      leadIndice: indice + 1,
      sessao: 1,
      preparedAt: agora,
      resetOk: true,
      memoriaLimpa: true,
    })),
    ...extra,
  };
}
export function criarBancoCargaSimulado(cargas: CargaPersistida[] = [cargaFicticia()]) {
  const tabelas: Record<string, any[]> = {
    nina_teste_carga: clone(cargas),
    nina_teste_carga_amostras: [],
    nina_execucoes: [],
    nina_teste_leads: Array.from({ length: 10 }, (_, indice) => ({
      id: `lead-${indice}`,
      indice: indice + 1,
      clinica_id: CLINICA_CARGA,
      sessao_seq: 1,
      conversa_id: null,
      ciclo_id: null,
    })),
    clinica_memberships: [
      { id: "member", clinica_id: CLINICA_CARGA, user_id: "user", ativo: true },
    ],
  };
  const locks = new Map<string, string>();
  const consultas: Array<{ tabela: string; operacao: string; filtros: Array<[string, unknown]> }> =
    [];
  let contador = 0;
  let falha: { tabela: string; operacao: string; mensagem: string } | null = null;
  let disputarUpdate: (() => void) | null = null;
  const campo = (linha: any, caminho: string): any =>
    caminho.split(/->>?/).reduce((v, k) => v?.[k], linha);
  const admin: any = {
    from(tabela: string) {
      const filtros: Array<(r: any) => boolean> = [];
      const descricoes: Array<[string, unknown]> = [];
      let operacao = "select",
        patch: any = null,
        inserts: any[] = [],
        limite = Infinity,
        unico = false,
        ignorarDuplicadas = false;
      let ordenar: { campo: string; asc: boolean } | null = null;
      const query: any = {
        select() {
          return query;
        },
        eq(c: string, v: unknown) {
          filtros.push((r) => campo(r, c) === v);
          descricoes.push([c, v]);
          return query;
        },
        in(c: string, v: unknown[]) {
          filtros.push((r) => v.includes(campo(r, c)));
          descricoes.push([c, v]);
          return query;
        },
        gte(c: string, v: any) {
          filtros.push((r) => campo(r, c) >= v);
          return query;
        },
        not(c: string, _op: string, v: unknown) {
          filtros.push((r) => (v === null ? campo(r, c) != null : campo(r, c) !== v));
          return query;
        },
        order(c: string, op?: { ascending?: boolean }) {
          ordenar = { campo: c, asc: op?.ascending !== false };
          return query;
        },
        limit(n: number) {
          limite = n;
          return query;
        },
        maybeSingle() {
          unico = true;
          return query;
        },
        update(p: any) {
          operacao = "update";
          patch = clone(p);
          return query;
        },
        insert(p: any) {
          operacao = "insert";
          inserts = clone(Array.isArray(p) ? p : [p]);
          return query;
        },
        upsert(p: any, opts: any) {
          operacao = "insert";
          inserts = clone(Array.isArray(p) ? p : [p]);
          ignorarDuplicadas = opts?.ignoreDuplicates === true;
          return query;
        },
        then(resolve: (v: unknown) => unknown, reject: (v: unknown) => unknown) {
          return Promise.resolve()
            .then(() => {
              consultas.push({ tabela, operacao, filtros: descricoes });
              if (falha?.tabela === tabela && falha.operacao === operacao) {
                const erro = falha;
                falha = null;
                return { data: null, error: { message: erro.mensagem } };
              }
              const linhas = tabelas[tabela] ?? (tabelas[tabela] = []);
              if (operacao === "update" && tabela === "nina_teste_carga" && disputarUpdate) {
                const disputar = disputarUpdate;
                disputarUpdate = null;
                disputar();
              }
              let resultado = linhas.filter((r) => filtros.every((f) => f(r)));
              if (operacao === "insert") {
                resultado = inserts
                  .filter((p) => !ignorarDuplicadas || !linhas.some((l) => l.id === p.id))
                  .map((p) => ({
                    id: `00000000-0000-4000-8000-${String(++contador).padStart(12, "0")}`,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    cancelar: false,
                    enviadas: 0,
                    ...p,
                  }));
                linhas.push(...resultado);
              } else if (operacao === "update") {
                for (const linha of resultado) {
                  // Precisão adicional simula timestamptz; CAS deve usar exatamente o retorno.
                  const revisao = new Date(Date.now() + ++contador)
                    .toISOString()
                    .replace("Z", "123Z");
                  Object.assign(linha, clone(patch), { updated_at: revisao });
                }
              }
              if (ordenar) {
                const o = ordenar;
                resultado.sort(
                  (a, b) =>
                    String(campo(a, o.campo)).localeCompare(String(campo(b, o.campo))) *
                    (o.asc ? 1 : -1),
                );
              }
              resultado = resultado.slice(0, limite);
              return { data: clone(unico ? (resultado[0] ?? null) : resultado), error: null };
            })
            .then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(nome: string, args: any) {
      if (nome === "nina_lock_adquirir") {
        if (locks.has(args._chave)) return { data: null, error: null };
        const token = `lock-${++contador}`;
        locks.set(args._chave, token);
        return { data: token, error: null };
      }
      if (nome === "nina_lock_liberar") {
        if (locks.get(args._chave) === args._token) locks.delete(args._chave);
        return { data: true, error: null };
      }
      throw new Error(`RPC não simulada: ${nome}`);
    },
  };
  return {
    admin,
    tabelas,
    consultas,
    disputarProximoUpdate(fn: () => void) {
      disputarUpdate = fn;
    },
    locks,
    falharUmaVez(tabela: string, operacao: string, mensagem = "falha simulada") {
      falha = { tabela, operacao, mensagem };
    },
  };
}

export function promessaControlada<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}
