import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { useClinica } from "@/hooks/use-clinica";
import { SupervisorSenhaDialog } from "@/components/supervisor-senha-dialog";

interface Mensalidade {
  id: string;
  numero_parcela: number;
  vencimento: string;
  valor: number;
  status: string;
  contrato_numero: number;
  plano_nome: string;
  dias_atraso: number;
}
interface Lancamento {
  id: string;
  descricao: string;
  vencimento: string | null;
  valor: number;
  dias_atraso: number;
}
interface Pendencias {
  mensalidades: Mensalidade[];
  lancamentos: Lancamento[];
  total_aberto: number;
  total_atrasado: number;
  qtd_atrasadas: number;
}

interface Props {
  pacienteId: string | null;
  pacienteNome?: string;
  open: boolean;
  onClose: () => void;
  onLiberar: () => void;
}

export function PendenciasAlert({ pacienteId, pacienteNome, open, onClose, onLiberar }: Props) {
  const { clinicaAtual } = useClinica();
  const [data, setData] = useState<Pendencias | null>(null);
  const [loading, setLoading] = useState(false);
  const [autorizacaoAberta, setAutorizacaoAberta] = useState(false);

  useEffect(() => {
    if (!open || !pacienteId) return;
    setLoading(true);
    supabase
      .rpc("pendencias_paciente" as any, { _paciente_id: pacienteId })
      .then(({ data, error }) => {
        if (error) mostrarErro(error);
        else setData(data as Pendencias);
        setLoading(false);
      });
  }, [open, pacienteId]);

  const fmt = (v: number) =>
    Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDt = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  /**
   * Liberação do atendimento apesar do débito.
   *
   * A versão anterior pedia "a senha do gestor" mas conferia a senha do
   * usuário JÁ LOGADO: na prática, a recepcionista digitava a própria senha e
   * liberava sozinha o que a tela dizia depender de um gestor. Agora usa o
   * mesmo diálogo das outras autorizações do sistema — escolhe-se quem está
   * autorizando e digita-se a senha dessa pessoa, conferida no servidor.
   */
  function liberarComAutorizacao(info: { nome: string }) {
    toast.success(`Atendimento liberado por ${info.nome}`);
    onLiberar();
    onClose();
  }

  const bloquear = (data?.qtd_atrasadas ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${bloquear ? "text-destructive" : ""}`}>
            <AlertTriangle className="h-5 w-5" />{" "}
            {bloquear ? "Atendimento bloqueado — débito em atraso" : "Pendências financeiras"}
          </DialogTitle>
          <DialogDescription>{pacienteNome}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !data ? null : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Em aberto</p>
                <p className="font-bold">{fmt(data.total_aberto)}</p>
              </div>
              <div className="rounded-md border p-2 border-destructive/40 bg-destructive/5">
                <p className="text-xs text-muted-foreground">Atrasado</p>
                <p className="font-bold text-destructive">{fmt(data.total_atrasado)}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Parcelas vencidas</p>
                <p className="font-bold">{data.qtd_atrasadas}</p>
              </div>
            </div>

            {data.mensalidades.length > 0 && (
              <div>
                <p className="font-semibold text-xs uppercase text-muted-foreground mb-1">
                  Mensalidades
                </p>
                <ul className="space-y-1 max-h-40 overflow-y-auto text-xs">
                  {data.mensalidades.map((m) => (
                    <li
                      key={m.id}
                      className={`flex justify-between border-b border-border/40 py-1 ${m.dias_atraso > 0 ? "text-destructive" : ""}`}
                    >
                      <span>
                        #{m.numero_parcela} · {m.plano_nome} · venc. {fmtDt(m.vencimento)}
                      </span>
                      <span>
                        {fmt(m.valor)} {m.dias_atraso > 0 && <strong>· {m.dias_atraso}d</strong>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.lancamentos.length > 0 && (
              <div>
                <p className="font-semibold text-xs uppercase text-muted-foreground mb-1">
                  Outros débitos
                </p>
                <ul className="space-y-1 max-h-32 overflow-y-auto text-xs">
                  {data.lancamentos.map((l) => (
                    <li
                      key={l.id}
                      className={`flex justify-between border-b border-border/40 py-1 ${l.dias_atraso > 0 ? "text-destructive" : ""}`}
                    >
                      <span>
                        {l.descricao} · venc. {fmtDt(l.vencimento)}
                      </span>
                      <span>
                        {fmt(l.valor)} {l.dias_atraso > 0 && <strong>· {l.dias_atraso}d</strong>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {bloquear && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Liberação do gestor
                </p>
                <p className="text-xs text-muted-foreground">
                  Para atender mesmo com débito em atraso, é preciso a autorização de um
                  administrador, gestor ou do financeiro.
                </p>
                <Button onClick={() => setAutorizacaoAberta(true)} variant="destructive" size="sm">
                  Pedir liberação
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4 mr-1" /> Fechar
          </Button>
          {!bloquear && data && (
            <Button
              onClick={() => {
                onLiberar();
                onClose();
              }}
            >
              Continuar atendimento
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <SupervisorSenhaDialog
        open={autorizacaoAberta}
        onOpenChange={setAutorizacaoAberta}
        clinicaId={clinicaAtual?.clinica_id}
        escopo="liberar_debito"
        acao="atender este paciente mesmo com débito em atraso"
        onAuthorized={liberarComAutorizacao}
      />
    </Dialog>
  );
}
