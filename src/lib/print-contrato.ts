import { supabase } from "@/integrations/supabase/client";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const fmtData = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const MESES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export const fmtDataExtenso = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} de ${MESES_PT[d.getMonth()]} de ${d.getFullYear()}`;
};

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

function applyTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) =>
    vars[key] && String(vars[key]).trim() ? body : "",
  );
  out = out.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) =>
    vars[key] && String(vars[key]).trim() ? "" : body,
  );
  return out.replace(/\{\{(\w+)\}\}/g, (_, k) => esc(vars[k] ?? ""));
}

export async function printContrato(contratoId: string) {
  const { data: c, error } = await supabase
    .from("contratos_assinatura")
    .select("*")
    .eq("id", contratoId)
    .maybeSingle();
  if (error || !c) throw new Error(error?.message ?? "Contrato não encontrado");

  const [{ data: pl }, { data: cl }, { data: pa }] = await Promise.all([
    (c as any).plano_id
      ? supabase
          .from("planos_assinatura")
          .select("*")
          .eq("id", (c as any).plano_id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
    (c as any).clinica_id
      ? supabase
          .from("clinicas")
          .select("nome, cnpj, endereco, cidade, estado, telefone")
          .eq("id", (c as any).clinica_id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
    (c as any).paciente_id
      ? supabase
          .from("pacientes")
          .select(
            "cpf, data_nascimento, telefone, email, logradouro, numero, bairro, cidade, estado, cep",
          )
          .eq("id", (c as any).paciente_id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);

  const { data: depsRaw } = await supabase
    .from("contrato_dependentes")
    .select("*")
    .eq("contrato_id", contratoId)
    .eq("ativo", true);

  const deps = depsRaw ?? [];

  const pids = deps.map((d: any) => d.paciente_id).filter(Boolean);
  const pacsMap: Record<string, any> = {};
  if (pids.length > 0) {
    const { data: pacsData } = await supabase
      .from("pacientes")
      .select("id, cpf, data_nascimento, telefone")
      .in("id", pids);

    if (pacsData) {
      pacsData.forEach((p: any) => {
        pacsMap[p.id] = p;
      });
    }
  }

  const _cl: any = cl ?? {};
  const _pa: any = pa ?? {};

  const enderecoPaciente = [
    _pa.logradouro,
    _pa.numero,
    _pa.bairro,
    _pa.cidade && _pa.estado ? `${_pa.cidade}-${_pa.estado}` : _pa.cidade,
  ]
    .filter(Boolean)
    .join(", ");

  const maxSlots = 5;
  const depSlotVars: Record<string, string> = {};
  for (let i = 0; i < maxSlots; i++) {
    const d: any = deps[i];
    const pac: any = d ? pacsMap[d.paciente_id] : null;
    const idx = i + 1;

    depSlotVars[`DEPENDENTE_${idx}`] = d?.paciente_nome ?? "";
    depSlotVars[`DEPENDENTE_${idx}_PARENTESCO`] = d?.parentesco ?? "";
    depSlotVars[`DEPENDENTE_${idx}_CPF`] = pac?.cpf ?? "";
    depSlotVars[`DEPENDENTE_${idx}_NASCIMENTO`] = pac?.data_nascimento
      ? fmtData(pac.data_nascimento)
      : "";
    depSlotVars[`DEPENDENTE_${idx}_TELEFONE`] = pac?.telefone ?? d?.telefone ?? "";
  }

  const textoFixo = `INSTRUMENTO PARTICULAR DE CONTRATO
"CARTÃO CONSULTA + SEGUROS"

Pelo presente instrumento, e na melhor forma de Direito, os signatários:

CONTRATADA: POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI
CNPJ: 27.045.917/0001-69
Endereço: Rua Expedicionários, nº 148
Bairro: Centro
Cidade: São João de Meriti
Estado: Rio de Janeiro
CEP: 25.520-591

CONTRATANTE: ASSOCIADO TITULAR
Nome: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}
Nascimento: {{PACIENTE_NASCIMENTO}}
Endereço: {{PACIENTE_ENDERECO}}
Telefones: {{PACIENTE_TELEFONE}}
E-mail: {{PACIENTE_EMAIL}}

