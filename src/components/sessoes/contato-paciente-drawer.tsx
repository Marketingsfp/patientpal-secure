/**
 * Painel de contato da busca ativa.
 *
 * Abre ao clicar no nome do paciente na tela Sessões e Manutenções e responde a
 * única pergunta da recepção naquele instante: como eu falo com esta pessoa,
 * agora, sem sair da lista.
 *
 * Duas escolhas de conteúdo que valem registro:
 *
 *  - o painel é SÓ LEITURA. Corrigir um telefone errado é edição de cadastro e
 *    continua na ficha do paciente, onde a alteração passa pela auditoria;
 *  - a mensagem sugerida do WhatsApp não cita procedimento, especialidade nem
 *    médico. Ela sai para um celular que outra pessoa pode ler, e dado de saúde
 *    não vai para superfície fora do sistema.
 */
import { useEffect, useState } from "react";
import {
  CalendarPlus,
  Copy,
  IdCard,
  Loader2,
  MessageCircle,
  Phone,
  PhoneCall,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { mostrarErro } from "@/lib/traduzir-erro";
import { prontuarioExibicao } from "@/lib/prontuario";
import { carregarContatoPaciente, type ContatoPaciente } from "@/lib/sessoes/carregar-contatos";
import {
  contatosDoPaciente,
  COR_RESULTADO,
  formatarCpf,
  formatarTelefone,
  linkWhatsapp,
  mensagemDeRetorno,
  ROTULO_RESULTADO,
  type ContatoBuscaAtiva,
} from "@/lib/sessoes/busca-ativa-contatos";

export interface PacienteDaLista {
  pacienteId: string;
  pacienteNome: string;
  origem: "pacote" | "ciclo";
  procedimento: string;
  profissional: string;
  ultimaData: string | null;
  diasParado: number | null;
}

interface Props {
  alvo: PacienteDaLista | null;
  clinicaId: string;
  clinicaNome: string;
  contatos: ContatoBuscaAtiva[];
  podeRegistrar: boolean;
  onFechar: () => void;
  onAgendar: (p: PacienteDaLista) => void;
  onRegistrarContato: (p: PacienteDaLista) => void;
}

const fmtData = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : "—";
};

const fmtDataHora = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

function LinhaDado({
  icone: Icone,
  rotulo,
  valor,
  copiavel,
}: {
  icone: typeof Phone;
  rotulo: string;
  valor: string;
  copiavel?: boolean;
}) {
  const vazio = !valor.trim();
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Icone className="h-3.5 w-3.5" />
        {rotulo}
      </span>
      <span className="flex items-center gap-1.5 text-sm font-medium tabular-nums">
        <span className={cn(vazio && "font-normal text-slate-400")}>
          {vazio ? "não cadastrado" : valor}
        </span>
        {copiavel && !vazio && (
          <button
            type="button"
            title="Copiar"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(valor)
                .then(() => toast.success("Copiado."))
                .catch(() => toast.error("O navegador não deixou copiar."));
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </div>
  );
}

export function ContatoPacienteDrawer({
  alvo,
  clinicaId,
  clinicaNome,
  contatos,
  podeRegistrar,
  onFechar,
  onAgendar,
  onRegistrarContato,
}: Props) {
  const [dados, setDados] = useState<ContatoPaciente | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!alvo || !clinicaId) {
      setDados(null);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setDados(null);
    void (async () => {
      try {
        const p = await carregarContatoPaciente(clinicaId, alvo.pacienteId);
        if (!cancelado) setDados(p);
      } catch (e) {
        if (!cancelado) mostrarErro(e, "Não foi possível carregar os dados do paciente.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [alvo?.pacienteId, clinicaId]);

  const historico = alvo ? contatosDoPaciente(contatos, alvo.pacienteId) : [];
  // O celular do cadastro principal é o que a recepção usa; o segundo entra
  // como alternativa quando o primeiro não tem número válido.
  const zap = linkWhatsapp(
    dados?.telefone || dados?.telefone2,
    alvo ? mensagemDeRetorno(alvo.pacienteNome, clinicaNome) : undefined,
  );

  return (
    <Sheet open={!!alvo} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="space-y-1 text-left">
          <SheetTitle className="flex items-start gap-2 text-base">
            <User className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {alvo?.pacienteNome}
          </SheetTitle>
          <SheetDescription>
            {alvo?.procedimento}
            {alvo?.profissional ? ` · ${alvo.profissional}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Por que este paciente está na lista — a mesma informação da linha,
              repetida aqui para quem abre o painel não precisar voltar. */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Último atendimento</span>
              <span className="font-medium tabular-nums">{fmtData(alvo?.ultimaData ?? null)}</span>
            </div>
            {alvo?.diasParado != null && (
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Dias parado</span>
                <span className="font-semibold tabular-nums text-rose-600">
                  {alvo.diasParado.toLocaleString("pt-BR")}
                </span>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Contato
            </h3>
            {carregando ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando…
              </div>
            ) : (
              <div>
                <LinhaDado
                  icone={Phone}
                  rotulo="Telefone"
                  valor={formatarTelefone(dados?.telefone)}
                  copiavel
                />
                <LinhaDado
                  icone={Phone}
                  rotulo="Telefone 2"
                  valor={formatarTelefone(dados?.telefone2)}
                  copiavel
                />
                <LinhaDado icone={IdCard} rotulo="CPF" valor={formatarCpf(dados?.cpf)} copiavel />
                <LinhaDado
                  icone={IdCard}
                  rotulo="Prontuário"
                  valor={prontuarioExibicao(dados) ?? ""}
                />
              </div>
            )}
          </div>

          <div className="grid gap-2">
            {/* WhatsApp em destaque: é por onde o resgate acontece na prática. */}
            <Button
              asChild={!!zap}
              disabled={!zap}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {zap ? (
                <a href={zap} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Chamar no WhatsApp
                </a>
              ) : (
                <span>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Sem telefone cadastrado
                </span>
              )}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => alvo && onAgendar(alvo)}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Agendar próxima
              </Button>
              <Button
                variant="outline"
                disabled={!podeRegistrar}
                title={
                  podeRegistrar ? undefined : "Seu perfil não tem permissão para registrar contato."
                }
                onClick={() => alvo && onRegistrarContato(alvo)}
              >
                <PhoneCall className="mr-2 h-4 w-4" />
                Registrar contato
              </Button>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Histórico de contato
            </h3>
            {historico.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                Nenhum contato registrado ainda para este paciente.
              </p>
            ) : (
              <ul className="space-y-2">
                {historico.map((c) => (
                  <li key={c.id} className="rounded-lg border border-slate-100 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge
                        variant="outline"
                        className={cn("font-medium", COR_RESULTADO[c.resultado])}
                      >
                        {ROTULO_RESULTADO[c.resultado]}
                      </Badge>
                      <span className="text-xs tabular-nums text-slate-500">
                        {fmtDataHora(c.criado_em)}
                      </span>
                    </div>
                    {c.observacao && <p className="mt-1.5 text-sm">{c.observacao}</p>}
                    {c.registrado_por_nome && (
                      <p className="mt-1 text-xs text-slate-400">por {c.registrado_por_nome}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
