import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, History, X, Loader2 } from "lucide-react";

export type FluxoDetalheAg = {
  id: string;
  paciente_id: string | null;
  paciente_nome: string;
  procedimento: string | null;
  inicio: string;
  medicoNome?: string | null;
};

type PacienteInfo = {
  cpf: string | null;
  telefone: string | null;
  data_nascimento: string | null;
};

type HistItem = { id: string; inicio: string; procedimento: string | null; status: string | null };

function fmtCPF(v?: string | null) {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : v;
}
function fmtTel(v?: string | null) {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return v;
}
function fmtData(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}
function idade(nasc?: string | null) {
  if (!nasc) return null;
  const d = new Date(`${nasc.slice(0, 10)}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  const hoje = new Date();
  let a = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) a--;
  return a;
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="truncate text-sm text-slate-800">{v}</div>
    </div>
  );
}

export function PacienteDetalheDrawer({
  ag, pago, onClose,
}: {
  ag: FluxoDetalheAg | null;
  pago: boolean;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<PacienteInfo | null>(null);
  const [especialidade, setEspecialidade] = useState<string | null>(null);
  const [hist, setHist] = useState<HistItem[] | null>(null);
  const [loadingHist, setLoadingHist] = useState(false);

  const pacienteId = ag?.paciente_id ?? null;

  useEffect(() => {
    setInfo(null);
    setHist(null);
    setEspecialidade(null);
    if (!ag) return;
    let active = true;
    if (pacienteId) {
      void supabase
        .from("pacientes")
        .select("cpf, telefone, data_nascimento")
        .eq("id", pacienteId)
        .maybeSingle()
        .then(({ data }) => { if (active && data) setInfo(data as PacienteInfo); });
    }
    void supabase
      .from("agendamentos")
      .select("especialidade")
      .eq("id", ag.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setEspecialidade((data as { especialidade?: string | null }).especialidade ?? null);
      });
    return () => { active = false; };
  }, [ag, pacienteId]);

  const carregarHistorico = async () => {
    if (!pacienteId) return;
    setLoadingHist(true);
    const { data } = await supabase
      .from("agendamentos")
      .select("id, inicio, procedimento, status")
      .eq("paciente_id", pacienteId)
      .order("inicio", { ascending: false })
      .limit(15);
    setLoadingHist(false);
    setHist((data ?? []) as HistItem[]);
  };

  const hora = ag
    ? new Date(ag.inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";
  const anos = idade(info?.data_nascimento);

  return (
    <Sheet open={!!ag} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col overflow-y-auto">
        {ag && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="truncate">{ag.paciente_nome}</SheetTitle>
              <SheetDescription>Detalhes do atendimento</SheetDescription>
            </SheetHeader>

            <div className="mt-1">
              <Badge className={pago
                ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                : "bg-amber-100 text-amber-700 border border-amber-300"}>
                {pago ? "PAGO" : "PENDENTE"}
              </Badge>
            </div>

            <Separator className="my-3" />

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Info k="CPF" v={fmtCPF(info?.cpf)} />
              <Info k="Telefone" v={fmtTel(info?.telefone)} />
              <Info
                k="Nascimento"
                v={`${fmtData(info?.data_nascimento)}${anos !== null ? ` · ${anos}a` : ""}`}
              />
              <Info k="Horário" v={hora} />
              <Info k="Médico" v={ag.medicoNome ?? "—"} />
              <Info k="Especialidade" v={especialidade ?? "—"} />
              <div className="col-span-2">
                <Info k="Serviço / Procedimento" v={ag.procedimento ?? "—"} />
              </div>
            </div>

            {hist && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                  Histórico de agendamentos
                </div>
                {hist.length === 0 && (
                  <div className="text-sm text-muted-foreground">Nenhum agendamento anterior.</div>
                )}
                <ul className="space-y-1.5">
                  {hist.map((h) => (
                    <li key={h.id} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-700">{fmtData(h.inicio)}</span>
                        <span className="text-muted-foreground">{h.status ?? "—"}</span>
                      </div>
                      <div className="truncate text-muted-foreground">{h.procedimento ?? "—"}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-auto pt-4 flex flex-col gap-2">
              {pacienteId && (
                <Button asChild size="sm">
                  <Link to="/app/clientes/$pacienteId/visualizar" params={{ pacienteId }}>
                    <FileText className="h-4 w-4 mr-2" /> Abrir prontuário
                  </Link>
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={carregarHistorico} disabled={!pacienteId || loadingHist}>
                {loadingHist
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <History className="h-4 w-4 mr-2" />}
                Ver histórico de agendamentos
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>
                <X className="h-4 w-4 mr-2" /> Fechar
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}