import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Activity, Mail, Lock, User, Eye, EyeOff, Sparkles, CalendarCheck2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/app" });
  },
  head: () => ({
    meta: [
      { title: "Criar conta — ClinicaOS" },
      {
        name: "description",
        content:
          "Crie sua conta ClinicaOS em minutos e configure agenda, pacientes e financeiro da sua clínica.",
      },
      { property: "og:title", content: "Criar conta — ClinicaOS" },
      {
        property: "og:description",
        content:
          "Cadastre sua clínica e comece a usar agenda, prontuário e financeiro hoje mesmo.",
      },
      { property: "og:url", content: "https://patientpal-secure.lovable.app/signup" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://patientpal-secure.lovable.app/signup" }],
  }),
});

function SignupPage() {
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nome },
        emailRedirectTo: `${window.location.origin}/app`,
      },
    });
    setLoading(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Conta criada! Você já pode entrar.");
    navigate({ to: "/app" });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
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
          <h2 className="text-4xl font-semibold leading-tight">Comece em minutos.</h2>
          <p className="text-base text-primary-foreground/80">Crie sua conta e configure sua clínica com agenda, pacientes e financeiro prontos para usar.</p>
          <ul className="space-y-3 pt-2">
            {[
              { icon: Sparkles, label: "Configuração guiada da sua primeira clínica" },
              { icon: CalendarCheck2, label: "Agenda pronta no primeiro acesso" },
              { icon: ShieldCheck, label: "Seguro, com isolamento por clínica" },
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
        <p className="relative text-xs text-primary-foreground/60">© {new Date().getFullYear()} ClinicaOS</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <Link to="/" className="flex lg:hidden items-center justify-center gap-2 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="h-5 w-5" />
            </div>
            <span className="text-xl font-semibold">Clinica total</span>
          </Link>
          <div className="rounded-2xl border border-border/70 bg-card p-8 shadow-xl shadow-primary/5">
            <div className="mb-6">
              <h1 className="text-3xl font-semibold tracking-tight">Criar conta</h1>
              <p className="text-sm text-muted-foreground mt-1.5">Comece a gerir sua clínica em poucos passos</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="nome" placeholder="Seu nome" required className="pl-9 h-11" value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="voce@clinica.com" required className="pl-9 h-11" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type={showPwd ? "text" : "password"} placeholder="Mínimo 6 caracteres" required minLength={6} className="pl-9 pr-10 h-11" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Mostrar senha">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full h-11 text-base font-medium" disabled={loading}>
                {loading ? "Criando..." : "Criar conta"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Já tem conta? <Link to="/login" className="text-primary font-medium hover:underline">Entrar</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}