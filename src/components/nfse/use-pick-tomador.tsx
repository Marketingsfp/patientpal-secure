import { useCallback, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export interface TomadorPayload {
  nome: string;
  cpfCnpj?: string;
  email?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  /**
   * Quando o tomador é um terceiro pagador, permite descrever quem foi o
   * dependente (paciente) efetivamente atendido. Fica em branco quando a
   * NFS-e é emitida no nome do próprio paciente.
   */
  dependenteAtendido?: string;
}

export interface PickTomadorInput {
  /** Dados do paciente (cliente do serviço). Se null, só permite terceiro. */
  paciente: TomadorPayload | null;
  /** Rótulo do paciente para o rádio (default: paciente.nome). */
  pacienteLabel?: string;
}

/**
 * Diálogo que pergunta se a NFS-e deve ser emitida em nome do
 * paciente (cliente do serviço) ou de um terceiro pagador. No caso
 * de terceiro, coleta nome + CPF/CNPJ + demais campos opcionais.
 */
export function usePickTomador() {
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"paciente" | "terceiro">("paciente");
  const [paciente, setPaciente] = useState<TomadorPayload | null>(null);
  const [pacienteLabel, setPacienteLabel] = useState<string>("");
  const [terceiro, setTerceiro] = useState<TomadorPayload>({
    nome: "", cpfCnpj: "", email: "", cep: "", logradouro: "", numero: "", bairro: "", municipio: "", uf: "", dependenteAtendido: "",
  });
  const resolverRef = useRef<((v: TomadorPayload | null) => void) | null>(null);

  const pick = useCallback(async (input: PickTomadorInput): Promise<TomadorPayload | null> => {
    setPaciente(input.paciente);
    setPacienteLabel(input.pacienteLabel ?? input.paciente?.nome ?? "Paciente");
    setModo(input.paciente ? "paciente" : "terceiro");
    setTerceiro({ nome: "", cpfCnpj: "", email: "", cep: "", logradouro: "", numero: "", bairro: "", municipio: "", uf: "", dependenteAtendido: "" });
    return new Promise<TomadorPayload | null>((resolve) => {
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const confirm = () => {
    const r = resolverRef.current; resolverRef.current = null;
    if (modo === "paciente" && paciente) { setOpen(false); r?.(paciente); return; }
    const nome = terceiro.nome.trim();
    const cpfCnpj = (terceiro.cpfCnpj ?? "").replace(/\D/g, "");
    if (!nome || (cpfCnpj.length !== 11 && cpfCnpj.length !== 14)) {
      // reabre o resolver e não fecha o diálogo
      resolverRef.current = r;
      return;
    }
    setOpen(false);
    r?.({
      nome,
      cpfCnpj,
      email: terceiro.email?.trim() || undefined,
      cep: terceiro.cep?.trim() || undefined,
      logradouro: terceiro.logradouro?.trim() || undefined,
      numero: terceiro.numero?.trim() || undefined,
      bairro: terceiro.bairro?.trim() || undefined,
      municipio: terceiro.municipio?.trim() || undefined,
      uf: terceiro.uf?.trim() || undefined,
      dependenteAtendido: terceiro.dependenteAtendido?.trim() || undefined,
    });
  };

  const cancel = () => {
    const r = resolverRef.current; resolverRef.current = null;
    setOpen(false);
    r?.(null);
  };

  const dialog = (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Em nome de quem emitir a NFS-e?</DialogTitle>
          <DialogDescription>
            Escolha se a nota vai para o paciente (cliente do serviço) ou para um terceiro que pagou pelo atendimento.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={modo} onValueChange={(v) => setModo(v as "paciente" | "terceiro")} className="space-y-2">
          <label className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${modo === "paciente" ? "border-primary bg-primary/5" : ""} ${!paciente ? "opacity-50 cursor-not-allowed" : ""}`}>
            <RadioGroupItem value="paciente" disabled={!paciente} className="mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">Cliente do serviço (paciente)</div>
              <div className="text-xs text-muted-foreground">
                {paciente ? pacienteLabel : "Nenhum paciente vinculado ao atendimento."}
                {paciente?.cpfCnpj ? ` • CPF/CNPJ ${paciente.cpfCnpj}` : ""}
              </div>
            </div>
          </label>
          <label className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${modo === "terceiro" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="terceiro" className="mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">Terceiro (outro pagador)</div>
              <div className="text-xs text-muted-foreground">Empresa ou pessoa diferente do paciente.</div>
            </div>
          </label>
        </RadioGroup>

        {modo === "terceiro" && (
          <div className="space-y-3 border-t pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label>Nome / Razão social *</Label>
                <Input value={terceiro.nome} onChange={(e) => setTerceiro({ ...terceiro, nome: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>CPF/CNPJ * (só números)</Label>
                <Input value={terceiro.cpfCnpj ?? ""} onChange={(e) => setTerceiro({ ...terceiro, cpfCnpj: e.target.value })} placeholder="11 ou 14 dígitos" />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input value={terceiro.email ?? ""} onChange={(e) => setTerceiro({ ...terceiro, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>CEP</Label>
                <Input value={terceiro.cep ?? ""} onChange={(e) => setTerceiro({ ...terceiro, cep: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>UF</Label>
                <Input value={terceiro.uf ?? ""} onChange={(e) => setTerceiro({ ...terceiro, uf: e.target.value })} maxLength={2} />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label>Logradouro</Label>
                <Input value={terceiro.logradouro ?? ""} onChange={(e) => setTerceiro({ ...terceiro, logradouro: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Número</Label>
                <Input value={terceiro.numero ?? ""} onChange={(e) => setTerceiro({ ...terceiro, numero: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input value={terceiro.bairro ?? ""} onChange={(e) => setTerceiro({ ...terceiro, bairro: e.target.value })} />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label>Município</Label>
                <Input value={terceiro.municipio ?? ""} onChange={(e) => setTerceiro({ ...terceiro, municipio: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={cancel}>Cancelar</Button>
          <Button onClick={confirm}>Emitir nesta pessoa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { pick, dialog };
}