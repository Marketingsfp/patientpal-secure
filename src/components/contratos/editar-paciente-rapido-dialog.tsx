import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Save } from "lucide-react";

type PacienteLite = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
};

const schema = z.object({
  email: z
    .string()
    .trim()
    .email("E-mail inválido")
    .or(z.literal("")),
  telefone: z.string().trim().max(40).optional(),
});

export function EditarPacienteRapidoDialog({
  open,
  onOpenChange,
  paciente,
  focus,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  paciente: PacienteLite | null;
  focus?: "email" | "telefone";
  onSaved: (atualizado: PacienteLite) => void;
}) {
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [saving, setSaving] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const telRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && paciente) {
      setEmail(paciente.email ?? "");
      setTelefone(paciente.telefone ?? "");
      setTimeout(() => {
        if (focus === "telefone") telRef.current?.focus();
        else emailRef.current?.focus();
      }, 50);
    }
  }, [open, paciente, focus]);

  if (!paciente) return null;

  async function salvar() {
    const parsed = schema.safeParse({ email, telefone });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setSaving(true);
    try {
      const patch: { email?: string | null; telefone?: string | null } = {};
      const novoEmail = email.trim() || null;
      const novoTel = telefone.trim() || null;
      if (novoEmail !== paciente!.email) patch.email = novoEmail;
      if (novoTel !== paciente!.telefone) patch.telefone = novoTel;
      if (Object.keys(patch).length === 0) {
        onOpenChange(false);
        return;
      }
      const { error } = await supabase
        .from("pacientes")
        .update(patch)
        .eq("id", paciente!.id);
      if (error) throw error;
      onSaved({ ...paciente!, email: novoEmail, telefone: novoTel });
      toast.success("Dados do paciente atualizados.");
      onOpenChange(false);
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar dados do paciente</DialogTitle>
          <DialogDescription>
            Atualize o e-mail e o telefone sem perder o que você já preencheu na venda.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Nome</Label>
            <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center font-medium text-sm">
              {paciente.nome}
              {paciente.cpf ? <span className="ml-2 text-xs text-muted-foreground">— {paciente.cpf}</span> : null}
            </div>
          </div>
          <div>
            <Label htmlFor="ep-email">E-mail</Label>
            <Input
              id="ep-email"
              ref={emailRef}
              type="email"
              placeholder="paciente@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Necessário para o titular acessar o app do cartão.
            </p>
          </div>
          <div>
            <Label htmlFor="ep-tel">Telefone / WhatsApp</Label>
            <Input
              id="ep-tel"
              ref={telRef}
              placeholder="(00) 00000-0000"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <Button onClick={salvar} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? "Salvando..." : "Salvar e continuar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}