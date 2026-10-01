/**
 * Menu "Opções" (≡) de cada paciente e modal "Baixa de Agendamento"
 * da fila do médico. Sem Consultas Avulsas e sem Controle Hiperbárico
 * (decisão da clínica: ficam para depois).
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LinhaDoTempoProntuario,
  invalidarLinhaDoTempo,
} from "@/components/prontuario/linha-do-tempo-prontuario";
import { EditorProntuario } from "./editor-prontuario";
import {
  AlertasAtivosBanner,
  AlertasPacienteDialog,
  ArquivosPacienteDialog,
  AtestadoDialog,
  AvaliacoesCorporaisDialog,
  DocumentosDialog,
  RetornosDialog,
  TriagemDialog,
  type TriagemLeitura,
} from "./paciente-dialogs";
import {
  finalizarAtendimento,
  gravarProntuarioDoAgendamento,
} from "@/lib/medico/finalizar-atendimento";
import { mostrarErro } from "@/lib/traduzir-erro";

export type MedicoFila = {
  id: string;
  nome: string;
  tipo_repasse?: string | null;
  valor_repasse_padrao?: number | null;
  percentual_repasse_padrao?: number | null;
};

export type ItemFila = {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  inicio: string;
  fim?: string | null;
  procedimento: string | null;
};

type Janela =
  | null
  | "prontuario"
  | "avaliacoes"
  | "atestado-termica"
  | "atestado-a4"
  | "alertas"
  | "anexos"
  | "fotos"
  | "documentos"
  | "retornos"
  | "triagem";

export function OpcoesPacienteMenu({
  item,
  clinicaId,
  medico,
  triagem,
}: {
  item: ItemFila;
  clinicaId: string;
  medico: MedicoFila | null;
  triagem: TriagemLeitura | null | undefined;
}) {
  const navigate = useNavigate();
  const [janela, setJanela] = useState<Janela>(null);
  const base = {
    clinicaId,
    pacienteId: item.paciente_id,
    pacienteNome: item.paciente_nome,
    onOpenChange: (v: boolean) => !v && setJanela(null),
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            aria-label={`Opções de ${item.paciente_nome}`}
          >
            <Menu className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => navigate({ to: "/app/orcamentos" })}>
            Requisição/Orçamento
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setJanela("prontuario")}>Prontuário</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setJanela("avaliacoes")}>
            Avaliações Corporais
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Atestado</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => setJanela("atestado-termica")}>
                Impressões Térmicas: Atestado
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setJanela("atestado-a4")}>
                Impressões Laser: Atestado
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => setJanela("alertas")}>Alertas</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setJanela("anexos")}>Anexos</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setJanela("fotos")}>Fotos</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setJanela("documentos")}>Documentos</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setJanela("retornos")}>Retornos</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setJanela("triagem")}>Triagem</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {janela === "prontuario" && (
        <ProntuarioPacienteDialog {...base} open medicoId={medico?.id ?? null} />
      )}
      {janela === "avaliacoes" && <AvaliacoesCorporaisDialog {...base} open />}
      {(janela === "atestado-termica" || janela === "atestado-a4") && (
        <AtestadoDialog
          {...base}
          open
          medicoId={medico?.id ?? null}
          medicoNome={medico?.nome ?? ""}
          formato={janela === "atestado-termica" ? "termica" : "a4"}
        />
      )}
      {janela === "alertas" && <AlertasPacienteDialog {...base} open />}
      {janela === "anexos" && <ArquivosPacienteDialog {...base} open tipo="anexo" />}
      {janela === "fotos" && <ArquivosPacienteDialog {...base} open tipo="foto" />}
      {janela === "documentos" && <DocumentosDialog {...base} open />}
      {janela === "retornos" && (
        <RetornosDialog {...base} open onAbrirAgenda={() => navigate({ to: "/app/agenda" })} />
      )}
      {janela === "triagem" && (
        <TriagemDialog
          open
          onOpenChange={base.onOpenChange}
          pacienteNome={item.paciente_nome}
          triagem={triagem}
        />
      )}
    </>
  );
}

/** "Prontuário – NOME": linha do tempo + Adicionar Prontuário + tags. */
function ProntuarioPacienteDialog({
  open,
  onOpenChange,
  clinicaId,
  pacienteId,
  pacienteNome,
  medicoId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clinicaId: string;
  pacienteId: string;
  pacienteNome: string;
  medicoId: string | null;
}) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState(false);
  const [tags, setTags] = useState(false);
  const [html, setHtml] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!html.trim()) return toast.error("Escreva o prontuário.");
    setSalvando(true);
    const { data, error } = await supabase
      .from("prontuarios")
      .insert({
        clinica_id: clinicaId,
        paciente_id: pacienteId,
        medico_id: medicoId,
        historia_doenca: html,
        data: new Date().toISOString(),
      } as never)
      .select("id");
    setSalvando(false);
    if (error || !data?.length) return mostrarErro(error ?? new Error("Prontuário não gravado"));
    toast.success("Prontuário adicionado");
    setHtml("");
    setNovo(false);
    void invalidarLinhaDoTempo(qc, pacienteId);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prontuário — {pacienteNome}</DialogTitle>
        </DialogHeader>
        <AlertasAtivosBanner pacienteId={pacienteId} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button size="sm" onClick={() => setNovo((v) => !v)}>
            <Plus className="h-4 w-4" /> Adicionar Prontuário
          </Button>
          <Button
            size="sm"
            variant={tags ? "secondary" : "outline"}
            onClick={() => setTags((v) => !v)}
          >
            Adicionar tags
          </Button>
        </div>
        {novo && (
          <div className="space-y-2">
            <EditorProntuario value={html} onChange={setHtml} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNovo(false)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                Salvar prontuário
              </Button>
            </div>
          </div>
        )}
        <LinhaDoTempoProntuario pacienteId={pacienteId} editarTags={tags} />
      </DialogContent>
    </Dialog>
  );
}