ASSOCIADOS DEPENDENTES:
{{#DEPENDENTE_1}}
1. Nome: {{DEPENDENTE_1}}
Nascimento: {{DEPENDENTE_1_NASCIMENTO}}
Parentesco: {{DEPENDENTE_1_PARENTESCO}}
Telefone: {{DEPENDENTE_1_TELEFONE}}
{{/DEPENDENTE_1}}{{#DEPENDENTE_2}}
2. Nome: {{DEPENDENTE_2}}
Nascimento: {{DEPENDENTE_2_NASCIMENTO}}
Parentesco: {{DEPENDENTE_2_PARENTESCO}}
Telefone: {{DEPENDENTE_2_TELEFONE}}
{{/DEPENDENTE_2}}{{#DEPENDENTE_3}}
3. Nome: {{DEPENDENTE_3}}
Nascimento: {{DEPENDENTE_3_NASCIMENTO}}
Parentesco: {{DEPENDENTE_3_PARENTESCO}}
Telefone: {{DEPENDENTE_3_TELEFONE}}
{{/DEPENDENTE_3}}{{#DEPENDENTE_4}}
4. Nome: {{DEPENDENTE_4}}
Nascimento: {{DEPENDENTE_4_NASCIMENTO}}
Parentesco: {{DEPENDENTE_4_PARENTESCO}}
Telefone: {{DEPENDENTE_4_TELEFONE}}
{{/DEPENDENTE_4}}{{#DEPENDENTE_5}}
5. Nome: {{DEPENDENTE_5}}
Nascimento: {{DEPENDENTE_5_NASCIMENTO}}
Parentesco: {{DEPENDENTE_5_PARENTESCO}}
Telefone: {{DEPENDENTE_5_TELEFONE}}
{{/DEPENDENTE_5}}{{^DEPENDENTE_1}}
(nenhum dependente cadastrado)
{{/DEPENDENTE_1}}

Firmam o presente contrato, para a utilização dos benefícios do Cartão Consulta da Policlínica Menino Jesus, através do qual serão concedidos descontos ao ASSOCIADO TITULAR, bem como, aos seus ASSOCIADOS DEPENDENTES, exclusivamente na sede situada no endereço acima, de acordo com os termos e condições previstas nas cláusulas a seguir.

CLÁUSULA PRIMEIRA: DO OBJETO
O objeto do contrato consiste em serviços médicos prestados pela CONTRATADA, da seguinte forma:
APÓS O PAGAMENTO DA 1ª MENSALIDADE E TAXA DE INSCRIÇÃO: O cliente realizará CONSULTAS CLÍNICAS SEM CARÊNCIA referentes às especialidades de: Angiologia, Cardiologia, Clínica Médica, Dermatologia, Endocrinologia, Gastroenterologia, Geriatria, Ginecologia, Ortopedia, Otorrinolaringologia, Obstetrícia, Pediatria e Urologia;
Parágrafo Primeiro: O cliente terá desconto e pagará o valor de consulta, de acordo com a tabela disponibilizada pela CONTRATADA na sede de atendimento, para as seguintes especialidades: Alergologia, Cardiologia Infantil, Endocrinologia Infantil, Fonoaudiologia, Mastologia, Nefrologia, Neurologia, Nutrição, Oftalmologia, Podologia, Pneumologia, Proctologia, Psiquiatria, Psicologia e Reumatologia.
Parágrafo Segundo: NÃO ESTÁ COBERTO POR ESTE CARTÃO CONSULTA OS SEGUINTES SERVIÇOS: Procedimentos, pequenas cirurgias, anestesias, estética, revisão, risco cirúrgico, exame ocupacional; Laudo para INSS e CONCURSOS PÚBLICOS.
Paragrafo Terceiro: Os Associados ficam cientes de que não estão aderindo a um plano de saúde, mas a um serviço de operacionalização de descontos e benefícios aos consumidores aderentes.
Paragrafo Quarto: A CONTRATADA NÃO POSSUI EMERGÊNCIA, SERVIÇOS DE INTERNAÇÃO, NEM ATENDIMENTO 24 HORAS.
Parágrafo Quinto: HAVERÁ LIMITE DE (1) UMA CONSULTA DIÁRIA POR CONTRATO.

CLÁUSULA SEGUNDA: DOS BENEFÍCIOS
Após o pagamento de algumas mensalidades os ASSOCIADOS terão direito aos seguintes serviços de saúde:
APÓS A 1ª MENSALIDADE: Gratuidade para verificação de peso e pressão.
APÓS A 2ª MENSALIDADE:
10% de desconto nos exames: Laboratoriais; Eletrocardiograma; Raio X; Preventivo; Mamografia; Densitometria óssea;
5% de desconto nos exames: Odontologia (consultar tabela), Ultrassonografia; Tomografia Computadorizada; Ressonância Magnética; Ecocardiograma; Teste ergométrico; Endoscopia Digestiva Alta; Pacotes de Fisioterapia/RPG/Acupuntura
APÓS O PAGAMENTO DA 6ª MENSALIDADE:
Gratuidade em exames laboratoriais, como: Ácido Úrico; Hemograma Completo; Glicose; EAS; Lipidograma; Parasitológico de fezes (EPF);
ANUALMENTE, será concedida a realização de 1 (um) exame por contrato (titular): Preventivo; Mamografia ou USG da Mama; PSA ou USG da Próstata; Densitometria Óssea; Eletrocardiograma (ECG) e Raio-X do tórax PA/PERFIL.

CLÁUSULA TERCEIRA: DO PAGAMENTO
No ato da adesão, serão cobrados além da primeira parcela, uma taxa de adesão de acordo com o número de ASSOCIADOS. A taxa corresponde ao custo de despesas administrativas para a confecção de carnê, carteirinha, etc.
Parágrafo Primeiro: O valor do cartão consulta poderá ser pago à vista para utilização de um período anual, com 10% de desconto, ou ser parcelado em 12 vezes pelo valor integral do contrato, através de carnê, que será pago em dinheiro na sede da CONTRATADA.
Parágrafo Segundo: Os ASSOCIADOS farão o pagamento mensal das parcelas, bem como, o valor da taxa de franquia, de acordo com a tabela disponibilizada pela CONTRATADA na sede de atendimento, referente às especialidades descritas na Cláusula Primeira e seus parágrafos;
Parágrafo Terceiro: Não haverá devolução das importâncias pagas, ainda que não utilizados os benefícios;
Parágrafo Quarto: O valor da mensalidade será reajustado todo mês de janeiro, de acordo com o Índice de Variação de Custos Médicos Hospitalares (VCMH);
Parágrafo Quinto: O pagamento deverá ser efetuado sempre na data do vencimento, com tolerância de 5 (cinco) dias corridos, no caso de atraso, serão cobrados multa de 10% (dez por cento), além de juros de 0,033% ao dia.

CLÁUSULA QUARTA: DO ATENDIMENTO POR TELEMEDICINA
O titular e seus dependentes, devidamente cadastrados, terão direito ao benefício para o atendimento por telemedicina, conforme os termos e condições estabelecidos neste contrato.
Parágrafo Primeiro: A Telemedicina refere-se a prestação de serviço, via internet, por videoconferência, para situações clínicas agudas de baixa complexidade.
Parágrafo Segundo: Momentaneamente não haverá cobrança adicional na mensalidade do contrato pela disponibilização do serviço, entretanto, será aplicada uma franquia por cada atendimento realizado através do serviço de telemedicina, conforme a tabela de valores vigente no momento do atendimento.
As condições estabelecidas nesta cláusula não eximem o paciente do pagamento de quaisquer outros valores previstos no presente contrato, que sejam decorrentes de serviços adicionais ou procedimentos realizados durante a consulta por telemedicina
Parágrafo Terceiro: Os horários de atendimento serão realizados da seguinte forma.
As consultas realizadas durante o horário de funcionamento da clínica serão efetuadas por nossos profissionais de saúde, conforme os horários estabelecidos pela clínica.
As consultas realizadas fora do horário de funcionamento da clínica - incluindo períodos noturnos, finais de semana e feriados - serão prestadas por parceiro da contratada (Seguros Unimed), por meio de atendimento remoto na especialidade de Clínica Médica. O associado arcará com 50% do valor da consulta, conforme tabela contratual vigente, sendo o respectivo valor cobrado na próxima mensalidade. O acesso ao Pronto Atendimento Digital poderá ser feito pelo aplicativo Seguros Unimed ou pelo site https://paciente.conexasaude.com.br.
É importante destacar que o referido atendimento não se configura como um serviço de urgência ou emergência, mas sim, como uma extensão do atendimento regular em horários alternativos, voltado exclusivamente para consultas que possam ser conduzidas de forma remota e que não exijam intervenção imediata.
Parágrafo Quarto: Para a realização da consulta por telemedicina, o paciente deverá ter uma conexão estável à internet e um dispositivo com acesso à câmera de vídeo e som.
Parágrafo Quinto: O serviço NÃO contempla o acompanhamento de doenças crônicas, renovação de receitas contínuas, pedidos de exames de rotina ou a prescrição de medicamentos com controle de receita.
Parágrafo Sexto: Se durante o atendimento a contratada identificar a necessidade de buscar outros profissionais ou serviços de saúde não cobertos por este contrato, o paciente pode optar por seguir essa recomendação. Nesse caso, ele deverá procurar tais serviços e atendimentos por conta própria, com prestadores de sua escolha.
Parágrafo Sétimo: A contratada não é responsável por: (i) sugerir outras unidades de saúde ao paciente; (ii) realizar a transferência para essas unidades; (iii) garantir ou custear o atendimento em locais distintos; ou (iv) acompanhar o paciente na sua jornada para outra unidade. A responsabilidade por essas ações e seus custos é exclusivamente do contratante.
Parágrafo Oitavo: O contratante é responsável por garantir que seus dados de acesso sejam utilizados de forma adequada e não divulgados a terceiros.
Parágrafo Nono: O contratante poderá encaminhar dúvidas, solicitações e reclamações quanto ao "Atendimento Virtual" pelo telefone ou enviar mensagem para (21) 97377-5431 (resposta em até 48h).
Parágrafo Décimo: O contratante consente expressamente que seus dados pessoais fornecidos para esta contratação sejam utilizados pela contratada para enviar comunicações relacionadas ao contrato e para oferecer outros serviços de saúde que possam interessá-lo. O contratante pode revogar esse consentimento e interromper o recebimento de comunicações a qualquer momento, diretamente pelo mesmo canal em que as mensagens foram enviadas.
Parágrafo Décimo primeiro: A Policardmed não se responsabiliza por falhas no atendimento decorrentes de problemas técnicos no dispositivo do paciente, incluindo, falhas de conexão à internet, problemas de hardware ou software.

CLÁUSULA QUINTA: DO CLUBE DE DESCONTOS
O Clube de Descontos será disponibilizado como um benefício para os associados aos contratos de saúde.
Parágrafo Primeiro: Somente o titular do contrato de saúde terá direito ao benefício do Clube de Descontos e deverão estar devidamente cadastrados no aplicativo próprio do Clube Policardmed para usufruir dos benefícios oferecidos.
Parágrafo Segundo: Os beneficiários terão direito aos seguintes benefícios:
Descontos nas lojas cadastradas, com percentuais de desconto diferenciados de acordo com cada loja parceira.
Resgate de cashbacks, que serão disponibilizados por algumas lojas parceiras.
O resgate dos cashbacks deverão ser realizados dentro do próprio aplicativo do Clube Policardmed.
Parágrafo Terceiro: A Policardmed não assume qualquer responsabilidade pelo gerenciamento, validade, ou condições dos descontos e cashbacks, gerenciados única e exclusivamente pelas lojas parceiras, assim, qualquer questão ou reclamação, deverão ser diretamente tratadas com a loja parceira responsável pelo benefício em questão.
Parágrafo Quarto: A Policardmed não é responsável por danos que possam decorrer de uma administração inadequada dos serviços ou de falhas nos produtos oferecidos pelos seus parceiros.
Parágrafo Quinto: A Policardmed não tem controle sobre os preços praticados, os valores cobrados são de inteira responsabilidade dos parceiros e podem ser ajustados a qualquer momento.
A Policadmed obriga-se a: Manter a lista de parceiros e os produtos e serviços disponíveis sempre atualizados por meio do site https://clube.policardmed.com.
Parágrafo Sexto: Das condições gerais do benefício:
O Clube de Descontos, por se tratar de um serviço terceirizado, poderá ser encerrado ou ter suas condições modificadas a qualquer momento, sem a necessidade de comunicação prévia aos beneficiários.
No caso de tais alterações ou encerramento, o beneficiário terá o direito de rescindir o contrato, sem a imposição de quaisquer taxas adicionais, desde que todas as mensalidades do contrato vigente estejam devidamente quitadas até a data da rescisão.

CLÁUSULA SEXTA: DOS SEGUROS
A POLICARDMED, como intermediadora, oferece aos associados, de forma facultativa, benefícios assistenciais complementares por meio da Unimed e empresas parceiras, compreendendo auxílio-funeral, seguro de vida por acidente e telemedicina (em horários específicos). Tais benefícios têm caráter assistencial e securitário, não configurando plano de saúde, sendo regidos pelas condições gerais da Unimed e pela tabela de benefícios vigente.

CLÁUSULA SÉTIMA: DA RESPONSABILIDADE
A guarda do uso do cartão consulta é responsabilidade única do ASSOCIADO TITULAR, que deverá utilizá-lo e conservá-lo para que somente quem figure como titular ou dependente do cartão possa usufruir dos benefícios que o cartão oferece. Em caso de mau uso ou empréstimo do cartão fornecido, poderá o ASSOCIADO TITULAR ser civil e criminalmente responsabilizado.
Parágrafo Primeiro: Em caso de extravio ou roubo do cartão, o ASSOCIADO deverá avisar a administração do cartão consulta imediatamente, e por escrito, bem como, solicitar novo cartão, que terá um custo adicional de R$ 5,00 (cinco) reais;
Parágrafo Segundo: o ASSOCIADO TITULAR, é o único responsável contratual perante o Cartão Consulta, responsabilizando-se civil e criminalmente pelos pagamentos e informações prestadas, inclusive referentes aos ASSOCIADOS DEPENDENTES.

CLÁUSULA OITAVA: DA VIGÊNCIA E FORMA DE RESCISÃO
O presente contrato vigerá por tempo determinado de 12 (doze) meses, a partir da data de sua assinatura.
Parágrafo Primeiro: Caso uma das partes tenha a intenção de rescindir o presente contrato, deverá manifestar-se expressamente por meio de notificação escrita simples, indicando o motivo da rescisão, com antecedência mínima de 30 (trinta) dias do término do contrato. Em caso de rescisão antecipada, será aplicada multa no valor de 10% (por cento) sobre o total do contrato, devendo os cartões ser devolvidos no ato do distrato.
Parágrafo Segundo: Haverá seu cancelamento após 30 (trinta) dias de atraso no pagamento da parcela devida, podendo ser reabilitado com o pagamento do débito em até 10 (dez) dias após o seu cancelamento;
Parágrafo Terceiro: Não será permitida a compra de novo pacote (cartão) pelo mesmo grupo familiar em casos de inadimplência, entretanto, o paciente poderá utilizar normalmente os serviços oferecidos pela Clínica, mas sem os benefícios deste cartão.

CLÁUSULA NONA: DAS DISPOSIÇÕES GERAIS
Fica disposto neste presente contrato que:
O Cartão Consulta possibilita a inclusão de até 6 (seis) ASSOCIADOS, sendo um titular e cinco dependentes;
O ASSOCIADO TITULAR somente poderá incluir os pais, cônjuges e filhos como ASSOCIADOS DEPENDENTES;
Poderá ser acrescentado dependente a qualquer momento, com a ciência de que somente poderá haver exclusão do mesmo, com no mínimo 6 (seis) meses, e que o mesmo não poderá ser trocado por outro dependente;
Menores de idade somente poderão se consultar com a presença do responsável;
As consultas e exames podem ser realizadas por ordem de chegada ou por agendamento, a critério dos médicos;
O atendimento será realizado mediante apresentação do Cartão Consulta e de um documento de identificação com foto;
O horário de atendimento será realizado de segunda-feira a sexta-feira, em horário comercial, e sábados até às 12h.

CLÁUSULA DÉCIMA: DA PROTEÇÃO DE DADOS
Considerando a Lei de Proteção de Dados (LGPD), as partes se obrigam a observância e cumprimento das regras, inclusive no uso de dados pessoais sensíveis em relação aos clientes, como: dado pessoal sobre origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico, quando vinculado a uma pessoa natural, nos termos do artigo 5º da Lei 13.709/2018.
Parágrafo primeiro: As partes concordam que a coleta e tratamento de dados, sempre que possível e recomendável, observará o consentimento do cliente no fornecimento de dados, que deverá ser livre, informado, inequívoco e relacionado a uma determinada finalidade, o que será feito mediante aditivos e termos específicos, de acordo com a necessidade e/ou obrigação legal de coleta de dados, conforme o ANEXO I.
Parágrafo segundo: As partes se comprometem a correta conservação dos dados pessoais cadastrais e sensíveis do cliente, na vigência e após o seu eventual término para cumprimento de obrigação legal ou regulatória do controlador, respeitando os prazos previstos em leis e regulamentos, nos termos do artigo 16, I da Lei 13.079/2018.

CLÁUSULA DÉCIMA PRIMEIRA: DO FORO
As partes contratantes elegem o Foro da Comarca de São João de Meriti, com renúncia expressa de qualquer outro, por mais privilegiado que seja, para eventual solução de quaisquer questões decorrentes da execução deste contrato.

Assim acordados, assinam o presente Contrato, e declara o ASSOCIADO TITULAR que leu, compreendeu e concordou com todo o conteúdo do presente instrumento, responsabilizando-se por todos os dados informados.

São João de Meriti, {{DATA_HOJE}}.

________________________________________________________________________________
CONTRATANTE: POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI

________________________________________________________________________________
CONTRATADA: {{PACIENTE_NOME}} (ASSOCIADO TITULAR)


ANEXO I — TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS — ASSOCIADO TITULAR

{{PACIENTE_NOME}}, inscrito (a) no CPF sob n° {{PACIENTE_CPF}}, aqui denominado (a) como TITULAR, vem por meio deste, manifestar livre, informada e inequívoca autorização para o tratamento de dados pessoais e dados pessoais sensíveis, com finalidade determinada, para a empresa POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI, aqui denominada como CONTROLADOR, inscrita no CNPJ sob n°27.045.917/0001-69, de acordo a Lei n° 13.709/2018, conforme disposto neste termo.

DA COLETA E DA FINALIDADE DO TRATAMENTO DE DADOS
O tratamento dos dados pessoais e dados pessoais sensíveis, listados no presente termo, tem as seguintes finalidades específicas:

[ S ] [ N ] Coleta de dados pessoais para manutenção de cadastro e agendamento de consultas e exames, bem como para cumprir obrigações legais e regulatórias.
[ S ] [ N ] Coleta de dados sensíveis, referentes à saúde, para preenchimento da ficha de anamnese e prontuários médicos, necessários para evolução dos tratamentos e para apoiar na descrição do resultado e direcionamento no diagnóstico, e definir um prognóstico.
[ S ] [ N ] Coleta de dados para a prescrição de medicamentos.
[ S ] [ N ] Utilização dos dados para encaminhar correspondências e mensagens por meios físicos e digitais, abrangendo correio eletrônico (e-mail) e WhatsApp.
[ S ] [ N ] Utilizar dados cadastrais para a emissão de carnês de pagamento e emissão de notas fiscais.

Ressaltamos que é possível retirar, a qualquer tempo, o seu consentimento para o tratamento dos dados nas finalidades referidas neste Instrumento. Também será possível solicitar o acesso aos seus dados pessoais, bem como a sua retificação, eliminação, limitação do seu uso e a portabilidade dos seus dados.

Estou ciente e concordo com a utilização de meus dados pessoais pela POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI, para as finalidades citadas e autorizadas acima, o que faço expressamente por assinatura escrita ou digital, com validade jurídica.

São João de Meriti, {{DATA_HOJE}}.

_______________________________________________________________
Assinatura do ASSOCIADO TITULAR: {{PACIENTE_NOME}}
`;

  const corpo = applyTemplate(textoFixo, {
    CLINICA_NOME: _cl.nome ?? "",
    CLINICA_CNPJ: _cl.cnpj ?? "",
    CLINICA_ENDERECO: [_cl.endereco, _cl.cidade, _cl.estado].filter(Boolean).join(", "),
    CIDADE: _cl.cidade ?? "",
    PACIENTE_NOME: c.paciente_nome ?? "",
    PACIENTE_CPF: _pa.cpf ?? "",
    PACIENTE_NASCIMENTO: fmtData(_pa.data_nascimento),
    PACIENTE_ENDERECO: enderecoPaciente,
    PACIENTE_TELEFONE: _pa.telefone ?? "",
    PACIENTE_EMAIL: _pa.email ?? "",
    DATA_HOJE: fmtDataExtenso(new Date().toISOString()),
    ...depSlotVars,
  });

  const rawSig = (c as any).assinatura_svg as string | null | undefined;
  const sigOk =
    typeof rawSig === "string" &&
    /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(rawSig) &&
    rawSig.length < 2_000_000;
  const assinatura = sigOk
    ? `<img src="${esc(rawSig!)}" style="height:80px;max-width:300px" alt="assinatura"/>`
    : `<div style="height:80px;border-bottom:1px solid #000;width:300px"></div>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Contrato #${c.numero} - ${esc(c.paciente_nome)}</title>
<style>
@page { size: A4; margin: 18mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color:#000; line-height: 1.45; }
h1 { font-size: 14pt; text-align:center; margin: 0 0 4mm; }
.head { text-align:center; margin-bottom: 6mm; font-size: 10pt; }
pre.body { 
  white-space: pre-wrap; 
  font-family: inherit; 
  font-size: 11pt; 
  margin: 0; 
  page-break-inside: auto; 
  break-inside: auto; 
  word-wrap: break-word; 
}
.sig { margin-top: 14mm; display:flex; justify-content: space-around; gap:10mm; text-align:center; font-size: 10pt; }
.sig div { width:45%; }
.meta { margin-top: 6mm; font-size:9pt; color:#444; text-align:center; }
.numero { float:right; font-size:10pt; }
</style></head><body>
<div class="head">
<strong>${esc(_cl.nome)}</strong><br/>
  ${esc([_cl.endereco, _cl.cidade, _cl.estado].filter(Boolean).join(" — "))}<br/>
  CNPJ: ${esc(_cl.cnpj ?? "")} — Tel.: ${esc(_cl.telefone ?? "")}
  <span class="numero">Contrato Nº ${c.numero}</span>
</div>
<pre class="body">${esc(corpo)}</pre>
<div class="sig">
  <div>____________________________<br/>${esc(_cl.nome)}</div>
  <div>${assinatura}<br/>${esc(c.paciente_nome)}</div>
</div>
${(c as any).assinado_em ? `<div class="meta">Assinado digitalmente em ${fmtData((c as any).assinado_em)} — IP: ${esc((c as any).assinatura_ip ?? "—")}</div>` : ""}
<script>window.onload=()=>{setTimeout(()=>{window.print();},300);};</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error("Bloqueador de pop-up impediu a impressão");
  w.document.open();
  w.document.write(html);
  w.document.close();
}
