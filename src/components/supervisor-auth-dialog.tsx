import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Quem é a ação que precisa autorização (ex: "Aplicar desconto"). */
  acao?: string;
  /** Roles aceitos. Default: admin, gestor, financeiro. */
  rolesPermitidos?: string[];
  onAuthorized: (info: { userId: string; email: string; nome: string; role: string }) => void;
}

/**
 * Pede e-mail + senha de um supervisor (admin/gestor/financeiro por padrão)
 * para autorizar uma ação privilegiada. Faz signIn temporário, valida o
 * papel na clínica atual e restaura a sessão original ao final.
 */
export function SupervisorAuthDialog({
  open,
  onOpenChange,
  acao = "esta ação",
  rolesPermitidos,
  onAuthorized,
}: Props) {
  const { clinicaAtual } = useClinica();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const allowed = rolesPermitidos ?? ["admin", "gestor", "financeiro"];

  useEffect(() => {
    if (!open) {
      setEmail("");
      setSenha("");
      setLoading(false);
    }
  }, [open]);

  async function validar() {
    if (!email.trim() || !senha) return toast.error("Informe e-mail e senha do supervisor.");
    if (!clinicaAtual) return toast.error("Sem clínica selecionada.");
    setLoading(true);
    // Salva a sessão atual para restaurar depois.
    const {
      data: { session: atual },
    } = await supabase.auth.getSession();
    if (!atual?.refresh_token) {
      setLoading(false);
      return toast.error("Sessão atual inválida.");
    }
    const { data: sup, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    if (error || !sup?.user) {
      setLoading(false);
      // Restaura sessão original caso tenha sido apagada parcialmente.
      await supabase.auth.setSession({
        access_token: atual.access_token,
        refresh_token: atual.refresh_token,
      });
      return toast.error("E-mail ou senha incorretos.");
    }
    // Verifica vínculo + papel na clínica atual.
    const { data: mem } = await supabase
      .from("clinica_memberships")
      .select("role")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("user_id", sup.user.id)
      .maybeSingle();
    const role = mem?.role ?? null;
    const ok = !!role && allowed.includes(role);
    // Busca o nome do supervisor (para registrar quem autorizou).
    let nome = sup.user.email ?? email.trim();
    if (ok) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", sup.user.id)
        .maybeSingle();
      if (prof?.nome) nome = prof.nome;
    }
    // SEMPRE restaura a sessão original.
    await supabase.auth.setSession({
      access_token: atual.access_token,
      refresh_token: atual.refresh_token,
    });
    setLoading(false);
    if (!ok)
      return toast.error(
        "Este usuário não tem permissão para autorizar (precisa ser admin, gestor ou financeiro).",
      );
    toast.success(`Autorizado por ${nome}`);
    onAuthorized({ userId: sup.user.id, email: sup.user.email ?? email.trim(), nome, role: role! });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Autorização da supervisão
          </DialogTitle>
          <DialogDescription>
            Para {acao}, peça ao supervisor (admin, gestor ou financeiro) que informe e-mail e
            senha.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sup-email">E-mail do supervisor</Label>
            <Input
              id="sup-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sup-senha">Senha</Label>
            <Input
              id="sup-senha"
              type="password"
              autoComplete="off"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void validar();
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={() => void validar()} disabled={loading}>
            {loading ? "Validando…" : "Autorizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