/** Modal "Baixa de Agendamento – NOME". */
export function BaixaAgendamentoDialog({
  open,
  onOpenChange,
  item,
  clinicaId,
  filial,
  medico,
  pago,
  htmlInicial,
  onConcluido,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: ItemFila;
  clinicaId: string;
  filial: string;
  medico: MedicoFila | null;
  pago: boolean;
  htmlInicial: string;
  onConcluido: () => void;
}) {
  const qc = useQueryClient();
  const [html, setHtml] = useState(htmlInicial);
  const [salvando, setSalvando] = useState(false);

  // Convênio: só existe depois que o caixa registra a cobrança.
  const conv = useQuery({
    queryKey: ["baixa-convenio", item.id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("fin_lancamentos")
        .select("convenio_id, cb_convenios(nome)")
        .eq("agendamento_id", item.id)
        .limit(1)
        .maybeSingle();
      const nome = (data as { cb_convenios?: { nome?: string } | null } | null)?.cb_convenios?.nome;
      return nome ?? "PARTICULAR";
    },
  });

  const d = new Date(item.inicio);
  const hora = (x: Date) => x.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const intervalo = item.fim ? `${hora(d)} - ${hora(new Date(item.fim))}` : hora(d);

  async function concluir() {
    if (!pago) return toast.error("Pagamento pendente — finalize no caixa antes de dar baixa.");
    if (!html.trim()) return toast.error("Escreva o prontuário antes de concluir.");
    setSalvando(true);
    try {
      await gravarProntuarioDoAgendamento({
        clinicaId,
        pacienteId: item.paciente_id,
        medicoId: medico?.id ?? null,
        agendamentoId: item.id,
        html,
      });
      void invalidarLinhaDoTempo(qc, item.paciente_id);
      const falhas = await finalizarAtendimento({
        clinicaId,
        pacienteId: item.paciente_id,
        agendamentoId: item.id,
        procedimento: item.procedimento,
        medico,
      });
      if (falhas.length) {
        toast.warning("Prontuário salvo, mas com pendências", {
          description: `Não foi possível concluir: ${falhas.join("; ")}. Avise a recepção.`,
          duration: 15000,
        });
      } else toast.success("Cliente atendido");
      onConcluido();
      onOpenChange(false);
    } catch (e) {
      mostrarErro(e as Error);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Baixa de Agendamento — {item.paciente_nome}</DialogTitle>
        </DialogHeader>
        <AlertasAtivosBanner pacienteId={item.paciente_id} />
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filial</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Intervalo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Profissional</TableHead>
                <TableHead>Convênio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>{filial}</TableCell>
                <TableCell>{d.toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>{intervalo}</TableCell>
                <TableCell className="uppercase">{item.paciente_nome}</TableCell>
                <TableCell className="uppercase">{medico?.nome ?? "—"}</TableCell>
                <TableCell
                  title={
                    pago
                      ? "Atendimento já pago: o convênio não pode ser trocado aqui."
                      : "O convênio é definido no caixa, na cobrança."
                  }
                >
                  {conv.data ?? "…"}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          {pago
            ? "Atendimento já pago: o convênio não pode ser trocado na baixa."
            : "Pagamento pendente: o convênio é escolhido pelo caixa na cobrança."}
        </p>
        <div className="space-y-1">
          <div className="text-sm font-medium">Prontuário</div>
          <EditorProntuario value={html} onChange={setHtml} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={concluir} disabled={salvando || !pago}>
            Cliente atendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
