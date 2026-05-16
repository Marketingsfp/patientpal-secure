import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Activity, Mail, Lock, Eye, EyeOff, ShieldCheck, CalendarCheck2, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Entrar — ClinicaOS" }] }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bem-vindo!");
    navigate({ to: "/app", replace: true });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-emerald-700 text-primary-foreground p-12">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-white/30 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-emerald-300/40 blur-3xl" />
        </div>
        <Link to="/" className="relative flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
            <Activity className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">ClinicaOS</span>
        </Link>
        <div className="relative space-y-6 max-w-md">
          <h2 className="text-4xl font-semibold leading-tight">Gerencie sua clínica com leveza.</h2>
          <p className="text-base text-primary-foreground/80">Agenda, prontuário, financeiro e equipe em um só lugar — pensado para o dia a dia da sua operação.</p>
          <ul className="space-y-3 pt-2">
            {[
              { icon: CalendarCheck2, label: "Agenda inteligente com confirmação automática" },
              { icon: Stethoscope, label: "Cadastro de pacientes, procedimentos e equipe" },
              { icon: ShieldCheck, label: "Dados protegidos com isolamento por clínica" },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/15 backdrop-blur">
                  <Icon className="h-4 w-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-primary-foreground/60">© {new Date().getFullYear()} ClinicaOS — todos os direitos reservados.</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <Link to="/" className="flex lg:hidden items-center justify-center gap-2 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="h-5 w-5" />
            </div>
            <span className="text-xl font-semibold">ClinicaOS</span>
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
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Não tem conta? <Link to="/signup" className="text-primary font-medium hover:underline">Criar conta</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}