import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  bloquearContato,
  desbloquearContato,
  listarContatosBloqueados,
  podeBloquearContato,
} from "@/lib/atendimento/contatos-bloqueados.functions";

/**
 * "Bloquear contato" no topo da conversa (16/10/2026). Só aparece para
 * supervisão e administração; o servidor e o banco conferem de novo.
 */
export function BotaoBloquearContato({
  clinicaId,
  conversaId,
  onBloqueado,
}: {
  clinicaId: string;
  conversaId: string;
  onBloqueado: () => void;
}) {
  const consultarPermissao = useServerFn(podeBloquearContato);
  const bloquear = useServerFn(bloquearContato);
  const { data } = useQuery({
    queryKey: ["pode-bloquear-contato", clinicaId],
    queryFn: () => consultarPermissao({ data: { clinicaId } }),
    staleTime: 5 * 60_000,
  });
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (!data?.pode) return null;

  const confirmar = async () => {
    if (motivo.trim().length < 3) {
      toast.error("Informe o motivo do bloqueio.");
      return;
    }
    setEnviando(true);
    try {
      await bloquear({ data: { clinicaId, conversaId, motivo: motivo.trim() } });
      toast.success("Contato bloqueado. A conversa foi encerrada, sem pesquisa.");
      setAberto(false);
      setMotivo("");
      onBloqueado();
    } catch (e) {
      toast.error((e as Error)?.message || "Não foi possível bloquear o contato.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="border-atd-border text-atd-ink-soft hover:bg-atd-danger-bg hover:text-atd-danger-ink"
        onClick={() => setAberto(true)}
      >
        <Ban className="h-3.5 w-3.5 mr-1" /> Bloquear
      </Button>
      <Dialog open={aberto} onOpenChange={(v) => !enviando && setAberto(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear contato</DialogTitle>
            <DialogDescription>
              As próximas mensagens deste número ficam guardadas, mas a Nina não responde e a
              conversa não entra na fila. Esta conversa é encerrada agora, sem pesquisa de
              satisfação e sem aviso ao paciente. Dá para desbloquear em Configurações do WhatsApp →
              Configuração.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Motivo do bloqueio"
            placeholder="Motivo (obrigatório)"
            value={motivo}
            maxLength={500}
            rows={3}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" disabled={enviando} onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={enviando || motivo.trim().length < 3}
              onClick={() => void confirmar()}
            >
              {enviando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Bloquear contato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Lista de contatos bloqueados com "Desbloquear" (Configurações do WhatsApp →
 * Configuração). Só aparece para supervisão e administração.
 */
export function ListaContatosBloqueados({ clinicaId }: { clinicaId: string }) {
  const consultarPermissao = useServerFn(podeBloquearContato);
  const listar = useServerFn(listarContatosBloqueados);
  const desbloquear = useServerFn(desbloquearContato);
  const queryClient = useQueryClient();
  const permissao = useQuery({
    queryKey: ["pode-bloquear-contato", clinicaId],
    queryFn: () => consultarPermissao({ data: { clinicaId } }),
    staleTime: 5 * 60_000,
  });
  const lista = useQuery({
    queryKey: ["contatos-bloqueados", clinicaId],
    queryFn: () => listar({ data: { clinicaId } }),
    enabled: permissao.data?.pode === true,
  });
  const [desbloqueando, setDesbloqueando] = useState<string | null>(null);
  if (!permissao.data?.pode) return null;

  const tirarBloqueio = async (id: string) => {
    setDesbloqueando(id);
    try {
      await desbloquear({ data: { clinicaId, id } });
      toast.success("Contato desbloqueado. As próximas mensagens voltam ao atendimento normal.");
      await queryClient.invalidateQueries({ queryKey: ["contatos-bloqueados", clinicaId] });
    } catch (e) {
      toast.error((e as Error)?.message || "Não foi possível desbloquear.");
    } finally {
      setDesbloqueando(null);
    }
  };

  const linhas = lista.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contatos bloqueados</CardTitle>
        <CardDescription>
          As mensagens destes números ficam guardadas, mas a Nina não responde e a conversa não
          entra na fila. Bloqueie pela conversa, no botão “Bloquear”.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {lista.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : lista.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar a lista.</p>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum contato bloqueado.</p>
        ) : (
          <ul className="divide-y">
            {linhas.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0 text-sm">
                  <div className="font-medium">+{c.telefone}</div>
                  <div className="text-muted-foreground break-words">{c.motivo}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(c.bloqueadoEm).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}{" "}
                    · {c.bloqueadoPor}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={desbloqueando === c.id}
                  onClick={() => void tirarBloqueio(c.id)}
                >
                  {desbloqueando === c.id && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Desbloquear
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
