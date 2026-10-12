import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { aplicarConversaoCatalogo, preverConversaoCatalogo } from "@/lib/nina/catalogo.functions";
import {
  LIMITE_LOTE_CONVERSAO,
  type ItemConversao,
  type TipoConversao,
} from "@/lib/nina/catalogo-conversao";

type Resultado = Awaited<ReturnType<typeof aplicarConversaoCatalogo>>["resultados"][number];
const POR_PAGINA = 50;
const ROTULO_TIPO: Record<TipoConversao, string> = {
  servico: "Exame/procedimento",
  profissional: "Profissional",
};

/**
 * Conversão em lote para atendimentos estruturados, com prévia item a item.
 * Itens publicados continuam publicados; cada um guarda a cópia do formato
 * antigo para desfazer.
 */
export function ConversaoEmLote({
  clinicaId,
  onConcluido,
}: {
  clinicaId: string;
  onConcluido: () => void;
}) {
  const prever = useServerFn(preverConversaoCatalogo);
  const aplicar = useServerFn(aplicarConversaoCatalogo);
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [status, setStatus] = useState("");
  const [itens, setItens] = useState<ItemConversao[] | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [aba, setAba] = useState<"converter" | "revisar">("converter");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [confirmado, setConfirmado] = useState(false);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);

  const chave = (i: { tipo: string; id: string }) => `${i.tipo}:${i.id}`;

  async function gerarPrevia() {
    setOcupado(true);
    setErro("");
    setItens(null);
    setResultados(null);
    setConfirmado(false);
    try {
      const todos: ItemConversao[] = [];
      for (const tipo of ["servico", "profissional"] as const) {
        let inicio: number | null = 0;
        while (inicio !== null) {
          setStatus(`Lendo ${ROTULO_TIPO[tipo].toLowerCase()}s: ${todos.length} itens conferidos…`);
          const r: { itens: ItemConversao[]; proximo: number | null } = await prever({
            data: { clinicaId, tipo, inicio },
          });
          todos.push(...r.itens);
          inicio = r.proximo;
        }
      }
      setItens(todos);
      setSelecionados(new Set(todos.filter((i) => i.acao === "converter").map(chave)));
      setPagina(0);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
      setStatus("");
    }
  }

  async function converter() {
    if (!itens) return;
    const alvo = itens.filter((i) => i.acao === "converter" && selecionados.has(chave(i)));
    setOcupado(true);
    setErro("");
    const todos: Resultado[] = [];
    try {
      for (let i = 0; i < alvo.length; i += LIMITE_LOTE_CONVERSAO) {
        setStatus(`Convertendo: ${i} de ${alvo.length}…`);
        const lote = alvo
          .slice(i, i + LIMITE_LOTE_CONVERSAO)
          .map(({ tipo, id, versao }) => ({ tipo, id, versao }));
        const r = await aplicar({ data: { clinicaId, itens: lote } });
        todos.push(...r.resultados);
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setResultados(todos);
      setOcupado(false);
      setStatus("");
      onConcluido();
    }
  }

  const totais = useMemo(() => {
    const t = { converter: 0, comAviso: 0, revisar: 0, convertido: 0 };
    for (const i of itens ?? []) {
      if (i.acao === "convertido") t.convertido++;
      else if (i.acao === "revisar") t.revisar++;
      else {
        t.converter++;
        if (i.avisos.length) t.comAviso++;
      }
    }
    return t;
  }, [itens]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (itens ?? []).filter(
      (i) => i.acao === aba && (!termo || i.nome.toLowerCase().includes(termo)),
    );
  }, [itens, aba, busca]);
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const visiveis = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const qtdSelecionados = (itens ?? []).filter(
    (i) => i.acao === "converter" && selecionados.has(chave(i)),
  ).length;
  const alternar = (k: string, marcado: boolean) =>
    setSelecionados((s) => {
      const n = new Set(s);
      if (marcado) n.add(k);
      else n.delete(k);
      return n;
    });

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setAberto(true);
          void gerarPrevia();
        }}
      >
        Converter cadastros antigos para atendimentos
      </Button>
      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          if (!ocupado) setAberto(v);
        }}
      >
        <DialogContent
          data-os-zap="true"
          className="oszap-base-dialog"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>Converter para atendimentos estruturados</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Confira item a item antes de converter. Itens publicados continuam publicados e a Nina
            passa a ler os atendimentos estruturados na hora. Cada item guarda uma cópia do formato
            antigo, e a conversão pode ser desfeita no próprio cadastro.
          </p>
          {status && <p role="status">{status}</p>}
          {erro && <p className="text-sm text-destructive">{erro}</p>}

          {itens && !resultados && (
            <div className="space-y-3">
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <p>
                  <strong>{totais.converter}</strong> prontos para converter
                  {totais.comAviso ? ` (${totais.comAviso} com avisos)` : ""}
                </p>
                <p>
                  <strong>{totais.revisar}</strong> precisam de revisão manual
                </p>
                <p>
                  <strong>{totais.convertido}</strong> já convertidos
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={aba === "converter" ? "default" : "outline"}
                  onClick={() => {
                    setAba("converter");
                    setPagina(0);
                  }}
                >
                  Prontos ({totais.converter})
                </Button>
                <Button
                  size="sm"
                  variant={aba === "revisar" ? "default" : "outline"}
                  onClick={() => {
                    setAba("revisar");
                    setPagina(0);
                  }}
                >
                  Revisão manual ({totais.revisar})
                </Button>
                <Input
                  aria-label="Buscar pelo nome"
                  placeholder="Buscar pelo nome"
                  className="w-full sm:w-56"
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setPagina(0);
                  }}
                />
                {aba === "converter" && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setSelecionados(
                          new Set((itens ?? []).filter((i) => i.acao === "converter").map(chave)),
                        )
                      }
                    >
                      Marcar todos
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>
                      Desmarcar todos
                    </Button>
                  </>
                )}
              </div>

              <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
                {visiveis.map((i) => (
                  <li key={chave(i)} className="rounded-md border p-2 text-sm">
                    <div className="flex items-start gap-2">
                      {aba === "converter" && (
                        <input
                          type="checkbox"
                          className="mt-1"
                          aria-label={`Converter ${i.nome}`}
                          checked={selecionados.has(chave(i))}
                          disabled={ocupado}
                          onChange={(e) => alternar(chave(i), e.target.checked)}
                        />
                      )}
                      <details className="flex-1">
                        <summary className="cursor-pointer">
                          <span className="font-medium">{i.nome}</span>{" "}
                          <span className="text-muted-foreground">
                            · {ROTULO_TIPO[i.tipo]} · {i.status.toLowerCase()}
                            {i.avisos.length ? ` · ${i.avisos.length} aviso(s)` : ""}
                          </span>
                        </summary>
                        <div className="mt-2 space-y-2">
                          {i.motivo && <p className="text-destructive">{i.motivo}</p>}
                          {[...i.bloqueios, ...i.avisos].length > 0 && (
                            <ul className="list-disc pl-5 text-amber-700 dark:text-amber-400">
                              {[...i.bloqueios, ...i.avisos].map((p) => (
                                <li key={p}>{p}</li>
                              ))}
                            </ul>
                          )}
                          {i.atendimentos.map((a, n) => (
                            <div key={`${a.nome}-${n}`} className="rounded bg-muted/50 p-2">
                              <p className="font-medium">{a.nome}</p>
                              {a.linhas.map((l, k) => (
                                <p key={k} className="text-muted-foreground">
                                  {l}
                                </p>
                              ))}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  </li>
                ))}
                {!visiveis.length && (
                  <li className="text-sm text-muted-foreground">Nenhum item nesta lista.</li>
                )}
              </ul>
              {paginas > 1 && (
                <div className="flex items-center gap-2 text-sm">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pagina === 0}
                    onClick={() => setPagina((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <span>
                    Página {pagina + 1} de {paginas}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pagina + 1 >= paginas}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              )}

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmado}
                  disabled={ocupado}
                  onChange={(e) => setConfirmado(e.target.checked)}
                />
                Conferi a prévia. Converter {qtdSelecionados} item(ns); os publicados passam a ser
                lidos pela Nina no formato novo.
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={ocupado || !confirmado || qtdSelecionados === 0}
                  onClick={() => void converter()}
                >
                  Converter {qtdSelecionados} selecionado(s)
                </Button>
                <Button variant="outline" disabled={ocupado} onClick={() => void gerarPrevia()}>
                  Gerar nova prévia
                </Button>
              </div>
            </div>
          )}

          {resultados && (
            <div className="space-y-2 text-sm">
              <p>
                <strong>{resultados.filter((r) => r.ok).length}</strong> convertido(s);{" "}
                <strong>{resultados.filter((r) => !r.ok).length}</strong> não convertido(s).
              </p>
              {resultados.some((r) => !r.ok) && (
                <ul className="max-h-[40vh] list-disc space-y-1 overflow-y-auto pl-5">
                  {resultados
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <li key={chave(r)}>
                        {r.nome}: {r.motivo}
                      </li>
                    ))}
                </ul>
              )}
              <Button variant="outline" onClick={() => void gerarPrevia()}>
                Gerar nova prévia
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
