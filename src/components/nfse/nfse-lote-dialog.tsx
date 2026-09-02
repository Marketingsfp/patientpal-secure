import { useCallback, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Pencil, RotateCcw, Trash2, Users } from "lucide-react";
import { documentoTomadorValido } from "@/lib/nfse-tomador";
import {
  usePickTomador,
  aplicarValorParcial,
  type TomadorPayload,
} from "@/components/nfse/use-pick-tomador";

/** Um atendimento que vai virar uma NFS-e no lote. */
export interface LinhaNfseLote {
  /** id do agendamento — chave da linha. */
  id: string;
  pacienteId: string;
  pacienteNome: string;
  procedimento?: string | null;
  /** Data do atendimento, só para a operadora reconhecer a linha. */
  dataReferencia?: string | null;
  /** Valor recebido no atendimento (base da nota). */
  valor: number;
  /**
   * O paciente como tomador, já com os dados da ficha. `null` quando o
   * cadastro não foi encontrado — a linha só sai com um terceiro pagador.
   */
  paciente: TomadorPayload | null;
}

/** Uma linha confirmada na revisão, com o tomador que a operadora escolheu. */
export interface LinhaNfseLoteResolvida {
  linha: LinhaNfseLote;
  tomador: TomadorPayload;
}

const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtData(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

/**
 * Por que esta linha ainda não pode virar nota. Devolve `null` quando está
 * pronta. É a mesma regra da emissão individual: sem CPF/CNPJ a prefeitura
 * recusa o XML, e sem endereço a nota sai com o endereço da Receita.
 */
function impedimentoDoTomador(t: TomadorPayload | null): string | null {
  if (!t)
    return "cadastro do paciente não encontrado — escolha um terceiro pagador ou tire do lote";
  if (!documentoTomadorValido(t.cpfCnpj))
    return "sem CPF/CNPJ no cadastro — a prefeitura recusa a nota. Complete a ficha ou escolha um terceiro pagador";
  if (!(t.logradouro ?? "").trim())
    return "sem endereço no cadastro — complete a ficha ou escolha um terceiro pagador";
  return null;
}

/**
 * Tela de revisão da emissão de NFS-e em lote.
 *
 * Existe porque o botão "Emitir NFS-e dos selecionados" disparava as notas
 * direto, e o caixa não tinha onde dizer que aquele atendimento foi pago por
 * outra pessoa (um terceiro pagador). Nota emitida no tomador errado só se
 * desfaz com cancelamento na prefeitura, então a conferência precisa acontecer
 * ANTES do envio.
 *
 * O que a tela permite, antes de confirmar:
 *  - ver linha a linha quem é o tomador e por quanto sai cada nota;
 *  - aplicar um mesmo terceiro pagador a TODAS as notas de uma vez;
 *  - editar uma linha isolada (inclusive o valor, para nota parcial), com a
 *    mesma busca de cadastro que preenche os campos na emissão individual;
 *  - tirar do lote a linha que não deve sair agora.
 *
 * A confirmação fica travada enquanto alguma linha estiver sem CPF ou sem
 * endereço: em lote não há como o balcão perceber uma a uma o que a prefeitura
 * vai recusar.
 */
export function useRevisaoNfseLote() {
  const { pick: pickTomador, dialog: tomadorDialog } = usePickTomador();
  const [open, setOpen] = useState(false);
  const [linhas, setLinhas] = useState<LinhaNfseLote[]>([]);
  // Tomador escolhido à mão para a linha. Sem entrada aqui, vale o paciente.
  const [tomadores, setTomadores] = useState<Map<string, TomadorPayload>>(new Map());
  const [removidas, setRemovidas] = useState<Set<string>>(new Set());
  const [avisoFora, setAvisoFora] = useState<string>("");
  const resolverRef = useRef<((v: LinhaNfseLoteResolvida[] | null) => void) | null>(null);

  const revisar = useCallback(
    async (entrada: {
      linhas: LinhaNfseLote[];
      /** Texto sobre os marcados que nem chegaram a esta tela. */
      avisoFora?: string;
    }): Promise<LinhaNfseLoteResolvida[] | null> => {
      setLinhas(entrada.linhas);
      setTomadores(new Map());
      setRemovidas(new Set());
      setAvisoFora(entrada.avisoFora ?? "");
      setOpen(true);
      return new Promise<LinhaNfseLoteResolvida[] | null>((resolve) => {
        resolverRef.current = resolve;
      });
    },
    [],
  );

  const ativas = useMemo(() => linhas.filter((l) => !removidas.has(l.id)), [linhas, removidas]);

  const efetivo = useCallback(
    (l: LinhaNfseLote): TomadorPayload | null => tomadores.get(l.id) ?? l.paciente,
    [tomadores],
  );

  const valorDaLinha = useCallback(
    (l: LinhaNfseLote): number => aplicarValorParcial(l.valor, efetivo(l) ?? { nome: "" }).valor,
    [efetivo],
  );

  const pendentes = ativas.filter((l) => impedimentoDoTomador(efetivo(l)) !== null);
  const total = ativas.reduce((s, l) => s + valorDaLinha(l), 0);

  /** Um terceiro pagador para o lote inteiro. */
  const aplicarTerceiroEmTodas = async () => {
    const t = await pickTomador({ paciente: null, modoLote: true });
    if (!t) return;
    setTomadores((prev) => {
      const m = new Map(prev);
      for (const l of linhas) {
        if (removidas.has(l.id)) continue;
        m.set(l.id, {
          ...t,
          // Quem pagou é o mesmo para todas, mas o atendido muda a cada linha —
          // e é isso que a descrição da nota precisa dizer.
          dependenteAtendido: l.pacienteNome,
          valorEmitir: undefined,
        });
      }
      return m;
    });
  };

  /** Edita uma linha só — mesmo diálogo da emissão individual. */
  const editarLinha = async (l: LinhaNfseLote) => {
    const atual = tomadores.get(l.id);
    const t = await pickTomador({
      paciente: l.paciente,
      pacienteLabel: l.pacienteNome,
      valorBase: l.valor,
      terceiroInicial: atual ?? null,
    });
    if (!t) return;
    setTomadores((prev) => {
      const m = new Map(prev);
      m.set(l.id, t);
      return m;
    });
  };

  const voltarTodasParaPaciente = () => setTomadores(new Map());

  const confirmar = () => {
    if (ativas.length === 0 || pendentes.length > 0) return;
    const saida: LinhaNfseLoteResolvida[] = ativas.map((l) => ({
      linha: l,
      tomador: efetivo(l) as TomadorPayload,
    }));
    const r = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    r?.(saida);
  };

  const cancelar = () => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    r?.(null);
  };

  const dialog = (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) cancelar();
        }}
      >
        {/* O DialogContent do projeto já ignora clique fora e Esc: a revisão do
            lote não pode sumir por engano com o formulário preenchido. */}
        <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>
              Revisar {ativas.length} nota{ativas.length === 1 ? "" : "s"} fiscal
              {ativas.length === 1 ? "" : "is"} antes de emitir
            </DialogTitle>
            <DialogDescription>
              Sai uma nota para cada atendimento, pelo valor já recebido. Confira em nome de quem
              cada uma vai sair — nota emitida por engano só se desfaz com cancelamento na
              prefeitura.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 border-b pb-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void aplicarTerceiroEmTodas();
              }}
              disabled={ativas.length === 0}
            >
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Aplicar um terceiro pagador a todas
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={voltarTodasParaPaciente}
              disabled={tomadores.size === 0}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Voltar todas para o paciente
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-2">
            {ativas.map((l) => {
              const t = efetivo(l);
              const problema = impedimentoDoTomador(t);
              const trocado = tomadores.has(l.id);
              const valor = valorDaLinha(l);
              const parcial = valor < l.valor - 0.005;
              return (
                <div
                  key={l.id}
                  className={`rounded-md border p-2.5 text-sm ${
                    problema ? "border-destructive/60 bg-destructive/5" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{l.pacienteNome}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[l.procedimento || "Serviços prestados", fmtData(l.dataReferencia)]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge variant={trocado ? "default" : "secondary"}>
                          {trocado ? "Terceiro" : "Paciente"}
                        </Badge>
                        <span className="truncate">
                          {t?.nome || "—"}
                          {t?.cpfCnpj ? ` · ${t.cpfCnpj}` : ""}
                        </span>
                      </div>
                      {trocado && tomadores.get(l.id)?.dependenteAtendido && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                          Dependente do pagador: {tomadores.get(l.id)?.dependenteAtendido}
                        </div>
                      )}
                      {problema && (
                        <div className="mt-1 flex items-start gap-1 text-xs text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                          <span>{problema}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">{fmtBRL(valor)}</div>
                        {parcial && (
                          <div className="text-[11px] text-amber-600">
                            parcial de {fmtBRL(l.valor)}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void editarLinha(l);
                        }}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Editar
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Tirar esta nota do lote"
                        onClick={() =>
                          setRemovidas((prev) => {
                            const s = new Set(prev);
                            s.add(l.id);
                            return s;
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {ativas.length === 0 && (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Nenhuma nota no lote. Feche e marque os atendimentos de novo.
              </div>
            )}
          </div>

          <div className="border-t pt-3 text-sm">
            <span>
              {ativas.length} nota{ativas.length === 1 ? "" : "s"} ·{" "}
              <b className="tabular-nums">{fmtBRL(total)}</b>
              {removidas.size > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {removidas.size} tirada{removidas.size === 1 ? "" : "s"} do lote
                </span>
              )}
            </span>
            {avisoFora && <div className="mt-1 text-xs text-muted-foreground">{avisoFora}</div>}
            {pendentes.length > 0 && (
              <div className="mt-2 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-xs text-destructive">
                {pendentes.length}{" "}
                {pendentes.length === 1
                  ? "nota está com o cadastro incompleto"
                  : "notas estão com o cadastro incompleto"}
                . Escolha um terceiro pagador ou tire do lote para liberar a emissão.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cancelar}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={ativas.length === 0 || pendentes.length > 0}>
              Confirmar emissão em lote ({ativas.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {tomadorDialog}
    </>
  );

  return { revisar, dialog };
}
