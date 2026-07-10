import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { isCPFValido, somenteDigitos } from "@/lib/cpf";
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
import type { PatientOption } from "@/components/patient-search-input";

interface QuickPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicaId: string;
  nomeInicial?: string;
  onCreated: (paciente: PatientOption) => void;
}

/**
 * Cadastro rápido de paciente — abre a partir de campos de busca quando
 * "Nenhum paciente encontrado". Cria o paciente na clínica atual apenas
 * com os campos mínimos e devolve o registro criado para seleção imediata.
 */
export function QuickPatientDialog({
  open,
  onOpenChange,
  clinicaId,
  nomeInicial,
  onCreated,
}: QuickPatientDialogProps) {
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [dataNasc, setDataNasc] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset ao abrir e pré-preenche com o texto digitado na busca.
  useEffect(() => {
    if (open) {
      setNome((nomeInicial ?? "").trim());
      setCpf("");
      setDataNasc("");
      setTelefone("");
      setEmail("");
    }
  }, [open, nomeInicial]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const nomeLimpo = nome.trim();
    if (nomeLimpo.length < 3) {
      toast.error("Informe o nome completo do paciente.");
      return;
    }
    if (cpf && !isCPFValido(cpf)) {
      toast.error("CPF inválido.");
      return;
    }
    if (email && !/.+@.+\..+/.test(email)) {
      toast.error("E-mail inválido.");
      return;
    }
    const telDigits = somenteDigitos(telefone);
    if (telefone && telDigits.length < 10) {
      toast.error("Telefone deve conter DDD + número.");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        clinica_id: clinicaId,
        nome: nomeLimpo,
        ativo: true,
      };
      if (cpf) payload.cpf = somenteDigitos(cpf);
      if (dataNasc) payload.data_nascimento = dataNasc;
      if (telDigits) payload.telefone = telDigits;
      if (email) payload.email = email.trim();

      const { data, error } = await supabase
        .from("pacientes")
        .insert(payload)
        .select("id, nome, cpf, telefone, data_nascimento, clinica_id, email")
        .single();
      if (error) throw error;

      const p: PatientOption = {
        id: data.id,
        nome: data.nome,
        cpf: data.cpf,
        telefone: data.telefone,
        data_nascimento: data.data_nascimento,
        clinica_id: data.clinica_id,
        email: data.email,
      };
      toast.success("Paciente cadastrado");
      onCreated(p);
      onOpenChange(false);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastro rápido de paciente</DialogTitle>
          <DialogDescription>
            Preencha os dados básicos. O cadastro completo pode ser feito depois na tela de Clientes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-3">
          <div>
            <Label>Nome completo *</Label>
            <Input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do paciente"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>CPF</Label>
              <Input
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>Data de nascimento</Label>
              <Input type="date" value={dataNasc} onChange={(e) => setDataNasc(e.target.value)} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
                inputMode="tel"
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="paciente@exemplo.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} data-primary>
              {saving ? "Salvando…" : "Cadastrar e selecionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}