import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { isCPFValido, somenteDigitos } from "@/lib/cpf";
import { erroCaractereNome, sanitizarNomePessoa, validarNomePessoa } from "@/lib/nome-pessoa";
import {
  AJUDA_PRONTUARIO,
  PLACEHOLDER_PRONTUARIO,
  conflitoCodigoProntuario,
  normalizarCodigoProntuario,
} from "@/lib/prontuario";
import { LIMITES } from "@/lib/seguranca/sanitizar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputCPF, InputTelefone } from "@/components/ui/masked-input";
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

import { DateInputBR } from "@/components/ui/date-input-br";
import { FaceCaptureDialog } from "@/components/face/FaceCaptureDialog";
import { Camera, CheckCircle2 } from "lucide-react";
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
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [cpf, setCpf] = useState("");
  const [dataNasc, setDataNasc] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [codigoProntuario, setCodigoProntuario] = useState("");
  const [saving, setSaving] = useState(false);
  const [faceOpen, setFaceOpen] = useState(false);
  const [descritor, setDescritor] = useState<number[] | null>(null);

  // Reset ao abrir e pré-preenche com o texto digitado na busca.
  useEffect(() => {
    if (open) {
      setNome((nomeInicial ?? "").trim());
      setErroNome(null);
      setCpf("");
      setDataNasc("");
      setTelefone("");
      setEmail("");
      setCodigoProntuario("");
      setDescritor(null);
    }
  }, [open, nomeInicial]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const vNome = validarNomePessoa(nome);
    if (!vNome.valido || vNome.valor.length < 3) {
      const msg = vNome.mensagem ?? "Informe o nome completo do paciente.";
      setErroNome(msg);
      toast.error(msg);
      return;
    }
    const nomeLimpo = vNome.valor;
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

    // Prontuário digitado pela recepção (número da ficha antiga). Em branco,
    // o banco gera um número automático. É único por clínica, então avisamos
    // antes de gravar em vez de devolver erro cru do índice único.
    const codigo = normalizarCodigoProntuario(codigoProntuario);
    const conflito = await conflitoCodigoProntuario(clinicaId, codigo);
    if (conflito) {
      toast.error(conflito);
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("pacientes")
        .insert({
          clinica_id: clinicaId,
          nome: nomeLimpo,
          ativo: true,
          cpf: cpf ? somenteDigitos(cpf) : null,
          data_nascimento: dataNasc || null,
          telefone: telDigits || null,
          email: email ? email.trim() : null,
          codigo_prontuario: codigo,
        })
        .select("id, nome, cpf, telefone, data_nascimento, clinica_id, email")
        .single();
      if (error) throw error;

      if (descritor) {
        const { error: bioErr } = await supabase.from("paciente_biometria").insert({
          paciente_id: data.id,
          clinica_id: clinicaId,
          descriptor: descritor as unknown as never,
          consentimento_em: new Date().toISOString(),
        });
        if (bioErr) {
          console.error(bioErr);
          toast.warning("Paciente salvo, mas a foto não foi registrada.");
        }
      }

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
            Preencha os dados básicos. O cadastro completo pode ser feito depois na tela de
            Clientes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-3">
          <div>
            <Label>Nome completo *</Label>
            <Input
              autoFocus
              uppercase
              value={nome}
              onChange={(e) => {
                setErroNome(erroCaractereNome(e.target.value));
                setNome(sanitizarNomePessoa(e.target.value));
              }}
              placeholder="Nome do paciente"
              maxLength={200}
            />
            {erroNome && <p className="text-xs text-destructive mt-1">{erroNome}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>CPF</Label>
              <InputCPF value={cpf} onChange={(v) => setCpf(v)} />
            </div>
            <div>
              <Label>Data de nascimento</Label>
              <DateInputBR value={dataNasc} onChange={(e) => setDataNasc(e.target.value)} />
            </div>
            <div>
              <Label>Telefone</Label>
              <InputTelefone value={telefone} onChange={(v) => setTelefone(v)} />
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
          <div>
            <Label>Número de prontuário</Label>
            <Input
              value={codigoProntuario}
              onChange={(e) => setCodigoProntuario(e.target.value)}
              placeholder={PLACEHOLDER_PRONTUARIO}
              maxLength={LIMITES.codigo}
            />
            <p className="text-xs text-muted-foreground mt-1">{AJUDA_PRONTUARIO}</p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant={descritor ? "secondary" : "outline"}
              size="sm"
              onClick={() => setFaceOpen(true)}
            >
              {descritor ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1 text-green-600" /> Foto capturada — refazer
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4 mr-1" /> Tirar foto (reconhecimento facial)
                </>
              )}
            </Button>
            {descritor && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => setDescritor(null)}
              >
                remover
              </button>
            )}
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
        <FaceCaptureDialog
          open={faceOpen}
          onClose={() => setFaceOpen(false)}
          onCaptured={(desc) => {
            setDescritor(desc);
            toast.success("Foto capturada. Será vinculada ao cadastrar.");
          }}
          titulo="Cadastrar rosto do paciente"
        />
      </DialogContent>
    </Dialog>
  );
}
