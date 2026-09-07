/**
 * FASE 10 — Teste de carga (Luna) na aba Arquitetura, em visão agregada.
 *
 * Execução de carga → leads → mensagens. Nada é desenhado por mensagem no
 * mapa: o detalhe abre sob demanda, com os dados já gravados pelo teste.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { detalheTesteCarga, listarTestesCarga } from "@/lib/nina/carga.functions";
import { agregarCargaLuna, type AmostraCarga } from "@/lib/nina/arquitetura/homologacao";

type TesteCarga = {
  id: string;
  nome: string;
  perfil: string;
  status: string;
  enviadas: number | null;
  iniciado_em: string | null;
};

export function CargaAgregada({ clinicaId }: { clinicaId: string | null }) {
  const listar = useServerFn(listarTestesCarga);
  const detalhar = useServerFn(detalheTesteCarga);

  const [testes, setTestes] = useState<TesteCarga[] | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [amostras, setAmostras] = useState<AmostraCarga[]>([]);
  const [leadAberto, setLeadAberto] = useState<number | null>(null);

  const lista = useMutation({
    mutationFn: async () => (clinicaId ? listar({ data: { clinicaId } }) : null),
    onSuccess: (r) => setTestes((r?.testes ?? []) as TesteCarga[]),
  });

  const detalhe = useMutation({
    mutationFn: async (cargaId: string) =>
      clinicaId ? detalhar({ data: { clinicaId, cargaId } }) : null,
    onSuccess: (r, cargaId) => {
      setAberto(cargaId);
      setLeadAberto(null);
      setAmostras((r?.amostras ?? []) as AmostraCarga[]);
    },
  });

  if (!clinicaId) return null;
  const agregado = amostras.length ? agregarCargaLuna(amostras) : null;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Testes de carga (Luna)</p>
          <p className="text-xs text-muted-foreground">
            Uma execução agregada por teste: leads envolvidos e mensagens processadas.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => lista.mutate()} disabled={lista.isPending}>
          {lista.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Carregar execuções"}
        </Button>
      </div>

      {testes?.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum teste de carga registrado nesta clínica.</p>
      )}

      <ul className="space-y-2">
        {(testes ?? []).map((t) => (
          <li key={t.id} className="rounded-md border">
            <button
              type="button"
              className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm"
              onClick={() => (aberto === t.id ? setAberto(null) : detalhe.mutate(t.id))}
            >
              {aberto === t.id ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <span className="font-medium">{t.nome}</span>
              <Badge variant="outline">{t.perfil}</Badge>
              <Badge variant="secondary">{t.status}</Badge>
              <span className="text-xs text-muted-foreground">{t.enviadas ?? 0} mensagens</span>
            </button>

            {aberto === t.id && agregado && (
              <div className="space-y-2 border-t px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground">
                  {agregado.leads} leads · {agregado.totalMensagens} mensagens · {agregado.ok} com
                  sucesso · {agregado.erros} com erro
                </p>
                <ul className="space-y-1">
                  {agregado.porLead.map((lead) => (
                    <li key={lead.leadIndice} className="rounded border">
                      <button
                        type="button"
                        className="flex w-full flex-wrap items-center gap-2 px-2 py-1.5 text-left text-xs"
                        onClick={() =>
                          setLeadAberto(leadAberto === lead.leadIndice ? null : lead.leadIndice)
                        }
                      >
                        {leadAberto === lead.leadIndice ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        Lead {String(lead.leadIndice).padStart(2, "0")} · {lead.mensagens} mensagens
                        {lead.erros > 0 && <Badge variant="destructive">{lead.erros} erro(s)</Badge>}
                        {lead.latenciaMediaMs !== null && (
                          <span className="text-muted-foreground">
                            média {lead.latenciaMediaMs} ms
                          </span>
                        )}
                      </button>
                      {leadAberto === lead.leadIndice && (
                        <ul className="space-y-1 border-t px-2 py-1.5 text-xs">
                          {lead.amostras.map((a) => (
                            <li key={a.indice} className="flex flex-wrap gap-2">
                              <span className="text-muted-foreground">#{a.indice}</span>
                              <span className="flex-1">{a.mensagem ?? a.cenario ?? "—"}</span>
                              <span
                                className={a.status === "ok" ? "" : "text-destructive"}
                              >
                                {a.status}
                              </span>
                              {typeof a.latencia_ms === "number" && (
                                <span className="text-muted-foreground">{a.latencia_ms} ms</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
