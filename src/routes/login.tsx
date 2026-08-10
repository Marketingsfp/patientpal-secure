import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Activity, Mail, Lock, Eye, EyeOff, CalendarDays, Users, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isMedicoOnlyUser } from "@/lib/medico-only";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Entrar — ClinicaOS" },
      {
        name: "description",
        content:
          "Acesse sua conta ClinicaOS para gerenciar agenda, prontuários e financeiro da sua clínica.",
      },
      { property: "og:title", content: "Entrar — ClinicaOS" },
      {
        property: "og:description",
        content: "Faça login para acessar agenda, prontuário e financeiro da sua clínica.",
      },
      { property: "og:url", content: "https://patientpal-secure.lovable.app/login" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://patientpal-secure.lovable.app/login" }],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      (async () => {
        const soMedico = await isMedicoOnlyUser(user.id);
        navigate({ to: soMedico ? "/medico" : "/app", replace: true });
      })();
    }
  }, [authLoading, navigate, user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Bem-vindo!");
    const uid = data.user?.id;
    const soMedico = uid ? await isMedicoOnlyUser(uid) : false;
    navigate({ to: soMedico ? "/medico" : "/app", replace: true });
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Informe seu e-mail para recuperar a senha.");
      return;
    }
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Enviamos um e-mail com instruções para redefinir sua senha.");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 text-white relative overflow-hidden bg-gradient-to-br from-[#16a34a] via-[#15803d] to-[#166534]">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
            <Activity className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">ClinicaOS</span>
        </div>

        <div className="space-y-6 max-w-md">
          <h2 className="text-5xl font-bold leading-tight tracking-tight">
            Gerencie sua clínica com leveza.
          </h2>
          <p className="text-white/85 text-lg leading-relaxed">
            Agenda, prontuário, financeiro e equipe em um só lugar — pensado para o dia a dia da sua operação.
          </p>
          <ul className="space-y-3 pt-4">
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                <CalendarDays className="h-4 w-4" />
              </span>
              <span className="text-white/90">Agenda inteligente com confirmação automática</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                <Users className="h-4 w-4" />
              </span>
              <span className="text-white/90">Cadastro de pacientes, serviços e equipe</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span className="text-white/90">Dados protegidos com isolamento por clínica</span>
            </li>
          </ul>
        </div>

        <p className="text-xs text-white/70">© {new Date().getFullYear()} ClinicaOS — todos os direitos reservados.</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12 sm:px-10 w-full">
        <div className="w-full max-w-md">
          <Link to="/" className="flex lg:hidden items-center justify-center gap-2 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="h-5 w-5" />
            </div>
            <span className="text-xl font-semibold">Clinica Total</span>
          </Link>
          <div className="rounded-2xl border border-border/70 bg-card p-8 shadow-xl shadow-primary/5">
            <div className="mb-6">
              <h1 className="text-3xl font-semibold tracking-tight">Bem-vindo de volta</h1>
              <p className="text-sm text-muted-foreground mt-1.5">Acesse sua clínica com seu e-mail e senha</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="voce@clinica.com" required className="pl-9 h-11" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={resetLoading}
                    className="text-xs text-primary font-medium hover:underline disabled:opacity-60"
                  >
                    {resetLoading ? "Enviando..." : "Esqueci a senha"}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type={showPwd ? "text" : "password"} placeholder="••••••••" required className="pl-9 pr-10 h-11" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Mostrar senha">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full h-11 text-base font-medium" disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}