import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Política de Privacidade — ClinicaOS" },
      {
        name: "description",
        content:
          "Política de Privacidade do ClinicaOS: quais dados tratamos, base legal na LGPD, compartilhamento com a Meta/WhatsApp Business, retenção, segurança e direitos do titular.",
      },
      { property: "og:title", content: "Política de Privacidade — ClinicaOS" },
      {
        property: "og:description",
        content:
          "Como o ClinicaOS coleta, usa, compartilha e protege dados pessoais, conforme a Lei 13.709/2018 (LGPD).",
      },
      { property: "og:url", content: "https://patientpal-secure.lovable.app/privacy" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: "https://patientpal-secure.lovable.app/privacy" }],
  }),
});

function Secao({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <Link to="/" className="text-sm font-medium text-primary hover:underline">
          ← Voltar ao início
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
          Política de Privacidade — ClinicaOS
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última atualização: 25 de agosto de 2026.
        </p>

        <div className="mt-10 space-y-10">
          <Secao title="1. Quem somos">
            <p>
              O ClinicaOS é uma plataforma de gestão para clínicas de saúde, utilizada por clínicas
              parceiras para organizar agendamentos, prontuários, atendimento e comunicação com
              pacientes. Cada clínica que utiliza o sistema é a controladora dos dados dos seus
              pacientes, e o ClinicaOS atua como operador, tratando os dados conforme as instruções
              da clínica e a legislação aplicável.
            </p>
          </Secao>

          <Secao title="2. Quais dados coletamos">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-foreground">Dados cadastrais de pacientes:</strong> nome,
                CPF, data de nascimento, sexo, endereço, convênio e demais informações necessárias
                ao cadastro e ao atendimento.
              </li>
              <li>
                <strong className="text-foreground">Dados de contato:</strong> telefone celular,
                e-mail e preferências de comunicação.
              </li>
              <li>
                <strong className="text-foreground">Mensagens trocadas via WhatsApp:</strong>{" "}
                conteúdo das mensagens enviadas e recebidas, número de telefone, data e hora e
                status de entrega, para registro do atendimento.
              </li>
              <li>
                <strong className="text-foreground">Dados de uso e acesso:</strong> registros de
                login, endereço IP e ações realizadas no sistema, para fins de auditoria e
                segurança.
              </li>
              <li>
                <strong className="text-foreground">Dados de saúde:</strong> quando registrados pela
                equipe da clínica no prontuário eletrônico, tratados como dados pessoais sensíveis.
              </li>
            </ul>
          </Secao>

          <Secao title="3. Finalidade do tratamento">
            <ul className="list-disc space-y-2 pl-5">
              <li>Realizar e gerenciar agendamentos, confirmações e lembretes de consulta.</li>
              <li>Prestar atendimento clínico e manter o histórico do paciente.</li>
              <li>Emitir documentos, recibos, notas fiscais e controlar o financeiro.</li>
              <li>
                Comunicar-se com o paciente por WhatsApp, e-mail ou telefone sobre seu atendimento.
              </li>
              <li>Cumprir obrigações legais, regulatórias e sanitárias.</li>
              <li>Garantir a segurança do sistema, prevenir fraudes e manter trilha de auditoria.</li>
            </ul>
          </Secao>

          <Secao title="4. Base legal (LGPD — Lei 13.709/2018)">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-foreground">Tutela da saúde</strong> (art. 11, II, "f") —
                para o tratamento de dados de saúde realizado por profissionais de saúde e serviços
                de saúde.
              </li>
              <li>
                <strong className="text-foreground">Execução de contrato</strong> (art. 7º, V) —
                para prestação do serviço de atendimento e agendamento.
              </li>
              <li>
                <strong className="text-foreground">Cumprimento de obrigação legal</strong> (art. 7º,
                II) — guarda de prontuários e obrigações fiscais.
              </li>
              <li>
                <strong className="text-foreground">Legítimo interesse</strong> (art. 7º, IX) —
                segurança da informação e melhoria do serviço.
              </li>
              <li>
                <strong className="text-foreground">Consentimento</strong> (art. 7º, I) — para
                comunicações não essenciais, como campanhas e avisos informativos.
              </li>
            </ul>
          </Secao>

          <Secao title="5. Compartilhamento com terceiros">
            <p>
              Não vendemos dados pessoais. O compartilhamento ocorre apenas quando necessário para a
              prestação do serviço ou por exigência legal, com:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-foreground">Meta Platforms (WhatsApp Business Platform):</strong>{" "}
                o sistema utiliza a WhatsApp Business Platform (Cloud API) da Meta para envio e
                recebimento de mensagens com pacientes. O número de telefone e o conteúdo das
                mensagens são processados pela Meta conforme as políticas dela.
              </li>
              <li>Provedores de infraestrutura em nuvem, hospedagem e banco de dados.</li>
              <li>
                Provedores de emissão de nota fiscal, cobrança e meios de pagamento, quando
                aplicável.
              </li>
              <li>
                Autoridades públicas, órgãos reguladores e conselhos profissionais, quando exigido
                por lei ou decisão judicial.
              </li>
            </ul>
          </Secao>

          <Secao title="6. Tempo de retenção">
            <p>
              Prontuários e registros clínicos são mantidos pelo prazo mínimo de 20 (vinte) anos a
              contar do último atendimento, conforme a Resolução CFM nº 1.821/2007. Documentos
              fiscais e financeiros são mantidos pelos prazos legais (em geral 5 anos). Mensagens de
              WhatsApp e registros de acesso são mantidos pelo tempo necessário ao atendimento, à
              auditoria e à defesa em processos. Encerrados os prazos, os dados são eliminados ou
              anonimizados.
            </p>
          </Secao>

          <Secao title="7. Segurança da informação">
            <p>
              Adotamos medidas técnicas e administrativas para proteger os dados: criptografia em
              trânsito (HTTPS/TLS), controle de acesso por perfil e por clínica, isolamento de dados
              entre clínicas, autenticação individual, trilha de auditoria das ações realizadas e
              rotinas de backup. O acesso aos dados é restrito a profissionais autorizados e
              limitado ao necessário para suas funções.
            </p>
          </Secao>

          <Secao title="8. Direitos do titular">
            <p>Nos termos do art. 18 da LGPD, o titular pode solicitar:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>confirmação da existência de tratamento e acesso aos dados;</li>
              <li>correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
              <li>portabilidade dos dados a outro fornecedor;</li>
              <li>eliminação dos dados tratados com consentimento, respeitadas as guardas legais;</li>
              <li>informação sobre com quem os dados foram compartilhados;</li>
              <li>revogação do consentimento e oposição a tratamentos considerados irregulares.</li>
            </ul>
            <p>
              Para exercer esses direitos, envie a solicitação para o encarregado indicado abaixo.
              Podemos solicitar documentos para confirmar a identidade do titular antes de atender ao
              pedido. Responderemos no menor prazo possível, observados os limites legais.
            </p>
          </Secao>

          <Secao title="9. Cookies">
            <p>
              Utilizamos cookies e armazenamento local estritamente necessários para manter a sessão
              do usuário autenticado, lembrar preferências de exibição (como tema e densidade) e
              garantir a segurança do acesso. Não utilizamos cookies de publicidade comportamental.
              O usuário pode bloquear cookies nas configurações do navegador, ciente de que isso pode
              impedir o funcionamento do login e de partes do sistema.
            </p>
          </Secao>

          <Secao title="10. Encarregado pelo tratamento de dados (DPO)">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-foreground">
                Dúvidas, solicitações de titulares ou incidentes de privacidade podem ser
                encaminhados ao nosso encarregado:
              </p>
              <p className="mt-3 text-sm">
                <span className="text-muted-foreground">E-mail: </span>
                <a
                  href="mailto:marketing@clinicasfp.com"
                  className="font-medium text-primary hover:underline"
                >
                  marketing@clinicasfp.com
                </a>
              </p>
            </div>
          </Secao>

          <Secao title="11. Alterações desta política">
            <p>
              Esta política pode ser atualizada para refletir mudanças legais, técnicas ou
              operacionais. A data da última atualização é sempre exibida no topo desta página.
            </p>
          </Secao>
        </div>

        <div className="mt-12 border-t border-border pt-6">
          <Link to="/" className="text-sm font-medium text-primary hover:underline">
            ← Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
