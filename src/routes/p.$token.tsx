import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Activity, Video, ClipboardList, CheckCircle2, Calendar } from "lucide-react";

export const Route = createFileRoute("/p/$token")({
  component: PacientePublicoPage,
  head: () => ({
    meta: [
      { title: "Minha consulta — ClinicaOS" },
      {
        name: "description",
        content: "Acesse sua consulta, preencha a anamnese e entre na sala de telemedicina.",
      },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

interface Modelo {
  id: string;
  nome: string;
  perguntas: { texto: string }[];
}
interface Enviada {
  id: string;
  modelo_id: string;
}
interface Agendamento {
  id: string;
  inicio: string;
  fim: string;
  paciente_nome: string;
  procedimento: string | null;
  status: string;
  teleconsulta: boolean;
  link_teleconsulta: string | null;
  token_publico: string;
  medico_nome: string | null;
  medico_especialidade: string | null;
  clinica_nome: string | null;
}

function PacientePublicoPage() {
  const { token } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [ag, setAg] = useState<Agendamento | null>(null);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [enviadas, setEnviadas] = useState<Enviada[]>([]);
  const [aba, setAba] = useState<"info" | "anamnese" | "video">("info");
  const [respostas, setRespostas] = useState<Record<string, Record<number, string>>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase.rpc("consulta_publica", { _token: token });
    if (error) {
      mostrarErro(error);
      setLoading(false);
      return;
    }
    const d = data as any;
    setAg(d.agendamento);
    setModelos(d.anamneses_modelos ?? []);
    setEnviadas(d.anamneses_enviadas ?? []);
    setLoading(false);
  }
  useEffect(() => {
    void carregar();
  }, [token]);

  async function enviar(m: Modelo) {
    const r = respostas[m.id] ?? {};
    const payload: Record<string, string> = {};
    m.perguntas.forEach((p, i) => {
      payload[p.texto] = r[i] ?? "";
    });
    setSalvando(m.id);
    const { error } = await supabase.rpc("salvar_anamnese_publica", {
      _token: token,
      _modelo_id: m.id,
      _respostas: payload,
    });
    setSalvando(null);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Anamnese enviada!");
    void carregar();
  }

  const salaJitsi = ag ? `https://meet.jit.si/ClinicaOS-${ag.token_publico}` : "";
  const linkVideo = ag?.link_teleconsulta || salaJitsi;

  if (loading)
    return <div className="min-h-screen flex items-center justify-center">Carregando…</div>;
  if (!ag)
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        Consulta não encontrada.
      </div>
    );

  const dt = new Date(ag.inicio);
  const dataFmt = dt.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const horaFmt = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" />
          </div>
          <span className="font-bold text-primary">ClinicaOS</span>
          {ag.clinica_nome && (
            <span className="ml-auto text-xs text-muted-foreground truncate">
              {ag.clinica_nome}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4 pb-24">
        <Card className="p-4">
          <h1 className="text-xl font-bold">Minha consulta</h1>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{dataFmt}</p>
          <p className="text-2xl font-bold text-primary mt-1">{horaFmt}</p>
          {ag.medico_nome && (
            <p className="mt-3 text-sm">
              <span className="font-medium">Dr(a). {ag.medico_nome}</span>
              {ag.medico_especialidade && (
                <span className="text-muted-foreground"> • {ag.medico_especialidade}</span>
              )}
            </p>
          )}
          {ag.procedimento && (
            <p className="text-sm text-muted-foreground mt-1">{ag.procedimento}</p>
          )}
          <p className="mt-2 text-sm">
            Paciente: <span className="font-medium">{ag.paciente_nome}</span>
          </p>
        </Card>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button
            variant={aba === "info" ? "default" : "outline"}
            onClick={() => setAba("info")}
            className="flex-col h-auto py-3"
          >
            <Calendar className="h-4 w-4" />
            <span className="text-xs mt-1">Dados</span>
          </Button>
          <Button
            variant={aba === "anamnese" ? "default" : "outline"}
            onClick={() => setAba("anamnese")}
            className="flex-col h-auto py-3"
          >
            <ClipboardList className="h-4 w-4" />
            <span className="text-xs mt-1">Anamnese</span>
          </Button>
          <Button
            variant={aba === "video" ? "default" : "outline"}
            onClick={() => setAba("video")}
            className="flex-col h-auto py-3"
          >
            <Video className="h-4 w-4" />
            <span className="text-xs mt-1">Telemedicina</span>
          </Button>
        </div>

        {aba === "info" && (
          <Card className="mt-4 p-4 text-sm space-y-2">
            <p>
              <strong>Como funciona:</strong>
            </p>
            <p>
              1. Preencha a <strong>anamnese</strong> antes da consulta.
            </p>
            <p>
              2. No horário marcado, toque em <strong>Telemedicina</strong> para entrar na sala de
              vídeo.
            </p>
            <p className="text-muted-foreground text-xs pt-2">
              Status: <span className="capitalize">{ag.status}</span>
            </p>
          </Card>
        )}

        {aba === "anamnese" && (
          <div className="mt-4 space-y-4">
            {modelos.length === 0 && (
              <Card className="p-4 text-sm text-muted-foreground">
                Nenhum questionário disponível.
              </Card>
            )}
            {modelos.map((m) => {
              const jaEnviou = enviadas.some((e) => e.modelo_id === m.id);
              return (
                <Card key={m.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold">{m.nome}</h2>
                    {jaEnviou && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Enviada
                      </span>
                    )}
                  </div>
                  {!jaEnviou && (
                    <>
                      <div className="mt-3 space-y-3">
                        {m.perguntas.map((p, i) => (
                          <div key={i}>
                            <label className="text-sm font-medium block mb-1">{p.texto}</label>
                            <Textarea
                              rows={2}
                              value={respostas[m.id]?.[i] ?? ""}
                              onChange={(e) =>
                                setRespostas((prev) => ({
                                  ...prev,
                                  [m.id]: { ...(prev[m.id] ?? {}), [i]: e.target.value },
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                      <Button
                        className="mt-4 w-full"
                        disabled={salvando === m.id}
                        onClick={() => enviar(m)}
                      >
                        {salvando === m.id ? "Enviando…" : "Enviar respostas"}
                      </Button>
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {aba === "video" && (
          <Card className="mt-4 p-0 overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <Video className="h-4 w-4" /> Sala de telemedicina
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Permita o acesso à câmera e ao microfone do celular.
              </p>
            </div>
            <iframe
              src={`${linkVideo}#config.prejoinPageEnabled=true&userInfo.displayName="${encodeURIComponent(ag.paciente_nome)}"`}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              className="w-full h-[70vh] border-0"
              title="Telemedicina"
            />
            <div className="p-3 border-t">
              <a
                href={linkVideo}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary underline"
              >
                Abrir em nova aba
              </a>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
