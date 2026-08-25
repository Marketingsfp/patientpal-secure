import { useCallback, useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { mostrarErro } from "@/lib/traduzir-erro";
import { toast } from "sonner";

/**
 * Isenção de carência em lote para os contratos migrados do sistema antigo.
 *
 * O problema que ela resolve: na migração, as mensalidades que o paciente já
 * pagava na tabela antiga não vieram como parcelas numeradas do contrato. O
 * sistema passou a contar pouquíssimas mensalidades pagas e barrou por
 * carência os benefícios a que essas pessoas já tinham direito — a gratuidade
 * anual de Mamografia, por exemplo, exige 6 mensalidades pagas.
 *
 * Por que uma tela e não um script no banco: existe uma trava no próprio
 * Postgres (`enforce_sem_carencia_permission`) que recusa qualquer isenção sem
 * usuário autenticado, para que toda isenção registre QUEM autorizou. Rodar
 * isso por fora exigiria desligar a trava e deixaria centenas de isenções sem
 * responsável. Aqui a operação roda logada, e cada contrato guarda o autor.
 *
 * Quem entra no lote (todos os critérios ao mesmo tempo):
 *   - contrato ATIVO e marcado como vindo da tabela antiga (`tabela_legada`);
 *   - ainda SEM isenção de carência;
 *   - não é renovação nem troca de plano — esses já pulam carência sozinhos;
 *   - tem convênio ligado (sem convênio, a isenção não teria efeito nenhum);
 *   - tem prova de pagamento real no sistema antigo: a migração gravou na
 *     observação "ULTIMO PAGAMENTO REAL DO TITULAR: dd/mm/aaaa - R$ x,xx".
 *
 * A prova de pagamento é o critério que separa cliente antigo de cadastro sem
 * histórico. Ficam de fora, de propósito, os vínculos titular-dependente que a
 * migração criou por semelhança de endereço e telefone e marcou como
 * "confirmar identidade" — esses não têm convênio próprio e nada ganhariam.
 */

const MARCA_PAGAMENTO_REAL = "ULTIMO PAGAMENTO REAL DO TITULAR:";

const MOTIVO_PADRAO =
  "Contrato migrado do sistema antigo: as mensalidades ja pagas na tabela anterior nao " +
  "vieram como parcelas numeradas, entao a carencia ficou presa em um numero menor do que " +
  "o paciente realmente cumpriu. Isencao aplicada em lote para restaurar o direito aos " +
  "beneficios do plano (correcao de migracao).";

/** Tamanho de cada rodada do UPDATE. Mantém a requisição pequena e permite mostrar progresso. */
const TAMANHO_LOTE = 100;

interface ContratoElegivel {
  id: string;
  numero: number | null;
  paciente_nome: string | null;
  convenioNome: string;
  ultimoPagamento: string | null;
}

interface LinhaBanco {
  id: string;
  numero: number | null;
  paciente_nome: string | null;
  convenio_id: string | null;
  sem_carencia: boolean | null;
  numero_renovacoes: number | null;
  contrato_origem_id: string | null;
  observacoes: string | null;
  cb_convenios?: { nome: string | null } | Array<{ nome: string | null }> | null;
}

function nomeConvenio(l: LinhaBanco): string | null {
  const c = l.cb_convenios;
  if (!c) return null;
  if (Array.isArray(c)) return c[0]?.nome ?? null;
  return c.nome ?? null;
}

/** "…TITULAR: 22/05/2026 - R$ 180,00" → "22/05/2026". */
function extrairUltimoPagamento(obs: string | null): string | null {
  if (!obs) return null;
  const m = obs.match(/ULTIMO PAGAMENTO REAL DO TITULAR:\s*(\d{2}\/\d{2}\/\d{4})/);
  return m ? m[1] : null;
}

export function IsencaoCarenciaLoteDialog({
  open,
  onOpenChange,
  onAplicado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Chamado depois de aplicar, para a lista de contratos recarregar. */
  onAplicado?: () => void;
}) {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const [carregando, setCarregando] = useState(false);
  const [elegiveis, setElegiveis] = useState<ContratoElegivel[]>([]);
  const [motivo, setMotivo] = useState(MOTIVO_PADRAO);
  const [aplicando, setAplicando] = useState(false);
  const [progresso, setProgresso] = useState(0);

  const carregar = useCallback(async () => {
    if (!clinicaAtual) return;
    setCarregando(true);
    // Os contratos legados da clínica cabem folgadamente numa consulta só
    // (menos de mil). Trazer tudo e filtrar aqui evita depender de combinações
    // de filtros do PostgREST que são fáceis de escrever errado — e um filtro
    // errado aqui significaria isentar contrato que não devia.
    const { data, error } = await supabase
      .from("contratos_assinatura")
      .select(
        "id, numero, paciente_nome, convenio_id, sem_carencia, numero_renovacoes, contrato_origem_id, observacoes, cb_convenios:convenio_id(nome)",
      )
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("status", "ativo")
      .eq("tabela_legada", true)
      .order("numero", { ascending: true });
    setCarregando(false);
    if (error) {
      mostrarErro(error, "falha ao listar os contratos migrados");
      return;
    }
    const linhas = (data ?? []) as unknown as LinhaBanco[];
    const out: ContratoElegivel[] = [];
    for (const l of linhas) {
      if (l.sem_carencia === true) continue;
      if (!l.convenio_id) continue;
      if (l.contrato_origem_id) continue;
      if ((l.numero_renovacoes ?? 0) > 0) continue;
      if (!l.observacoes?.includes(MARCA_PAGAMENTO_REAL)) continue;
      out.push({
        id: l.id,
        numero: l.numero,
        paciente_nome: l.paciente_nome,
        convenioNome: nomeConvenio(l) ?? "—",
        ultimoPagamento: extrairUltimoPagamento(l.observacoes),
      });
    }
    setElegiveis(out);
  }, [clinicaAtual]);

  useEffect(() => {
    if (!open) return;
    setMotivo(MOTIVO_PADRAO);
    setProgresso(0);
    void carregar();
  }, [open, carregar]);

  const porConvenio = elegiveis.reduce<Record<string, number>>((acc, c) => {
    acc[c.convenioNome] = (acc[c.convenioNome] ?? 0) + 1;
    return acc;
  }, {});

  const aplicar = async () => {
    if (!motivo.trim()) {
      toast.error("Escreva o motivo da isenção — ele fica registrado em cada contrato.");
      return;
    }
    if (elegiveis.length === 0) return;
    setAplicando(true);
    setProgresso(0);
    let feitos = 0;
    const agora = new Date().toISOString();
    for (let i = 0; i < elegiveis.length; i += TAMANHO_LOTE) {
      const ids = elegiveis.slice(i, i + TAMANHO_LOTE).map((c) => c.id);
      const { error } = await supabase
        .from("contratos_assinatura")
        .update({
          sem_carencia: true,
          sem_carencia_motivo: motivo.trim(),
          sem_carencia_por: user?.id ?? null,
          sem_carencia_em: agora,
        } as never)
        .in("id", ids);
      if (error) {
        setAplicando(false);
        // Parada honesta: diz quantos já foram gravados antes de falhar, para
        // ninguém supor que nada aconteceu e rodar tudo de novo às cegas.
        mostrarErro(
          error,
          `falha após isentar ${feitos} de ${elegiveis.length} contratos — os já gravados continuam válidos, reabra para continuar de onde parou`,
        );
        void carregar();
        onAplicado?.();
        return;
      }
      feitos += ids.length;
      setProgresso(feitos);
    }
    setAplicando(false);
    toast.success(
      `Isenção de carência aplicada em ${feitos} contrato${feitos === 1 ? "" : "s"} migrado${feitos === 1 ? "" : "s"}.`,
    );
    onAplicado?.();
    onOpenChange(false);
  };

  const ocupado = carregando || aplicando;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && aplicando) return;
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Isenção de carência — contratos migrados
          </DialogTitle>
          <DialogDescription>
            Devolve o direito aos benefícios do plano a quem já era cliente do sistema antigo e
            perdeu a contagem de mensalidades na migração. Seu nome fica registrado como responsável
            em cada contrato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto pr-1 flex-1 min-h-0">
          {carregando ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Levantando os contratos migrados…
            </div>
          ) : elegiveis.length === 0 ? (
            <div className="rounded-md border bg-muted/40 p-4 text-sm">
              Nenhum contrato migrado pendente de isenção. Ou já foram todos tratados, ou os que
              restam não têm convênio ligado nem pagamento comprovado no sistema antigo — nesses a
              isenção não teria efeito.
            </div>
          ) : (
            <>
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="font-medium">
                  {elegiveis.length} contrato{elegiveis.length === 1 ? "" : "s"} será
                  {elegiveis.length === 1 ? "" : "ão"} isento{elegiveis.length === 1 ? "" : "s"} de
                  carência
                </div>
                <ul className="mt-1 text-muted-foreground">
                  {Object.entries(porConvenio).map(([nome, qtd]) => (
                    <li key={nome}>
                      {nome}: <strong className="text-foreground">{qtd}</strong>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Só entram contratos ativos vindos da tabela antiga, com convênio ligado e com
                  pagamento real comprovado no sistema anterior. Renovações e trocas de plano ficam
                  de fora porque já não têm carência.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Motivo *</Label>
                <Textarea
                  rows={4}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={aplicando}
                />
                <p className="text-xs text-muted-foreground">
                  Gravado em cada contrato, junto com seu nome e a data.
                </p>
              </div>

              <div className="rounded-md border">
                <div className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium">
                  Contratos que serão isentos
                </div>
                <div className="max-h-56 overflow-y-auto divide-y">
                  {elegiveis.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
                    >
                      <span className="truncate">
                        <span className="text-muted-foreground tabular-nums">
                          {c.numero ?? "—"}
                        </span>{" "}
                        {c.paciente_nome ?? "—"}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {c.convenioNome}
                        {c.ultimoPagamento ? ` · últ. pgto ${c.ultimoPagamento}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {aplicando && (
                <div className="text-sm text-muted-foreground">
                  Aplicando… {progresso} de {elegiveis.length}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={aplicando}>
            Cancelar
          </Button>
          <Button onClick={() => void aplicar()} disabled={ocupado || elegiveis.length === 0}>
            {aplicando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Aplicando…
              </>
            ) : (
              `Aplicar em ${elegiveis.length} contrato${elegiveis.length === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
