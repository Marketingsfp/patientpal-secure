import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, IdCard, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { somenteDigitos, isCPFValido } from "@/lib/cpf";

interface Props {
  pacienteId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
  /** Se true, exige também campos de endereço/e-mail (necessários p/ NFS-e) */
  requireNfse?: boolean;
}

type Pendencias = {
  contato_ok: boolean;
  documentacao_ok: boolean;
  endereco_ok: boolean;
  nfse_ok: boolean;
  faltantes: string[];
};

type PacienteRow = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
};

export function PatientQuickCompleteSheet({
  pacienteId,
  open,
  onOpenChange,
  onSaved,
  requireNfse,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pend, setPend] = useState<Pendencias | null>(null);
  const [row, setRow] = useState<PacienteRow | null>(null);

  useEffect(() => {
    if (!open || !pacienteId) return;
    setLoading(true);
    (async () => {
      const [{ data: p }, { data: pd }] = await Promise.all([
        supabase
          .from("pacientes")
          .select(
            "id,nome,cpf,telefone,email,data_nascimento,cep,logradouro,numero,complemento,bairro,cidade,estado",
          )
          .eq("id", pacienteId)
          .maybeSingle(),
        supabase.rpc("paciente_pendencias_cadastro", { _paciente_id: pacienteId }),
      ]);
      setRow((p as PacienteRow) ?? null);
      const arr = Array.isArray(pd) ? pd[0] : pd;
      setPend((arr as Pendencias) ?? null);
      setLoading(false);
    })();
  }, [open, pacienteId]);

  function set<K extends keyof PacienteRow>(k: K, v: PacienteRow[K]) {
    setRow((r) => (r ? { ...r, [k]: v } : r));
  }

  async function buscarCep() {
    const d = somenteDigitos(row?.cep ?? "");
    if (d.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j?.erro) return;
      setRow((prev) =>
        prev
          ? {
              ...prev,
              logradouro: prev.logradouro || j.logradouro || "",
              bairro: prev.bairro || j.bairro || "",
              cidade: prev.cidade || j.localidade || "",
              estado: prev.estado || j.uf || "",
            }
          : prev,
      );
    } catch {
      /* silencioso */
    }
  }

  async function salvar() {
    if (!row || !pacienteId) return;
    const tel = somenteDigitos(row.telefone ?? "");
    if (tel.length < 10) {
      toast.error("Telefone é obrigatório (DDD + número)");
      return;
    }
    if (row.cpf && !isCPFValido(row.cpf)) {
      toast.error("CPF inválido");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("pacientes")
        .update({
          telefone: tel,
          email: row.email?.trim() || null,
          cpf: row.cpf ? somenteDigitos(row.cpf) : null,
          data_nascimento: row.data_nascimento || null,
          cep: row.cep ? somenteDigitos(row.cep) : null,
          logradouro: row.logradouro?.trim() || null,
          numero: row.numero?.trim() || null,
          complemento: row.complemento?.trim() || null,
          bairro: row.bairro?.trim() || null,
          cidade: row.cidade?.trim() || null,
          estado: row.estado?.trim()?.toUpperCase() || null,
        })
        .eq("id", pacienteId);
      if (error) throw error;
      toast.success("Cadastro atualizado");
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSaving(false);
    }
  }

  const faltantes = pend?.faltantes ?? [];
  const showCont = faltantes.includes("telefone") || faltantes.includes("email") || requireNfse;
  const showDoc = faltantes.includes("cpf") || faltantes.includes("data_nascimento");
  const showEnd =
    requireNfse ||
    ["cep", "logradouro", "numero", "bairro", "cidade", "estado"].some((f) =>
      faltantes.includes(f),
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Completar cadastro</SheetTitle>
          <SheetDescription>
            {row?.nome ? <span className="font-medium">{row.nome}</span> : null}
            <div className="mt-1 flex flex-wrap gap-1">
              {faltantes.map((f) => (
                <Badge key={f} variant="secondary" className="text-[10px]">
                  {f}
                </Badge>
              ))}
            </div>
          </SheetDescription>
        </SheetHeader>

        {loading || !row ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
          </div>
        ) : (
          <div className="space-y-5 mt-4">
            {(showCont || true) && (
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Contato
                </div>
                <div>
                  <Label>Telefone *</Label>
                  <Input
                    value={row.telefone ?? ""}
                    onChange={(e) => set("telefone", e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div>
                  <Label>E-mail {requireNfse && "*"}</Label>
                  <Input
                    type="email"
                    value={row.email ?? ""}
                    onChange={(e) => set("email", e.target.value)}
                  />
                </div>
              </section>
            )}

            {(showDoc || requireNfse) && (
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <IdCard className="h-3 w-3" /> Documentação
                </div>
                <div>
                  <Label>CPF {requireNfse && "*"}</Label>
                  <Input
                    value={row.cpf ?? ""}
                    onChange={(e) => set("cpf", e.target.value)}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <Label>Data de nascimento {requireNfse && "*"}</Label>
                  <Input
                    type="date"
                    value={row.data_nascimento ?? ""}
                    onChange={(e) => set("data_nascimento", e.target.value)}
                  />
                </div>
              </section>
            )}

            {showEnd && (
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Endereço
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <Label>CEP</Label>
                    <Input
                      value={row.cep ?? ""}
                      onChange={(e) => set("cep", e.target.value)}
                      onBlur={buscarCep}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Logradouro</Label>
                    <Input
                      value={row.logradouro ?? ""}
                      onChange={(e) => set("logradouro", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Número</Label>
                    <Input
                      value={row.numero ?? ""}
                      onChange={(e) => set("numero", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Complemento</Label>
                    <Input
                      value={row.complemento ?? ""}
                      onChange={(e) => set("complemento", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Bairro</Label>
                    <Input
                      value={row.bairro ?? ""}
                      onChange={(e) => set("bairro", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>UF</Label>
                    <Input
                      value={row.estado ?? ""}
                      maxLength={2}
                      onChange={(e) => set("estado", e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="col-span-3">
                    <Label>Cidade</Label>
                    <Input
                      value={row.cidade ?? ""}
                      onChange={(e) => set("cidade", e.target.value)}
                    />
                  </div>
                </div>
              </section>
            )}

            {requireNfse && (
              <div className="text-xs rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2 flex items-start gap-2">
                <Mail className="h-3 w-3 mt-0.5" />
                Dados obrigatórios para emissão de NFS-e.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
