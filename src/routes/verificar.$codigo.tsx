import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";
import { formatDatePura } from "@/lib/date-utils";

export const Route = createFileRoute("/verificar/$codigo")({
  component: VerificarPage,
});

function VerificarPage() {
  const { codigo } = Route.useParams();
  const [carregando, setCarregando] = useState(true);
  const [info, setInfo] = useState<{ aluno: string; curso: string; emitido_em: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: cert } = await supabase
        .from("lms_certificados")
        .select("user_id, curso_id, emitido_em")
        .eq("codigo_verificacao", codigo).maybeSingle();
      if (!cert) { setCarregando(false); return; }
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from("profiles").select("nome").eq("id", cert.user_id).maybeSingle(),
        supabase.from("lms_cursos").select("titulo").eq("id", cert.curso_id).maybeSingle(),
      ]);
      setInfo({
        aluno: p?.nome ?? "—",
        curso: c?.titulo ?? "—",
        emitido_em: cert.emitido_em,
      });
      setCarregando(false);
    })();
  }, [codigo]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {carregando ? "Verificando…" : info ? (<><CheckCircle2 className="h-5 w-5 text-green-600" /> Certificado válido</>) : (<><XCircle className="h-5 w-5 text-destructive" /> Certificado não encontrado</>)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Código:</span> <strong>{codigo}</strong></p>
          {info && (
            <>
              <p><span className="text-muted-foreground">Aluno:</span> <strong>{info.aluno}</strong></p>
              <p><span className="text-muted-foreground">Curso:</span> <strong>{info.curso}</strong></p>
              <p><span className="text-muted-foreground">Emitido em:</span> {formatDatePura(info.emitido_em)}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}