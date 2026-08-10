import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Award, BookOpen, CheckCircle2, PlayCircle } from "lucide-react";
// jsPDF + QRCode são pesados (~400 KB). Carregamos só quando o aluno
// realmente emite o certificado.

export const Route = createFileRoute("/_authenticated/app/treinamentos")({
  component: TreinamentosPage,
});

type Curso = { id: string; titulo: string; descricao: string | null; capa_url: string | null; carga_horaria_min: number };
type Licao = { id: string; modulo_id: string; curso_id: string; titulo: string; tipo: string; conteudo: string | null; video_url: string | null; ordem: number };
type Modulo = { id: string; curso_id: string; titulo: string; ordem: number };

function TreinamentosPage() {
  const { user } = useAuth();
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("treinamentos");
  const clinicaId = clinicaAtual?.clinica_id;

  const [cursoSel, setCursoSel] = useState<string | null>(null);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [licoes, setLicoes] = useState<Licao[]>([]);
  const [concluidas, setConcluidas] = useState<Set<string>>(new Set());
  const [licaoAtiva, setLicaoAtiva] = useState<string | null>(null);

  // Catálogo de cursos publicados — baixo risco (raramente muda), cache de 5min.
  const { data: cursos = [] } = useQuery({
    queryKey: ["lms-cursos", clinicaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lms_cursos")
        .select("id, titulo, descricao, capa_url, carga_horaria_min")
        .eq("clinica_id", clinicaId!)
        .eq("publicado", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Curso[];
    },
    enabled: !!clinicaId,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!cursoSel || !user) return;
    (async () => {
      const [{ data: mods }, { data: lics }, { data: progs }] = await Promise.all([
        supabase.from("lms_modulos").select("id, curso_id, titulo, ordem").eq("curso_id", cursoSel).order("ordem"),
        supabase.from("lms_licoes").select("id, modulo_id, curso_id, titulo, tipo, conteudo, video_url, ordem").eq("curso_id", cursoSel).order("ordem"),
        supabase.from("lms_progresso").select("licao_id").eq("user_id", user.id).eq("curso_id", cursoSel),
      ]);
      setModulos((mods ?? []) as Modulo[]);
      setLicoes((lics ?? []) as Licao[]);
      setConcluidas(new Set((progs ?? []).map((p: { licao_id: string }) => p.licao_id)));
      setLicaoAtiva((lics ?? [])[0]?.id ?? null);
    })();
  }, [cursoSel, user]);

  const licao = useMemo(() => licoes.find((l) => l.id === licaoAtiva) ?? null, [licoes, licaoAtiva]);
  const totalLic = licoes.length;
  const progresso = totalLic === 0 ? 0 : Math.round((concluidas.size / totalLic) * 100);
  const cursoObj = cursos.find((c) => c.id === cursoSel);

  async function concluirLicao() {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!licao || !user || !cursoSel) return;
    if (concluidas.has(licao.id)) return;
    const { error } = await supabase.from("lms_progresso").insert({
      user_id: user.id, curso_id: cursoSel, licao_id: licao.id,
    });
    if (error) { mostrarErro(error); return; }
    const nova = new Set(concluidas); nova.add(licao.id);
    setConcluidas(nova);
    toast.success("Lição concluída");
    const idx = licoes.findIndex((l) => l.id === licao.id);
    if (idx >= 0 && idx + 1 < licoes.length) setLicaoAtiva(licoes[idx + 1].id);
    // se completou tudo, emite certificado
    if (nova.size === totalLic) await emitirCertificado();
  }

  async function emitirCertificado() {
    if (!user || !cursoSel || !clinicaId || !cursoObj) return;
    const { data: existente } = await supabase
      .from("lms_certificados")
      .select("codigo_verificacao, emitido_em")
      .eq("user_id", user.id).eq("curso_id", cursoSel).maybeSingle();
    let codigo = existente?.codigo_verificacao;
    let emitido = existente?.emitido_em ? new Date(existente.emitido_em) : new Date();
    if (!codigo) {
      const { data, error } = await supabase
        .from("lms_certificados")
        .insert({ user_id: user.id, curso_id: cursoSel, clinica_id: clinicaId })
        .select("codigo_verificacao, emitido_em").single();
      if (error || !data) { mostrarErro(error); return; }
      codigo = data.codigo_verificacao; emitido = new Date(data.emitido_em);
    }
    const nomeAluno = (user.user_metadata?.full_name as string) ?? (user.email ?? "Aluno");
    const { gerarCertificadoPDF } = await import("@/lib/lms-certificate");
    await gerarCertificadoPDF({
      nomeAluno, curso: cursoObj.titulo, cargaHorariaMin: cursoObj.carga_horaria_min,
      clinicaNome: clinicaAtual?.clinica.nome ?? "", codigoVerificacao: codigo, emitidoEm: emitido,
    });
    toast.success("Certificado emitido");
  }

  if (!cursoSel) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Treinamentos</h1>
          <p className="text-sm text-muted-foreground">Cursos disponíveis para sua equipe</p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cursos.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full">Nenhum curso publicado ainda.</p>
          )}
          {cursos.map((c) => (
            <Card key={c.id} className="cursor-pointer hover:shadow-md transition" onClick={() => setCursoSel(c.id)}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> {c.titulo}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground line-clamp-3">{c.descricao}</p>
                <Badge variant="secondary">{Math.max(1, Math.round(c.carga_horaria_min / 60))}h</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => setCursoSel(null)}>← Voltar</Button>
          <h1 className="text-2xl font-bold tracking-tight mt-1">{cursoObj?.titulo}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-48"><Progress value={progresso} /></div>
          <span className="text-sm text-muted-foreground">{progresso}%</span>
          {progresso === 100 && podeEscrever && (
            <Button onClick={emitirCertificado}><Award className="h-4 w-4 mr-1" /> Baixar certificado</Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        <Card className="p-3 space-y-3">
          {modulos.map((m) => (
            <div key={m.id}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{m.titulo}</p>
              <div className="space-y-1">
                {licoes.filter((l) => l.modulo_id === m.id).map((l) => {
                  const ok = concluidas.has(l.id);
                  const ativa = l.id === licaoAtiva;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setLicaoAtiva(l.id)}
                      className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded text-sm ${ativa ? "bg-primary/10" : "hover:bg-muted"}`}
                    >
                      {ok ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> : <PlayCircle className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <span className="truncate">{l.titulo}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>

        <Card className="p-4">
          {!licao ? (
            <p className="text-sm text-muted-foreground">Selecione uma lição</p>
          ) : (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">{licao.titulo}</h2>
              {licao.tipo === "video" && licao.video_url && (
                <div className="aspect-video">
                  <iframe src={licao.video_url} className="w-full h-full rounded" allowFullScreen />
                </div>
              )}
              {licao.conteudo && (
                <div className="prose prose-sm max-w-none whitespace-pre-wrap">{licao.conteudo}</div>
              )}
              {podeEscrever && (
                <Button onClick={concluirLicao} disabled={concluidas.has(licao.id)}>
                  {concluidas.has(licao.id) ? "Concluída" : "Marcar como concluída"}
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
