import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  buscarProcedimentosFisio,
  buscarProfissionaisFisio,
  type ProcedimentoFisio,
} from "@/lib/fisio-catalogo";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onClose: () => void;
  clinicaId: string;
  pacienteId: string;
  pacienteNome: string;
  userId: string | null;
  onCreated: () => void;
}

interface OrcamentoAberto {
  id: string;
  numero: number;
  valor_total: number;
}

const SEM = "nenhum";
const hojeISO = () => new Date().toISOString().slice(0, 10);

/**
 * Criação de um pacote de sessões.
 *
 * Junto com o pacote são criadas as N linhas de sessão, todas em "A marcar".
 * Elas existem desde o início justamente para o contador "7 de 10" sair de uma
 * contagem real, e não de um campo que pode dessincronizar do que aconteceu.
 */
export function NovoPacoteDialog({
  open,
  onClose,
  clinicaId,
  pacienteId,
  pacienteNome,
  userId,
  onCreated,
}: Props) {
  const [descricao, setDescricao] = useState("");
  const [procedimentoId, setProcedimentoId] = useState(SEM);
  const [totalSessoes, setTotalSessoes] = useState("10");
  const [valorTotal, setValorTotal] = useState("0");
  const [dataInicio, setDataInicio] = useState(hojeISO());
  const [profissionalId, setProfissionalId] = useState(SEM);
  const [orcamentoId, setOrcamentoId] = useState(SEM);
  const [observacoes, setObservacoes] = useState("");

  const [procedimentos, setProcedimentos] = useState<ProcedimentoFisio[]>([]);
  const [profissionais, setProfissionais] = useState<{ id: string; nome: string }[]>([]);
  const [orcamentos, setOrcamentos] = useState<OrcamentoAberto[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDescricao("");
    setProcedimentoId(SEM);
    setTotalSessoes("10");
    setValorTotal("0");
    setDataInicio(hojeISO());
    setProfissionalId(SEM);
    setOrcamentoId(SEM);
    setObservacoes("");
  }, [open, pacienteId]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [proc, med, { data: orc }] = await Promise.all([
        buscarProcedimentosFisio(clinicaId),
        buscarProfissionaisFisio(clinicaId),
        supabase
          .from("orcamentos")
          .select("id, numero, valor_total")
          .eq("clinica_id", clinicaId)
          .eq("paciente_id", pacienteId)
          .eq("status", "aberto")
          .order("numero", { ascending: false }),
      ]);
      setProcedimentos(proc);
      setProfissionais(med);
      setOrcamentos((orc as OrcamentoAberto[]) ?? []);
    })();
  }, [open, clinicaId, pacienteId]);

  function escolherProcedimento(id: string) {
    setProcedimentoId(id);
    if (id === SEM) return;
    const p = procedimentos.find((x) => x.id === id);
    if (!p) return;
    if (!descricao.trim()) setDescricao(p.nome);
    const qtd = Number(totalSessoes) || 0;
    if (qtd > 0) setValorTotal(String(Number(p.valor_padrao) * qtd));
  }

  async function salvar() {
    const qtd = Number(totalSessoes);
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 200) {
      toast.error("Informe uma quantidade de sessões entre 1 e 200.");
      return;
    }
    if (!descricao.trim()) {
      toast.error("Descreva o pacote (ex.: Fisioterapia — ombro direito).");
      return;
    }
    if (salvando) return;
    setSalvando(true);

    const { data: pacote, error } = await supabase
      .from("fisio_pacotes")
      .insert({
        clinica_id: clinicaId,
        paciente_id: pacienteId,
        descricao: descricao.trim(),
        procedimento_id: procedimentoId === SEM ? null : procedimentoId,
        orcamento_id: orcamentoId === SEM ? null : orcamentoId,
        total_sessoes: qtd,
        valor_total: Number(valorTotal) || 0,
        data_inicio: dataInicio,
        profissional_id: profissionalId === SEM ? null : profissionalId,
        observacoes: observacoes.trim() || null,
        created_by: userId,
      })
      .select("id")
      .single();

    if (error || !pacote) {
      setSalvando(false);
      mostrarErro(error ?? new Error("Falha ao criar o pacote"));
      return;
    }

    const sessoes = Array.from({ length: qtd }, (_, i) => ({
      clinica_id: clinicaId,
      pacote_id: pacote.id,
      numero: i + 1,
      status: "pendente",
      profissional_id: profissionalId === SEM ? null : profissionalId,
    }));
    const { error: e2 } = await supabase.from("fisio_sessoes").insert(sessoes);
    setSalvando(false);

    if (e2) {
      // O pacote sem sessões seria um registro inútil e confuso na listagem,
      // então desfazemos para o usuário poder simplesmente tentar de novo.
      await supabase.from("fisio_pacotes").delete().eq("id", pacote.id);
      mostrarErro(e2);
      return;
    }

    toast.success(`Pacote de ${qtd} sessões criado`);
    onCreated();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo pacote de sessões</DialogTitle>
          <DialogDescription>Paciente: {pacienteNome}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Procedimento</Label>
            <Select value={procedimentoId} onValueChange={escolherProcedimento}>
              <SelectTrigger>
                <SelectValue placeholder="Não vincular" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Não vincular</SelectItem>
                {procedimentos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Descrição do pacote</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="ex.: Fisioterapia — ombro direito"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Sessões</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={totalSessoes}
                onChange={(e) => setTotalSessoes(e.target.value)}
              />
            </div>
            <div>
              <Label>Valor total (R$)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={valorTotal}
                onChange={(e) => setValorTotal(e.target.value)}
              />
            </div>
            <div>
              <Label>Início</Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Profissional responsável</Label>
            <Select value={profissionalId} onValueChange={setProfissionalId}>
              <SelectTrigger>
                <SelectValue placeholder="Não informado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Não informado</SelectItem>
                {profissionais.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Orçamento vinculado</Label>
            <Select value={orcamentoId} onValueChange={setOrcamentoId}>
              <SelectTrigger>
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Nenhum</SelectItem>
                {orcamentos.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    Orç. {o.numero} · R$ {Number(o.valor_total).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[12px] text-muted-foreground mt-1">
              Só aparecem orçamentos em aberto deste paciente. O pacote não cria cobrança: quem
              cobra continua sendo o financeiro.
            </p>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando ? "Criando…" : "Criar pacote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
