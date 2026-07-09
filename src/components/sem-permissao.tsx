import { Lock, ArrowLeft } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Tela mostrada quando o perfil do usuário não tem permissão para o
 * módulo da rota atual. Renderizada pelo guard do AppShell no lugar do
 * <Outlet />.
 */
export function SemPermissao({ modulo }: { modulo?: string | null }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="flex flex-col items-center text-center gap-3">
          <div className="p-3 rounded-full bg-amber-100 text-amber-700">
            <Lock className="h-6 w-6" />
          </div>
          <CardTitle>Acesso negado</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground text-center space-y-4">
          <p>
            Seu perfil de acesso não permite abrir esta tela
            {modulo ? <> (<span className="font-medium">{modulo}</span>)</> : null}.
          </p>
          <p>
            Se você precisa desse acesso, fale com o administrador da clínica
            para ajustar as permissões em <span className="font-medium">Perfis de acesso</span>.
          </p>
          <div className="flex justify-center pt-2">
            <Button
              type="button"
              variant="default"
              onClick={() => navigate({ to: "/app" })}
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao início
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}