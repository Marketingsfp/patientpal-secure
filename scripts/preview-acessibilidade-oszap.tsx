import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AppSidebarLayout } from "../src/components/app-sidebar-layout";
import {
  AcessibilidadeProvider,
  useAcessibilidade,
} from "../src/components/acessibilidade/AcessibilidadeProvider";
import { AtalhosAcessibilidade } from "../src/components/acessibilidade/AtalhosAcessibilidade";
import { deveEnviarPorTecla } from "../src/lib/atendimento/teclado-envio";
import {
  BotaoAcessibilidade,
  PainelAcessibilidade,
} from "../src/components/acessibilidade/BotaoAcessibilidade";

function ChatDemonstracao() {
  const { prefs } = useAcessibilidade();
  const [draft, setDraft] = useState("");
  const [envios, setEnvios] = useState(0);
  const enviar = () => setEnvios((v) => v + 1);
  return (
    <div className="flex min-w-0 flex-1 flex-col p-3" data-chat>
      <h1>Conversa de demonstração</h1>
      <p className="oszap-bubble rounded-lg bg-card text-foreground" data-leitura>
        Mensagem de exemplo para conferir a leitura. O chat continua montado ao abrir e fechar a
        acessibilidade.
      </p>
      <p className="flex-1">Sem conexão com pacientes ou WhatsApp.</p>
      <span data-envios>{envios}</span>
      <textarea
        aria-label="Rascunho de atendimento"
        className="w-full rounded border p-2"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) {
            e.stopPropagation();
            return;
          }
          if (
            deveEnviarPorTecla(
              { ...e, isComposing: e.nativeEvent.isComposing },
              prefs.oszap.enterEnvia,
            )
          ) {
            e.preventDefault();
            e.stopPropagation();
            enviar();
          }
        }}
      />
      <button data-a11y-acao="enviar" onClick={enviar}>
        Enviar mensagem
      </button>
    </div>
  );
}

function Preview() {
  const [aberto, setAberto] = useState(false);
  const [menu, setMenu] = useState(false);
  const [outroPortal, setOutroPortal] = useState(false);
  return (
    <AcessibilidadeProvider>
      <AtalhosAcessibilidade />
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
            <ChatDemonstracao />
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
