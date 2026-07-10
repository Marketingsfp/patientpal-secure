import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, PowerOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { useMedicoContext } from "@/hooks/use-medico-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { mostrarErro } from "@/lib/traduzir-erro";

type Medico = { id: string; nome: string };
type Encerramento = { medico_id: string; encerrado_em: string; motivo: string | null };

const hojeISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

/**
 * Botão para encerrar o expediente do dia de um médico.
 * - Médico logado: encerra/reabre o próprio dia direto.
 * - Recepção / gestor / admin: abre diálogo para escolher o médico.
 */
export function EncerrarExpedienteButton() {
  const { user } = useAuth();
  const { clinicaAtual } = useClinica();
  const { medicoId: meuMedicoId, isMedicoOnly } = useMedicoContext();
  const role = clinicaAtual?.role ?? "";
  const podeGerenciar = ["admin", "gestor", "recepcao"].includes(role);

  const [open, setOpen] = useState(false);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [encerrados, setEncerrados] = useState<Map<string, Encerramento>>(new Map());
  const [selMedico, setSelMedico] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const [{ data: meds }, { data: enc }] = await Promise.all([
      supabase
        .from("medicos")
        .select("id, nome")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("medico_expediente_encerramento")
        .select("medico_id, encerrado_em, motivo")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("data", hojeISO()),
    ]);
    setMedicos((meds ?? []) as Medico[]);
    const m = new Map<string, Encerramento>();
    for (const r of (enc ?? []) as Encerramento[]) m.set(r.medico_id, r);
    setEncerrados(m);
    setLoading(false);
  };

  useEffect(() => {
    if (!clinicaAtual) return;
    void carregar();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  useEffect(() => {
    if (isMedicoOnly && meuMedicoId) setSelMedico(meuMedicoId);
  }, [isMedicoOnly, meuMedicoId]);

  if (!clinicaAtual) return null;
  // Nada a mostrar para perfis sem permissão e sem vínculo médico.
  if (!podeGerenciar && !meuMedicoId) return null;

  const meuEncerramento = meuMedicoId ? encerrados.get(meuMedicoId) : null;

  const encerrar = async (medicoId: string, motivoTxt: string) => {
    if (!clinicaAtual || !medicoId) return;
    setSaving(true);
    const { error } = await supabase.from("medico_expediente_encerramento").insert({
      clinica_id: clinicaAtual.clinica_id,
      medico_id: medicoId,
      data: hojeISO(),
      encerrado_por: user?.id ?? null,
      motivo: motivoTxt.trim() || null,
    });
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Expediente encerrado para hoje.");
    setMotivo("");
    await carregar();
  };

  const reabrir = async (medicoId: string) => {
    if (!clinicaAtual) return;
    setSaving(true);
    const { error } = await supabase
      .from("medico_expediente_encerramento")
      .delete()
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("medico_id", medicoId)
      .eq("data", hojeISO());
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Expediente reaberto.");
    await carregar();
  };

  // Fluxo simples do próprio médico logado: toggle direto.
  if (isMedicoOnly && meuMedicoId) {
    if (meuEncerramento) {
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px] px-2"
          onClick={() => void reabrir(meuMedicoId)}
          disabled={saving}
        >
          <CheckCircle2 className="h-3 w-3 mr-1.5 text-emerald-600" />
          Expediente encerrado · Reabrir
        </Button>
      );
    }
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-[11px] px-2"
        onClick={() => setOpen(true)}
      >
        <PowerOff className="h-3 w-3 mr-1.5" /> Encerrar expediente
      </Button>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-[11px] px-2"
        onClick={() => setOpen(true)}
      >
        <PowerOff className="h-3 w-3 mr-1.5" /> Encerrar expediente
        {encerrados.size > 0 && (
          <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
            {encerrados.size}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Encerrar expediente do médico · Hoje</DialogTitle>
            <DialogDescription>
              Sinaliza que o médico já terminou os atendimentos do dia. É possível reabrir a
              qualquer momento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Médico</label>
              <Select
                value={selMedico}
                onValueChange={setSelMedico}
                disabled={isMedicoOnly || loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um médico" />
                </SelectTrigger>
                <SelectContent>
                  {medicos.map((m) => {
                    const enc = encerrados.get(m.id);
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="inline-flex items-center gap-2">
                          {enc ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-muted-foreground" />
                          )}
                          {m.nome}
                          {enc && (
                            <span className="text-[10px] text-muted-foreground">(encerrado)</span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {selMedico && encerrados.get(selMedico) ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Expediente já encerrado hoje
                </div>
                {encerrados.get(selMedico)?.motivo && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Motivo: {encerrados.get(selMedico)?.motivo}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(encerrados.get(selMedico)!.encerrado_em).toLocaleString("pt-BR")}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Motivo (opcional)
                </label>
                <Textarea
                  rows={2}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: última consulta finalizada, agenda encerrada"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Fechar
            </Button>
            {selMedico && encerrados.get(selMedico) ? (
              <Button
                variant="outline"
                disabled={saving}
                onClick={async () => {
                  await reabrir(selMedico);
                }}
              >
                {saving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                Reabrir expediente
              </Button>
            ) : (
              <Button
                disabled={!selMedico || saving}
                onClick={async () => {
                  await encerrar(selMedico, motivo);
                }}
              >
                {saving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                Encerrar expediente
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
