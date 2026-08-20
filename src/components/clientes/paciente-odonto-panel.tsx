import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OdontogramaClinico, type FacesEstado } from "@/components/odontologia/odontograma-clinico";
import { AnamneseOdontoTab } from "@/components/odontologia/anamnese-odonto-tab";
import { EvolucaoOdontoTab } from "@/components/odontologia/evolucao-odonto-tab";
import { STATUS_LABEL, type OdontoFace, type OdontoStatus } from "@/lib/odonto";
import { formatDatePura } from "@/lib/date-utils";

interface Props {
  pacienteId: string;
  clinicaId: string;
  /** Sem permissão de escrita em "odontologia" o painel fica só de leitura. */
  readOnly?: boolean;
}

interface DenteRow {
  id: string;
  dente: number;
  face: OdontoFace | null;
  status: OdontoStatus;
  procedimento: string | null;
  observacoes: string | null;
  data: string;
}

interface ItemOrcado {
  id: string;
  descricao: string;
  valor_total: number;
  orcamento_numero: number | null;
  dentes: number[];
}

/**
 * Odontologia dentro da ficha do paciente.
 *
 * É uma visão de consulta: mostra o odontograma já preenchido, a anamnese e a
 * evolução, mas o registro de estado por dente e o orçamento continuam sendo
 * feitos na tela cheia (/app/odontologia), para não haver dois lugares
 * gravando a mesma informação com regras diferentes.
 */
export function PacienteOdontoPanel({ pacienteId, clinicaId, readOnly = false }: Props) {
  const [dentes, setDentes] = useState<DenteRow[]>([]);
  const [itens, setItens] = useState<ItemOrcado[]>([]);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      const [{ data: d }, { data: orcs }] = await Promise.all([
        supabase
          .from("odonto_dentes")
          .select("id,dente,face,status,procedimento,observacoes,data")
          .eq("paciente_id", pacienteId)
          .eq("clinica_id", clinicaId)
          .order("data", { ascending: false }),
        supabase
          .from("orcamentos")
          .select("id, numero")
          .eq("clinica_id", clinicaId)
          .eq("paciente_id", pacienteId)
          .eq("status", "aberto"),
      ]);
      if (!active) return;
      setDentes((d as unknown as DenteRow[]) ?? []);

      const lista = (orcs ?? []) as Array<{ id: string; numero: number }>;
      if (lista.length === 0) {
        setItens([]);
        setLoading(false);
        return;
      }
      const numeroById = new Map(lista.map((o) => [o.id, o.numero]));
      const { data: itensAbertos } = await supabase
        .from("orcamento_itens")
        .select("id, descricao, valor_total, orcamento_id, dentes")
        .in(
          "orcamento_id",
          lista.map((o) => o.id),
        )
        .not("dentes", "is", null);
      if (!active) return;
      setItens(
        (
          (itensAbertos ?? []) as Array<{
            id: string;
            descricao: string;
            valor_total: number;
            orcamento_id: string;
            dentes: number[] | null;
          }>
        ).map((r) => ({
          id: r.id,
          descricao: r.descricao,
          valor_total: Number(r.valor_total),
          orcamento_numero: numeroById.get(r.orcamento_id) ?? null,
          dentes: r.dentes ?? [],
        })),
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [pacienteId, clinicaId]);

  // Estado mais recente por (dente, face) — `dentes` vem ordenado desc por data,
  // então percorrer ao contrário deixa o registro mais novo por último.
  const estados: FacesEstado = useMemo(() => {
    const m: FacesEstado = {};
    for (const r of [...dentes].reverse()) {
      m[`${r.dente}-${(r.face ?? "INTEIRO") as OdontoFace}`] = r.status;
    }
    return m;
  }, [dentes]);

  const orcadoSet = useMemo(() => {
    const s = new Set<number>();
    for (const it of itens) for (const d of it.dentes) s.add(d);
    return s;
  }, [itens]);

  const historico = useMemo(
    () => (selecionado ? dentes.filter((r) => r.dente === selecionado) : []),
    [selecionado, dentes],
  );
  const itensDoDente = useMemo(
    () => (selecionado ? itens.filter((it) => it.dentes.includes(selecionado)) : []),
    [selecionado, itens],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Carregando odontograma…"
            : dentes.length === 0
              ? "Nenhum dente registrado para este paciente."
              : `${dentes.length} registro(s) no odontograma · ${orcadoSet.size} dente(s) em orçamento aberto.`}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/app/odontologia" search={{ paciente: pacienteId }}>
            <ExternalLink className="h-4 w-4 mr-2" /> Abrir módulo completo
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="odontograma" className="space-y-4">
        <TabsList>
          <TabsTrigger value="odontograma">Odontograma</TabsTrigger>
          <TabsTrigger value="anamnese">Anamnese</TabsTrigger>
          <TabsTrigger value="evolucao">Evolução</TabsTrigger>
        </TabsList>

        <TabsContent value="odontograma" className="space-y-4">
          <OdontogramaClinico
            estados={estados}
            onClickFace={(dente) => setSelecionado((atual) => (atual === dente ? null : dente))}
            orcadoSet={orcadoSet}
            denteSelecionado={selecionado}
          />

          {selecionado && itensDoDente.length > 0 && (
            <div className="border rounded-md p-3 bg-amber-50/60 border-amber-200 space-y-1">
              <p className="text-sm font-medium text-amber-900">
                Em orçamento aberto ({itensDoDente.length})
              </p>
              <ul className="text-xs text-amber-900/90 space-y-0.5">
                {itensDoDente.map((it) => (
                  <li key={it.id}>
                    Orç. {it.orcamento_numero ?? "—"} · {it.descricao} · R${" "}
                    {it.valor_total.toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selecionado &&
            (historico.length > 0 ? (
              <div className="border rounded-md p-3 space-y-2">
                <p className="text-sm font-medium">Histórico do dente {selecionado}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Data</TableHead>
                      <TableHead className="w-20">Face</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Procedimento</TableHead>
                      <TableHead>Observações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historico.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{formatDatePura(r.data)}</TableCell>
                        <TableCell className="font-mono">{r.face ?? "INTEIRO"}</TableCell>
                        <TableCell>{STATUS_LABEL[r.status]}</TableCell>
                        <TableCell>{r.procedimento ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {r.observacoes ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Dente {selecionado} sem registros. Use “Abrir módulo completo” para registrar.
              </p>
            ))}
        </TabsContent>

        <TabsContent value="anamnese">
          <AnamneseOdontoTab pacienteId={pacienteId} readOnly={readOnly} />
        </TabsContent>

        <TabsContent value="evolucao">
          <EvolucaoOdontoTab pacienteId={pacienteId} readOnly={readOnly} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
