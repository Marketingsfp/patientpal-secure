import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/lms-admin")({
  component: LMSAdminPage,
});

type Curso = { id: string; titulo: string; descricao: string | null; carga_horaria_min: number; publicado: boolean };
type Modulo = { id: string; curso_id: string; titulo: string; ordem: number };
type Licao = { id: string; modulo_id: string; curso_id: string; titulo: string; tipo: "video"|"texto"|"quiz"; conteudo: string | null; video_url: string | null; ordem: number };

function LMSAdminPage() {
  const { user } = useAuth();
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("lms-admin");
  const clinicaId = clinicaAtual?.clinica_id;

  const [cursos, setCursos] = useState<Curso[]>([]);
  const [cursoSel, setCursoSel] = useState<string | null>(null);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [licoes, setLicoes] = useState<Licao[]>([]);

  const [openCurso, setOpenCurso] = useState(false);
  const [novoCurso, setNovoCurso] = useState({ titulo: "", descricao: "", carga: 60 });

  async function loadCursos() {
    if (!clinicaId) return;
    const { data } = await supabase
      .from("lms_cursos")
      .select("id, titulo, descricao, carga_horaria_min, publicado")
      .eq("clinica_id", clinicaId)
      .order("created_at", { ascending: false });
    setCursos((data ?? []) as Curso[]);
  }
  useEffect(() => { void loadCursos(); }, [clinicaId]);

  useEffect(() => {
    if (!cursoSel) { setModulos([]); setLicoes([]); return; }
    (async () => {
      const [{ data: m }, { data: l }] = await Promise.all([
        supabase.from("lms_modulos").select("id, curso_id, titulo, ordem").eq("curso_id", cursoSel).order("ordem"),
        supabase.from("lms_licoes").select("id, modulo_id, curso_id, titulo, tipo, conteudo, video_url, ordem").eq("curso_id", cursoSel).order("ordem"),
      ]);
      setModulos((m ?? []) as Modulo[]);
      setLicoes((l ?? []) as Licao[]);
    })();
  }, [cursoSel]);

  async function criarCurso() {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!clinicaId || !user || !novoCurso.titulo.trim()) return;
    const { error } = await supabase.from("lms_cursos").insert({
      clinica_id: clinicaId, titulo: novoCurso.titulo.trim(),
      descricao: novoCurso.descricao || null, carga_horaria_min: novoCurso.carga, criado_por: user.id,
    });
    if (error) { mostrarErro(error); return; }
    toast.success("Curso criado");
    setOpenCurso(false); setNovoCurso({ titulo: "", descricao: "", carga: 60 });
    await loadCursos();
  }

  async function togglePublicado(c: Curso) {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const { error } = await supabase.from("lms_cursos").update({ publicado: !c.publicado }).eq("id", c.id);
    if (error) { mostrarErro(error); return; }
    await loadCursos();
  }

  async function novoModulo() {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!cursoSel) return;
    const titulo = prompt("Título do módulo");
    if (!titulo) return;
    const { error } = await supabase.from("lms_modulos").insert({
      curso_id: cursoSel, titulo, ordem: modulos.length,
    });
    if (error) { mostrarErro(error); return; }
    const { data } = await supabase.from("lms_modulos").select("id, curso_id, titulo, ordem").eq("curso_id", cursoSel).order("ordem");
    setModulos((data ?? []) as Modulo[]);
  }

  async function novaLicao(moduloId: string) {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!cursoSel) return;
    const titulo = prompt("Título da lição");
    if (!titulo) return;
    const ordem = licoes.filter((l) => l.modulo_id === moduloId).length;
    const { error } = await supabase.from("lms_licoes").insert({
      curso_id: cursoSel, modulo_id: moduloId, titulo, tipo: "texto", ordem,
    });
    if (error) { mostrarErro(error); return; }
    const { data } = await supabase.from("lms_licoes").select("id, modulo_id, curso_id, titulo, tipo, conteudo, video_url, ordem").eq("curso_id", cursoSel).order("ordem");
    setLicoes((data ?? []) as Licao[]);
  }

  async function salvarLicao(l: Licao) {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const { error } = await supabase.from("lms_licoes").update({
      titulo: l.titulo, tipo: l.tipo, conteudo: l.conteudo, video_url: l.video_url,
    }).eq("id", l.id);
    if (error) { mostrarErro(error); return; }
    toast.success("Lição salva");
  }

  async function removerLicao(id: string) {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!confirm("Excluir lição?")) return;
    const { error } = await supabase.from("lms_licoes").delete().eq("id", id);
    if (error) { mostrarErro(error); return; }
    setLicoes((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cursos (LMS)</h1>
          <p className="text-sm text-muted-foreground">Crie cursos, módulos e lições para sua equipe</p>
        </div>
        {podeEscrever && (
        <Dialog open={openCurso} onOpenChange={setOpenCurso}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Novo curso</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo curso</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Título</Label><Input value={novoCurso.titulo} onChange={(e) => setNovoCurso({ ...novoCurso, titulo: e.target.value })} /></div>
              <div><Label>Descrição</Label><Textarea value={novoCurso.descricao} onChange={(e) => setNovoCurso({ ...novoCurso, descricao: e.target.value })} /></div>
              <div><Label>Carga horária (min)</Label><Input type="number" value={novoCurso.carga} onChange={(e) => setNovoCurso({ ...novoCurso, carga: Number(e.target.value) || 0 })} /></div>
            </div>
            <DialogFooter><Button onClick={criarCurso}>Criar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        <Card className="p-3 space-y-2">
          {cursos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum curso ainda</p>}
          {cursos.map((c) => (
            <div key={c.id} className={`p-2 rounded border cursor-pointer ${cursoSel === c.id ? "border-primary bg-primary/5" : ""}`} onClick={() => setCursoSel(c.id)}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{c.titulo}</p>
                <Switch checked={c.publicado} disabled={!podeEscrever} onCheckedChange={() => togglePublicado(c)} onClick={(e) => e.stopPropagation()} />
              </div>
              <div className="flex gap-1 mt-1">
                <Badge variant="secondary">{Math.round(c.carga_horaria_min / 60)}h</Badge>
                {c.publicado && <Badge>Publicado</Badge>}
              </div>
            </div>
          ))}
        </Card>

        <Card className="p-4">
          {!cursoSel ? (
            <p className="text-sm text-muted-foreground">Selecione um curso</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Módulos e lições</h2>
                {podeEscrever && (
                  <Button size="sm" variant="outline" onClick={novoModulo}><Plus className="h-4 w-4 mr-1" /> Módulo</Button>
                )}
              </div>
              {modulos.length === 0 && <p className="text-sm text-muted-foreground">Adicione um módulo para começar</p>}
              {modulos.map((m) => (
                <div key={m.id} className="border rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{m.titulo}</p>
                    {podeEscrever && (
                      <Button size="sm" variant="ghost" onClick={() => novaLicao(m.id)}><Plus className="h-4 w-4 mr-1" /> Lição</Button>
                    )}
                  </div>
                  {licoes.filter((l) => l.modulo_id === m.id).map((l) => (
                    <div key={l.id} className="bg-muted/40 rounded p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input value={l.titulo} disabled={!podeEscrever} onChange={(e) => setLicoes((p) => p.map((x) => x.id === l.id ? { ...x, titulo: e.target.value } : x))} className="flex-1" />
                        <Select value={l.tipo} disabled={!podeEscrever} onValueChange={(v) => setLicoes((p) => p.map((x) => x.id === l.id ? { ...x, tipo: v as Licao["tipo"] } : x))}>
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="texto">Texto</SelectItem>
                            <SelectItem value="video">Vídeo</SelectItem>
                            <SelectItem value="quiz">Quiz</SelectItem>
                          </SelectContent>
                        </Select>
                        {podeEscrever && (
                          <Button size="sm" variant="ghost" onClick={() => removerLicao(l.id)}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </div>
                      {l.tipo === "video" && (
                        <Input placeholder="URL do vídeo (YouTube embed, Vimeo, etc)" value={l.video_url ?? ""} disabled={!podeEscrever} onChange={(e) => setLicoes((p) => p.map((x) => x.id === l.id ? { ...x, video_url: e.target.value } : x))} />
                      )}
                      <Textarea placeholder="Conteúdo da lição" value={l.conteudo ?? ""} disabled={!podeEscrever} onChange={(e) => setLicoes((p) => p.map((x) => x.id === l.id ? { ...x, conteudo: e.target.value } : x))} rows={3} />
                      {podeEscrever && (
                        <Button size="sm" onClick={() => salvarLicao(l)}>Salvar</Button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
