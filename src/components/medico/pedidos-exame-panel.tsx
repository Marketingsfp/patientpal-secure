import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Download, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BotaoLiberarPaciente } from "@/components/portal-paciente/botao-liberar-paciente";
import {
  emitirPedidoExame,
  listarPedidosExame,
  cancelarPedidoExame,
  baixarPedidoEquipe,
  type ItemPedido,
} from "@/lib/portal-paciente/pedidos-exame.functions";

export function PedidosExamePanel({
  clinicaId,
  pacienteId,
  medicoId,
  agendamentoId,
}: {
  clinicaId: string;
  pacienteId: string;
  medicoId?: string | null;
  agendamentoId?: string | null;
}) {
  const qc = useQueryClient();
  const listar = useServerFn(listarPedidosExame);
  const emitir = useServerFn(emitirPedidoExame);
  const cancelar = useServerFn(cancelarPedidoExame);
  const baixar = useServerFn(baixarPedidoEquipe);
  const chave = ["pedidos-exame", clinicaId, pacienteId];
  const q = useQuery({
    queryKey: chave,
    queryFn: () => listar({ data: { clinicaId, pacienteId } }),
  });
  const catalogo = useQuery({
    queryKey: ["pedido-exame-catalogo", clinicaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procedimentos")
        .select("id,nome,codigo")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .order("nome")
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const medicos = useQuery({
    queryKey: ["pedido-exame-medicos", clinicaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicos")
        .select("id,nome")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [profissional, setProfissional] = useState(medicoId ?? "equipe");
  const [novo, setNovo] = useState(false);
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [livre, setLivre] = useState("");
  const [busca, setBusca] = useState("");
  const [indicacao, setIndicacao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  async function acao(fn: () => Promise<unknown>) {
    setOcupado(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: chave });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Pedidos de exame</h2>
        <Button variant="outline" onClick={() => setNovo(!novo)}>
          <Plus className="h-4 w-4" />
          Emitir pedido
        </Button>
      </div>
      {novo && (
        <div className="space-y-3 border-y py-4">
          <Label>Profissional</Label>
          <Select value={profissional} onValueChange={setProfissional}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="equipe">Equipe da clínica</SelectItem>
              {medicos.data?.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="exame-busca">Exame do catálogo</Label>
          <Input id="exame-busca" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {busca && (
            <div className="max-h-40 overflow-auto border rounded-md">
              {catalogo.data
                ?.filter((p) =>
                  `${p.nome} ${p.codigo ?? ""}`.toLowerCase().includes(busca.toLowerCase()),
                )
                .slice(0, 30)
                .map((p) => (
                  <Button
                    className="w-full justify-start h-auto whitespace-normal"
                    variant="ghost"
                    key={p.id}
                    onClick={() => {
                      setItens([
                        ...itens,
                        { procedimento_id: p.id, codigo: p.codigo ?? undefined, nome: p.nome },
                      ]);
                      setBusca("");
                    }}
                  >
                    {p.codigo} {p.nome}
                  </Button>
                ))}
            </div>
          )}
          <Label htmlFor="exame-livre">Exame em texto livre</Label>
          <div className="flex gap-2">
            <Input
              id="exame-livre"
              value={livre}
              maxLength={500}
              onChange={(e) => setLivre(e.target.value)}
            />
            <Button
              variant="outline"
              aria-label="Adicionar exame livre"
              disabled={!livre.trim()}
              onClick={() => {
                setItens([...itens, { nome: livre.trim() }]);
                setLivre("");
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ul className="space-y-2">
            {itens.map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="flex-1">
                  {item.codigo} {item.nome}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover exame"
                  onClick={() => setItens(itens.filter((_, index) => index !== i))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Label htmlFor="pedido-indicacao">Indicação clínica</Label>
          <Textarea
            id="pedido-indicacao"
            value={indicacao}
            onChange={(e) => setIndicacao(e.target.value)}
          />
          <Label htmlFor="pedido-observacao">Observação</Label>
          <Textarea
            id="pedido-observacao"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
          <Button
            disabled={ocupado || !itens.length}
            onClick={() =>
              void acao(async () => {
                await emitir({
                  data: {
                    clinicaId,
                    pacienteId,
                    medicoId: profissional === "equipe" ? null : profissional,
                    agendamentoId,
                    itens,
                    indicacao,
                    observacao,
                  },
                });
                setNovo(false);
                setItens([]);
                setIndicacao("");
                setObservacao("");
                toast.success("Pedido emitido com PDF.");
              })
            }
          >
            Emitir e salvar PDF
          </Button>
        </div>
      )}
      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {q.error && (
        <p role="alert" className="text-sm text-destructive">
          {q.error.message}
        </p>
      )}
      {q.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum pedido emitido.</p>
      )}
      {q.data?.map((p) => (
        <article key={p.id} className="border rounded-md p-3 space-y-2">
          <p className="text-sm font-medium">
            {p.data.split("-").reverse().join("/")} ·{" "}
            {p.status === "cancelado" ? "Cancelado" : "Emitido"}
          </p>
          <ul className="list-disc pl-5 text-sm">
            {(p.itens as ItemPedido[]).map((item, i) => (
              <li key={i}>
                {item.codigo} {item.nome}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={() =>
                void acao(async () => {
                  const r = await baixar({ data: { id: p.id } });
                  const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
                  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "Pedido de exame.pdf";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 60000);
                })
              }
            >
              <Download className="h-4 w-4" />
              PDF
            </Button>
            {p.status === "emitido" && (
              <>
                <BotaoLiberarPaciente
                  origem="pedido_exame"
                  id={p.id}
                  liberadoEm={p.liberado_paciente_em}
                  liberadoPor={p.liberado_paciente_por}
                  onMudou={() => void qc.invalidateQueries({ queryKey: chave })}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  onClick={() => setCancelarId(p.id)}
                >
                  Cancelar pedido
                </Button>
              </>
            )}
          </div>
          {cancelarId === p.id && (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
              <span>Confirmar cancelamento deste pedido?</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={ocupado}
                onClick={() =>
                  void acao(async () => {
                    await cancelar({ data: { id: p.id } });
                    setCancelarId(null);
                  })
                }
              >
                Confirmar cancelamento
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCancelarId(null)}>
                Manter pedido
              </Button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
