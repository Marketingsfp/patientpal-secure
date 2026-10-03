import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AppSidebarLayout } from "../src/components/app-sidebar-layout";
import { AcessibilidadeProvider } from "../src/components/acessibilidade/AcessibilidadeProvider";
import {
  BotaoAcessibilidade,
  PainelAcessibilidade,
} from "../src/components/acessibilidade/BotaoAcessibilidade";

function Preview() {
  const [aberto, setAberto] = useState(false);
  const [menu, setMenu] = useState(false);
  const [outroPortal, setOutroPortal] = useState(false);
  return (
    <AcessibilidadeProvider>
      <div
        data-os-zap={!outroPortal ? "true" : undefined}
        className="flex h-dvh flex-col bg-background text-foreground"
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-3">
          <button onClick={() => setMenu(!menu)}>Menu</button>
          <button
            onClick={() => {
              setOutroPortal(!outroPortal);
              setAberto(false);
            }}
          >
            Alternar portal
          </button>
          <BotaoAcessibilidade
            aberto={outroPortal ? undefined : aberto}
            onAbertoChange={outroPortal ? undefined : setAberto}
          />
        </header>
        <AppSidebarLayout
          modo={outroPortal ? "gaveta" : "coluna"}
          aberta={menu}
          onFechar={() => setMenu(false)}
          sidebar={<nav className="h-full bg-muted p-3">Menu do OS ZAP</nav>}
          painelDireitoAberto={aberto}
          painelDireito={<PainelAcessibilidade onFechar={() => setAberto(false)} />}
        >
          <main className="flex min-h-0 min-w-0 flex-1" data-chat-layout>
            <div className="flex min-w-0 flex-1 flex-col p-3" data-chat>
              <h1>Conversa de demonstração</h1>
              <p className="flex-1">O chat continua montado ao abrir e fechar a acessibilidade.</p>
              <input aria-label="Rascunho de atendimento" className="w-full rounded border p-2" />
            </div>
            <aside data-contatos className="hidden w-[260px] shrink-0 border-l p-3 lg:block">
              Contatos
            </aside>
          </main>
        </AppSidebarLayout>
      </div>
    </AcessibilidadeProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
