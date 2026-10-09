import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { FiltrosAtendente } from "../src/components/nina/FiltrosAtendente";
import { BadgeEspera, RelogioEsperaProvider } from "../src/components/nina/BadgeEspera";
import { Card, CardHeader } from "../src/components/ui/card";
import { Button } from "../src/components/ui/button";
import {
  MessageSquare,
  ArrowLeft,
  Send,
  Search,
  UserRound,
  CheckCircle2,
  ArrowRightLeft,
  Clock,
  AlertTriangle,
} from "lucide-react";
const patients = [
  ["Marina Oliveira", "Quero confirmar os documentos para a consulta.", 14],
  ["João Martins", "Obrigada! Pode verificar para mim?", 7],
  ["Beatriz Costa", "Bom dia, vocês atendem cardiologia?", 2],
  ["Carlos Almeida", "Combinado. Muito obrigado!", 0],
] as const;
function Preview() {
  const [filter, setFilter] = useState<any>("ativas"),
    [selected, select] = useState(0),
    [list, setList] = useState(true),
    [dark, setDark] = useState(false),
    [attention, setAttention] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return (
    <div className={dark ? "dark" : ""}>
      <div data-os-zap="true" className="flex h-dvh flex-col bg-background text-foreground">
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-5">
          <div className="flex items-center gap-3">
            <MessageSquare className="text-primary" />
            <b className="text-lg">OS ZAP</b>
            <span className="hidden md:inline text-sm text-muted-foreground">Atendimento</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setDark(!dark)}>
              Tema {dark ? "claro" : "escuro"}
            </Button>
            <Button className="bg-destructive text-white" onClick={() => setAttention(!attention)}>
              <AlertTriangle className="h-4 w-4" />
              Atenção · 3
            </Button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <aside
            id="menu-lateral"
            className="hidden xl:flex w-48 shrink-0 flex-col gap-2 p-4 text-white"
          >
            <p className="my-3 text-xs uppercase tracking-widest opacity-60">Atendimento</p>
            {["Conversas", "Pesquisar conversas", "Respostas rápidas", "Equipe", "Relatórios"].map(
              (x, i) => (
                <div
                  key={x}
                  className={
                    "rounded-xl p-3 text-sm " +
                    (i === 0 ? "bg-white/15 font-semibold" : "opacity-80")
                  }
                >
                  {x}
                </div>
              ),
            )}
            <p className="mt-auto text-xs leading-5 opacity-60">
              Prévia visual local
              <br />
              Todos os dados são fictícios.
            </p>
          </aside>
          <main className="min-w-0 flex-1">
            <div className="oszap-inbox h-full" data-mobile-view={list ? "lista" : "conversa"}>
              <div className="oszap-columns flex h-full">
                <Card className="oszap-queue flex shrink-0 flex-col overflow-hidden">
                  <div className="oszap-queue-content flex min-h-0 flex-1 flex-col">
                    <div className="border-b p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="h-2 w-2 rounded-full bg-emerald-600" />
                        Online{" "}
                        <span className="ml-auto text-xs text-muted-foreground">
                          Ana · Atendente
                        </span>
                      </div>
                    </div>
                    <CardHeader className="p-3">
                      <FiltrosAtendente
                        valor={filter}
                        contagens={{ ativas: 4, pendentes: 3, fechadas: 12 }}
                        onChange={setFilter}
                      />
                    </CardHeader>
                    <div className="min-h-0 flex-1 overflow-auto">
                      {patients.map(([name, preview, wait], i) => (
                        <button
                          key={name}
                          aria-current={selected === i ? "true" : undefined}
                          className="oszap-conversation w-full border-b border-atd-border bg-atd-surface px-3 py-1.5 text-left"
                          onClick={() => {
                            select(i);
                            setList(false);
                          }}
                        >
                          <div className="flex justify-between gap-2">
                            <span className="text-sm font-semibold">{name}</span>
                            {wait > 0 && (
                              <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">
                                1
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs">
                            <span className="rounded border bg-muted px-2 text-muted-foreground">
                              {i === 2 ? "Nina" : "Ana"}
                            </span>
                            {wait > 0 && (
                              <BadgeEspera
                                desde={new Date(Date.now() - wait * 60000).toISOString()}
                              />
                            )}
                          </div>
                          <p className="mt-1 truncate text-xs leading-4 text-muted-foreground">
                            {preview}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">Hoje, 10:42</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </Card>
                <Card className="oszap-chat flex min-w-0 flex-1 flex-col overflow-hidden">
                  <CardHeader className="oszap-chat-heading border-b px-3 py-1.5">
                    <button className="oszap-back items-center gap-2" onClick={() => setList(true)}>
                      <ArrowLeft className="h-4 w-4" />
                      Voltar às conversas
                    </button>
                    <div className="oszap-chat-actions flex flex-wrap items-center justify-between gap-1.5">
                      <div>
                        <h2 className="text-sm font-semibold">{patients[selected][0]}</h2>
                        <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                          Conversa de exemplo · Em atendimento
                          <BadgeEspera
                            desde={new Date(Date.now() - 14 * 60000).toISOString()}
                            prefixo="Aguardando resposta há"
                          />
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="outline" size="sm">
                          <ArrowRightLeft className="h-4 w-4" />
                          Transferir
                        </Button>
                        <Button variant="outline" size="sm">
                          <CheckCircle2 className="h-4 w-4" />
                          Encerrar
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <div className="oszap-timeline min-h-0 flex-1 space-y-4 overflow-auto bg-atd-bg p-4">
                    <p className="text-center text-xs text-muted-foreground">
                      Hoje · Dados ilustrativos
                    </p>
                    <div className="flex">
                      <div className="oszap-bubble max-w-[78%] rounded-2xl border bg-atd-surface text-atd-ink">
                        Bom dia! Quero saber quais documentos preciso levar para a consulta.
                        <div className="oszap-message-meta mt-2 text-atd-ink-soft">
                          10:28 · Paciente
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="oszap-bubble oszap-bubble-out max-w-[78%] rounded-2xl">
                        Bom dia, Marina! Vou conferir a orientação da clínica para ajudar você.
                        <div className="oszap-message-meta mt-2">10:29 · Ana</div>
                      </div>
                    </div>
                    <div className="flex">
                      <div className="oszap-bubble max-w-[78%] rounded-2xl border bg-atd-surface text-atd-ink">
                        Obrigada! Também gostaria de confirmar o endereço.
                        <div className="oszap-message-meta mt-2 text-atd-ink-soft">
                          10:42 · Paciente
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="oszap-composer border-t p-2">
                    <div className="relative flex gap-2">
                      <textarea
                        id="draft"
                        aria-label="Mensagem ao paciente"
                        rows={1}
                        className="w-full rounded-lg border bg-card"
                        placeholder="Mensagem… (digite / para respostas rápidas)"
                      />
                      <Button aria-label="Enviar mensagem">
                        <Send className="h-4 w-4" />
                        <span className="hidden sm:inline">Enviar</span>
                      </Button>
                    </div>
                  </div>
                </Card>
                <Card className="oszap-contact hidden 2xl:flex w-64 shrink-0 flex-col overflow-hidden">
                  <CardHeader className="border-b p-4 font-semibold">Contato</CardHeader>
                  <div className="space-y-5 p-4 text-sm">
                    <UserRound className="h-10 w-10 rounded-xl bg-muted p-2" />
                    <p className="font-semibold">{patients[selected][0]}</p>
                    <p className="text-xs text-muted-foreground">
                      Informações e histórico do contato ficam acessíveis durante a conversa.
                    </p>
                    <hr />
                    <p className="font-semibold">Agendamentos</p>
                    <p className="text-muted-foreground">Nenhum agendamento neste exemplo.</p>
                  </div>
                </Card>
              </div>
            </div>
          </main>
        </div>
        {attention && (
          <div
            role="dialog"
            aria-label="Central de Atenção"
            className="oszap-attention fixed right-4 top-20 z-50 w-[420px] max-w-[calc(100vw-2rem)] border bg-card p-4"
          >
            <div className="flex justify-between">
              <h2 className="font-semibold">Central de Atenção</h2>
              <button onClick={() => setAttention(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">3 conversas precisam de atenção</p>
            {[
              ["Espera crítica", "1"],
              ["Aguardando resposta", "2"],
              ["Não atribuídas global", "0"],
            ].map(([name, n]) => (
              <div
                key={name}
                className="mb-2 flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <Clock className="h-4 w-4 text-destructive" />
                {name}
                <b className="ml-auto">{n}</b>
              </div>
            ))}
            <p className="mt-4 text-xs text-muted-foreground">
              Exemplo visual. Sem conexão com pacientes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <RelogioEsperaProvider>
    <Preview />
  </RelogioEsperaProvider>,
);
