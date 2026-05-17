import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Stethoscope, ClipboardList, Clock, BookOpen } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClinica } from "@/hooks/use-clinica";
import { getContextoClinica } from "@/lib/nina.functions";

export const Route = createFileRoute("/_authenticated/app/consulta-rapida")({
  component: ConsultaRapidaPage,
  head: () => ({ meta: [{ title: "Consulta rápida — ClinicaOS" }] }),
});

type Medico = {
  id: string;
  nome: string;
  crm: string;
  crm_uf: string;
  telefone: string | null;
  email: string | null;
  horarios: Array<{ dia: string; inicio: string; fim: string; obs: string | null }>;
};
type Procedimento = {
  id: string;
  nome: string;
  grupo: string | null;
  tipo: string;
  valor_dinheiro_pix: number;
  valor_cartao: number;
  duracao_minutos: number;
  preparo: string | null;
};

const fmtMoney = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ConsultaRapidaPage() {
  const { clinicaAtual } = useClinica();
  const getCtx = useServerFn(getContextoClinica);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [procs, setProcs] = useState<Procedimento[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clinicaAtual) return;
    setLoading(true);
    getCtx({ data: { clinicaId: clinicaAtual.clinica_id } })
      .then((r) => {
        setMedicos((r.medicos ?? []) as Medico[]);
        setProcs((r.procedimentos ?? []) as Procedimento[]);
      })
      .finally(() => setLoading(false));
  }, [clinicaAtual, getCtx]);

  const medicosFiltrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return medicos;
    return medicos.filter(
      (m) =>
        m.nome.toLowerCase().includes(t) ||
        m.crm?.toLowerCase().includes(t) ||
        m.horarios.some((h) => h.dia.toLowerCase().includes(t)),
    );
  }, [medicos, q]);

  const procsFiltrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return procs;
    return procs.filter(
      (p) =>
        p.nome.toLowerCase().includes(t) ||
        p.grupo?.toLowerCase().includes(t),
    );
  }, [procs, q]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" /> Consulta rápida
          </h1>
          <p className="text-sm text-muted-foreground">
            Lembretes para a equipe: médicos, horários e valores de exames sempre à mão.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {medicos.length} médicos · {procs.length} procedimentos
        </Badge>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por médico, exame, dia da semana…"
              className="pl-9 h-11"
              autoFocus
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="medicos">
        <TabsList>
          <TabsTrigger value="medicos" className="gap-2">
            <Stethoscope className="h-4 w-4" /> Médicos & horários
            <Badge variant="secondary" className="ml-1">{medicosFiltrados.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="procs" className="gap-2">
            <ClipboardList className="h-4 w-4" /> Exames & valores
            <Badge variant="secondary" className="ml-1">{procsFiltrados.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="medicos" className="mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : medicosFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum médico encontrado.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {medicosFiltrados.map((m) => (
                <Card key={m.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-primary" />
                      {m.nome}
                    </CardTitle>
                    <CardDescription>
                      CRM {m.crm}/{m.crm_uf}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {m.horarios.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        Sem horários cadastrados.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {m.horarios.map((h, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="text-xs gap-1"
                            title={h.obs ?? ""}
                          >
                            <Clock className="h-3 w-3" />
                            {h.dia} {h.inicio}-{h.fim}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="procs" className="mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : procsFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum exame encontrado.</p>
          ) : (
            <Card>
              <div className="divide-y">
                {procsFiltrados.map((p) => (
                  <div key={p.id} className="px-4 py-3 hover:bg-muted/30">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.grupo ?? "—"} · {p.duracao_minutos} min
                        </div>
                      </div>
                      <div className="flex gap-4 text-sm shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground uppercase">
                            Dinheiro
                          </div>
                          <div className="font-semibold text-emerald-600">
                            {fmtMoney(p.valor_dinheiro_pix)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground uppercase">
                            PIX / Cartão
                          </div>
                          <div className="font-semibold">{fmtMoney(p.valor_cartao)}</div>
                        </div>
                      </div>
                    </div>
                    {p.preparo && (
                      <div className="mt-2 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs">
                        <span className="font-semibold text-amber-800 dark:text-amber-200">Preparo: </span>
                        <span className="text-amber-900 dark:text-amber-100 whitespace-pre-wrap">{p.preparo}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}