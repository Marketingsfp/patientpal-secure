import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import { listaDePapeis, type EscopoAutorizacao } from "@/lib/autorizacao-supervisor";
import {
  autorizarComSenha,
  listarAutorizadores,
  type Autorizador,
} from "@/lib/autorizacao-supervisor.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clinicaId: string | null | undefined;
  /** Qual alçada é exigida: cada ação tem a sua. */
  escopo: EscopoAutorizacao;
  /** Qual ação está sendo autorizada, para o texto do cabeçalho. */
  acao?: string;
  onAuthorized: (info: { userId: string; nome: string; role: string }) => void;
}

/**
 * Autorização da supervisão sem digitar e-mail.
 *
 * A funcionária escolhe o nome numa lista com busca e digita só a senha. A
 * conferência acontece no servidor (`autorizacao-supervisor.functions.ts`),
 * então a sessão de quem opera a tela não é trocada no meio do atendimento e o
 * e-mail da pessoa que autoriza nunca vem para o navegador.
 *
 * Substituiu o `supervisor-auth-dialog` (e-mail + senha) em todas as telas: no
 * balcão, digitar um e-mail corporativo completo a cada desconto ou isenção
 * segurava a fila.
 *
 * A lista é carregada toda vez que o diálogo abre, e não uma vez só: uma
 * mudança de equipe no meio do expediente (alguém promovido, ou desligado)
 * precisa valer na autorização seguinte.
 */
export function SupervisorSenhaDialog({
  open,
  onOpenChange,
  clinicaId,
  escopo,
  acao = "esta ação",
  onAuthorized,
}: Props) {
  const listarFn = useServerFn(listarAutorizadores);
  const autorizarFn = useServerFn(autorizarComSenha);
  const [lista, setLista] = useState<Autorizador[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [supervisorId, setSupervisorId] = useState("");
  const [senha, setSenha] = useState("");
  const [validando, setValidando] = useState(false);

  useEffect(() => {
    if (!open) {
      setSenha("");
      setSupervisorId("");
      setValidando(false);
      return;
    }
    if (!clinicaId) return;
    let cancelado = false;
    setCarregando(true);
    listarFn({ data: { clinicaId, escopo } })
      .then((r) => {
        if (cancelado) return;
        setLista(r);
        // Uma única pessoa com alçada: já vem escolhida, e a funcionária só
        // digita a senha. É o caso comum fora do horário administrativo.
        if (r.length === 1) setSupervisorId(r[0].id);
      })
      .catch(() => {
        if (!cancelado) toast.error("Não foi possível carregar a lista de quem pode autorizar.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [open, clinicaId, escopo, listarFn]);

  async function validar() {
    if (!clinicaId) return toast.error("Sem clínica selecionada.");
    if (!supervisorId) return toast.error("Escolha quem está autorizando.");
    if (!senha) return toast.error("Digite a senha.");
    setValidando(true);
    let res: Awaited<ReturnType<typeof autorizarFn>>;
    try {
      res = await autorizarFn({ data: { clinicaId, escopo, supervisorId, senha } });
    } catch (_) {
      setValidando(false);
      return toast.error("Não foi possível conferir a senha. Tente de novo.");
    }
    setValidando(false);
    if (!res.ok) {
      // Senha errada limpa o campo; erro de permissão mantém o que foi
      // digitado, porque trocar só o nome escolhido é mais rápido.
      if (res.message === "Senha incorreta.") setSenha("");
      return toast.error(res.message);
    }
    toast.success(`Autorizado por ${res.nome}`);
    setSenha("");
    onAuthorized({ userId: res.supervisorId, nome: res.nome, role: res.role });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Autorização da supervisão
          </DialogTitle>
          <DialogDescription>
            Para {acao}, escolha quem está autorizando e peça a senha dessa pessoa.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Autorizado por</Label>
            <SearchableSelect
              options={lista.map((a) => ({ value: a.id, label: a.nome }))}
              value={supervisorId}
              onChange={(v) => setSupervisorId(v)}
              placeholder={carregando ? "Carregando…" : "Escolha quem autoriza"}
              searchPlaceholder="Buscar pelo nome…"
              emptyText="Nenhum nome encontrado."
              disabled={carregando || validando}
            />
            {!carregando && lista.length === 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Nenhum {listaDePapeis(escopo)} com nome cadastrado nesta clínica.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="sup-senha">Senha</Label>
            <Input
              id="sup-senha"
              type="password"
              autoComplete="off"
              autoFocus
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void validar();
              }}
              disabled={validando}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={validando}>
            Cancelar
          </Button>
          <Button onClick={() => void validar()} disabled={validando || carregando}>
            {validando ? "Conferindo…" : "Autorizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
