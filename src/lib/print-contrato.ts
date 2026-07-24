import { supabase } from "@/integrations/supabase/client";
import { CONTRATO_MJ_CARTAO_CONSULTA_SEGUROS } from "./contract-templates/menino-jesus-cartao-consulta-seguros";
import contratoPdfAsset from "@/assets/contrato-cartao-consulta-seguros.pdf.asset.json";

// Override por convênio para PDF estático (sem preenchimento automático).
// O PDF em branco é aberto em iframe e disparada a impressão.
const CONVENIO_PDF_OVERRIDES: Record<string, string> = {
  // POLICLINICA MENINO JESUS — CARTÃO CONSULTA + SEGUROS
  "4fdce541-5b2b-4816-ba7d-911b36741b7d": contratoPdfAsset.url,
};

const soDig = (s?: string | null) => (s ?? "").replace(/\D/g, "");

const fmtCPF = (s?: string | null) => {
  const d = soDig(s);
  if (d.length !== 11) return s ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const fmtCEP = (s?: string | null) => {
  const d = soDig(s);
  if (d.length !== 8) return s ?? "";
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

const fmtTelefone = (s?: string | null) => {
  const d = soDig(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s ?? "";
};

// Override por convênio: quando o convênio corresponder a um destes IDs,
// o modelo hard-coded (fiel ao PDF original) prevalece sobre o modelo salvo no banco.
export const CONVENIO_TEMPLATE_OVERRIDES: Record<string, string> = {
  // POLICLINICA MENINO JESUS — CARTÃO CONSULTA + SEGUROS
  "4fdce541-5b2b-4816-ba7d-911b36741b7d": CONTRATO_MJ_CARTAO_CONSULTA_SEGUROS,
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const fmtData = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
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
  return out.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const raw = vars[k] ?? "";
    const safe = esc(raw);
    // Reduz o tamanho real da fonte (não só o transform visual) para os
    // valores longos caberem na coluna dos templates absolutos.
    const len = raw.length;
    if (len <= 20) return safe;
    const pct = len > 42 ? 62 : len > 36 ? 68 : len > 30 ? 75 : len > 26 ? 82 : 90;
    return `<span style="font-size:${pct}%;letter-spacing:-0.02em;white-space:nowrap;">${safe}</span>`;
  });
}

// 🔥 HTML DO CONTRATO - COMPLETO
const TEXTO_CONTRATO_HTML = `
<div style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; color: #1a1a1a; max-width: 210mm; margin: 0 auto; padding: 20px;">

  <div style="text-align: center; border-bottom: 3px double #1a3a6b; padding-bottom: 20px; margin-bottom: 20px;">
    <h1 style="font-size: 18pt; font-weight: bold; color: #1a3a6b; text-transform: uppercase; margin: 0;">INSTRUMENTO PARTICULAR DE CONTRATO</h1>
    <h2 style="font-size: 14pt; font-weight: bold; color: #1a3a6b; margin: 5px 0 0 0;">"CARTÃO CONSULTA + SEGUROS"</h2>
  </div>

  <p style="text-align: justify; text-indent: 2em;">Pelo presente instrumento, e na melhor forma de Direito, os signatários:</p>

  <div style="padding: 10px 0; margin: 12px 0;">
    <p style="margin: 0 0 8px 0;"><strong>CONTRATADA: POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI</strong></p>
    <p style="margin: 4px 0;"><strong>CNPJ:</strong> 27.045.917/0001-69</p>
    <p style="margin: 4px 0;"><strong>Endereço:</strong> Rua Expedicionários, nº 148</p>
    <p style="margin: 4px 0;"><strong>Bairro:</strong> Centro | <strong>Cidade:</strong> São João de Meriti - RJ</p>
    <p style="margin: 4px 0;"><strong>CEP:</strong> 25.520-591</p>
  </div>

  <div style="padding: 10px 0; margin: 12px 0;">
    <p style="margin: 0 0 8px 0;"><strong>CONTRATANTE: ASSOCIADO TITULAR</strong></p>
    <p style="margin: 4px 0;"><strong>Nome:</strong> {{PACIENTE_NOME}}</p>
    <p style="margin: 4px 0;"><strong>CPF:</strong> {{PACIENTE_CPF}}</p>
    <p style="margin: 4px 0;"><strong>Nascimento:</strong> {{PACIENTE_NASCIMENTO}}</p>
    <p style="margin: 4px 0;"><strong>Endereço:</strong> {{PACIENTE_ENDERECO}}</p>
    <p style="margin: 4px 0;"><strong>Telefone:</strong> {{PACIENTE_TELEFONE}}</p>
    <p style="margin: 4px 0;"><strong>E-mail:</strong> {{PACIENTE_EMAIL}}</p>
    <p style="margin: 4px 0;"><strong>Vencimento:</strong> {{DATA_HOJE}}</p>
  </div>

  <div style="padding: 10px 0; margin: 12px 0;">
    <p style="margin: 0 0 8px 0;"><strong>ASSOCIADOS DEPENDENTES</strong></p>
    <table style="width: 100%; border-collapse: collapse; font-size: 11pt;">
      <thead>
        <tr>
          <th style="border-bottom: 1px solid #999; padding: 6px 8px; text-align: left;">#</th>
          <th style="border-bottom: 1px solid #999; padding: 6px 8px; text-align: left;">Nome</th>
          <th style="border-bottom: 1px solid #999; padding: 6px 8px; text-align: left;">Nascimento</th>
          <th style="border-bottom: 1px solid #999; padding: 6px 8px; text-align: left;">Parentesco</th>
          <th style="border-bottom: 1px solid #999; padding: 6px 8px; text-align: left;">Telefone</th>
        </tr>
      </thead>
      <tbody>
        {{#DEPENDENTE_1}}
        <tr>
          <td style="padding: 6px 8px;">1</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_1}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_1_NASCIMENTO}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_1_PARENTESCO}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_1_TELEFONE}}</td>
        </tr>
        {{/DEPENDENTE_1}}
        {{#DEPENDENTE_2}}
        <tr>
          <td style="padding: 6px 8px;">2</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_2}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_2_NASCIMENTO}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_2_PARENTESCO}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_2_TELEFONE}}</td>
        </tr>
        {{/DEPENDENTE_2}}
        {{#DEPENDENTE_3}}
        <tr>
          <td style="padding: 6px 8px;">3</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_3}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_3_NASCIMENTO}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_3_PARENTESCO}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_3_TELEFONE}}</td>
        </tr>
        {{/DEPENDENTE_3}}
        {{#DEPENDENTE_4}}
        <tr>
          <td style="padding: 6px 8px;">4</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_4}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_4_NASCIMENTO}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_4_PARENTESCO}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_4_TELEFONE}}</td>
        </tr>
        {{/DEPENDENTE_4}}
        {{#DEPENDENTE_5}}
        <tr>
          <td style="padding: 6px 8px;">5</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_5}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_5_NASCIMENTO}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_5_PARENTESCO}}</td>
          <td style="padding: 6px 8px;">{{DEPENDENTE_5_TELEFONE}}</td>
        </tr>
        {{/DEPENDENTE_5}}
      </tbody>
    </table>
  </div>

  <h3 style="font-size: 13pt; font-weight: bold; color: #1a3a6b; border-bottom: 2px solid #1a3a6b; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA PRIMEIRA: DO OBJETO</h3>
  <p style="text-align: justify; text-indent: 2em;">O objeto do contrato consiste em serviços médicos prestados pela CONTRATADA, da seguinte forma:</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>I. APÓS O PAGAMENTO DA 1ª MENSALIDADE E TAXA DE INSCRIÇÃO:</strong> O cliente realizará <strong>CONSULTAS CLÍNICAS SEM CARÊNCIA</strong> referentes às especialidades de: Angiologia, Cardiologia, Clínica Médica, Dermatologia, Endocrinologia, Gastroenterologia, Geriatria, Ginecologia, Ortopedia, Otorrinolaringologia, Obstetrícia, Pediatria e Urologia.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Primeiro:</strong> O cliente terá desconto e pagará o valor de consulta, de acordo com a tabela disponibilizada pela CONTRATADA na sede de atendimento, para as seguintes especialidades: Alergologia, Cardiologia Infantil, Endocrinologia Infantil, Fonoaudiologia, Mastologia, Nefrologia, Neurologia, Nutrição, Oftalmologia, Podologia, Pneumologia, Proctologia, Psiquiatria, Psicologia e Reumatologia.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Segundo:</strong> <u>NÃO ESTÁ COBERTO POR ESTE CARTÃO CONSULTA OS SEGUINTES SERVIÇOS</u>: Procedimentos, pequenas cirurgias, anestesias, estética, revisão, risco cirúrgico, exame ocupacional; Laudo para INSS e CONCURSOS PÚBLICOS.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Terceiro:</strong> Os Associados ficam cientes de que <strong>não estão aderindo a um plano de saúde</strong>, mas a um serviço de operacionalização de descontos e benefícios aos consumidores aderentes.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Quarto:</strong> A <strong>CONTRATADA NÃO POSSUI EMERGÊNCIA, SERVIÇOS DE INTERNAÇÃO, NEM ATENDIMENTO 24 HORAS.</strong></p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Quinto:</strong> <strong>HAVERÁ LIMITE DE (1) UMA CONSULTA DIÁRIA POR CONTRATO.</strong></p>

  <h3 style="font-size: 13pt; font-weight: bold; color: #1a3a6b; border-bottom: 2px solid #1a3a6b; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA SEGUNDA: DOS BENEFÍCIOS</h3>
  <p style="text-align: justify; text-indent: 2em;">Após o pagamento de algumas mensalidades os ASSOCIADOS terão direito aos seguintes serviços de saúde:</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>I. APÓS A 1ª MENSALIDADE:</strong> Gratuidade para verificação de peso e pressão.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>II. APÓS A 2ª MENSALIDADE:</strong></p>
  <ul style="margin-left: 4em; text-align: justify;">
    <li><strong>10% de desconto</strong> nos exames: Laboratoriais; Eletrocardiograma; Raio X; Preventivo; Mamografia; Densitometria óssea;</li>
    <li><strong>5% de desconto</strong> nos exames: Odontologia (consultar tabela), Ultrassonografia; Tomografia Computadorizada; Ressonância Magnética; Ecocardiograma; Teste ergométrico; Endoscopia Digestiva Alta; Pacotes de Fisioterapia/RPG/Acupuntura</li>
  </ul>
  <p style="text-align: justify; text-indent: 2em;"><strong>III. APÓS O PAGAMENTO DA 6ª MENSALIDADE:</strong></p>
  <ul style="margin-left: 4em; text-align: justify;">
    <li><strong>Gratuidade em exames laboratoriais</strong>, como: Ácido Úrico; Hemograma Completo; Glicose; EAS; Lipidograma; Parasitológico de fezes (EPF);</li>
    <li><strong>ANUALMENTE</strong>, será concedida a realização de 1 (um) exame por contrato (titular): Preventivo; Mamografia ou USG da Mama; PSA ou USG da Próstata; Densitometria Óssea; Eletrocardiograma (ECG) e Raio-X do tórax PA/PERFIL.</li>
  </ul>

  <h3 style="font-size: 13pt; font-weight: bold; color: #1a3a6b; border-bottom: 2px solid #1a3a6b; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA TERCEIRA: DO PAGAMENTO</h3>
  <p style="text-align: justify; text-indent: 2em;">No ato da adesão, serão cobrados além da primeira parcela, uma taxa de adesão de acordo com o número de ASSOCIADOS. A taxa corresponde ao custo de despesas administrativas para a confecção de carnê, carteirinha, etc.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Primeiro:</strong> O valor do cartão consulta poderá ser pago à vista para utilização de um período anual, com 10% de desconto, ou ser parcelado em 12 vezes pelo valor integral do contrato, através de carnê, que será pago em dinheiro na sede da CONTRATADA.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Segundo:</strong> Os ASSOCIADOS farão o pagamento mensal das parcelas, bem como, o valor da taxa de franquia, de acordo com a tabela disponibilizada pela CONTRATADA na sede de atendimento, referente às especialidades descritas na Cláusula Primeira e seus parágrafos.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Terceiro:</strong> Não haverá devolução das importâncias pagas, ainda que não utilizados os benefícios.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Quarto:</strong> O valor da mensalidade será reajustado todo mês de janeiro, de acordo com o Índice de Variação de Custos Médicos Hospitalares (VCMH).</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Quinto:</strong> O pagamento deverá ser efetuado sempre na data do vencimento, com tolerância de 5 (cinco) dias corridos, no caso de atraso, serão cobrados multa de 10% (dez por cento), além de juros de 0,033% ao dia.</p>

  <h3 style="font-size: 13pt; font-weight: bold; color: #1a3a6b; border-bottom: 2px solid #1a3a6b; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA QUARTA: DO ATENDIMENTO POR TELEMEDICINA</h3>
  <p style="text-align: justify; text-indent: 2em;">O titular e seus dependentes, devidamente cadastrados, terão direito ao benefício para o atendimento por telemedicina, conforme os termos e condições estabelecidos neste contrato.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Primeiro:</strong> A Telemedicina refere-se a prestação de serviço, via internet, por videoconferência, para <strong>situações clínicas agudas de baixa complexidade</strong>.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Segundo:</strong> Momentaneamente não haverá cobrança adicional na mensalidade do contrato pela disponibilização do serviço, entretanto, <strong>será aplicada uma franquia por cada atendimento realizado</strong> através do serviço de telemedicina, conforme a tabela de valores vigente no momento do atendimento.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Terceiro:</strong> Os horários de atendimento serão realizados da seguinte forma:</p>
  <ul style="margin-left: 4em; text-align: justify;">
    <li>As consultas realizadas durante o horário de funcionamento da clínica serão efetuadas por nossos profissionais de saúde, conforme os horários estabelecidos pela clínica.</li>
    <li>As consultas realizadas fora do horário de funcionamento da clínica - incluindo períodos noturnos, finais de semana e feriados - serão prestadas por parceiro da contratada (Seguros Unimed), por meio de atendimento remoto na especialidade de Clínica Médica. <strong>O associado arcará com 50% do valor da consulta, conforme tabela contratual vigente, sendo o respectivo valor cobrado na próxima mensalidade</strong>.</li>
  </ul>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Quarto:</strong> Para a realização da consulta por telemedicina, o paciente deverá ter uma conexão estável à internet e um dispositivo com acesso à câmera de vídeo e som.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Quinto:</strong> <strong>O serviço NÃO contempla o acompanhamento de doenças crônicas, renovação de receitas contínuas, pedidos de exames de rotina ou a prescrição de medicamentos com controle de receita.</strong></p>

  <h3 style="font-size: 13pt; font-weight: bold; color: #1a3a6b; border-bottom: 2px solid #1a3a6b; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA QUINTA: DO CLUBE DE DESCONTOS</h3>
  <p style="text-align: justify; text-indent: 2em;">O Clube de Descontos será disponibilizado como um <strong>benefício</strong> para os associados aos <strong>contratos</strong> de saúde.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Primeiro:</strong> Somente o <strong>titular</strong> do contrato de saúde terá direito ao benefício do Clube de Descontos e deverão estar devidamente <strong>cadastrados no aplicativo</strong> próprio do Clube Policardmed para usufruir dos benefícios oferecidos.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Segundo:</strong> Os beneficiários terão direito aos seguintes benefícios:</p>
  <ul style="margin-left: 4em; text-align: justify;">
    <li><strong>Descontos</strong> nas lojas cadastradas, com percentuais de desconto diferenciados de acordo com cada loja parceira.</li>
    <li><strong>Resgate de cashbacks</strong>, que serão disponibilizados por algumas lojas parceiras.</li>
  </ul>

  <h3 style="font-size: 13pt; font-weight: bold; color: #1a3a6b; border-bottom: 2px solid #1a3a6b; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA SEXTA: DOS SEGUROS</h3>
  <p style="text-align: justify; text-indent: 2em;">A POLICARDMED, como intermediadora, <strong>oferece aos associados, de forma facultativa, benefícios assistenciais complementares por meio da Unimed e empresas parceiras, compreendendo auxílio-funeral, seguro de vida por acidente e telemedicina (em horários específicos).</strong> Tais benefícios têm caráter assistencial e securitário, não configurando plano de saúde, <strong>sendo regidos pelas condições gerais da Unimed e pela tabela de benefícios vigente.</strong></p>

  <h3 style="font-size: 13pt; font-weight: bold; color: #1a3a6b; border-bottom: 2px solid #1a3a6b; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA SÉTIMA: DA RESPONSABILIDADE</h3>
  <p style="text-align: justify; text-indent: 2em;">A guarda do uso do cartão consulta é responsabilidade única do ASSOCIADO TITULAR, que deverá utilizá-lo e conservá-lo para que somente quem figure como titular ou dependente do cartão possa usufruir dos benefícios que o cartão oferece. Em caso de mau uso ou empréstimo do cartão fornecido, poderá o ASSOCIADO TITULAR ser civil e criminalmente responsabilizado.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Primeiro:</strong> Em caso de extravio ou roubo do cartão, o ASSOCIADO deverá avisar a administração do cartão consulta imediatamente, e por escrito, bem como, solicitar novo cartão, que terá um custo adicional de R$ 5,00 (cinco) reais.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Segundo:</strong> O ASSOCIADO TITULAR, é o único responsável contratual perante o Cartão Consulta, responsabilizando-se civil e criminalmente pelos pagamentos e informações prestadas, inclusive referentes aos ASSOCIADOS DEPENDENTES.</p>

  <h3 style="font-size: 13pt; font-weight: bold; color: #1a3a6b; border-bottom: 2px solid #1a3a6b; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA OITAVA: DA VIGÊNCIA E FORMA DE RESCISÃO</h3>
  <p style="text-align: justify; text-indent: 2em;">O presente contrato vigerá por <strong>tempo determinado de 12 (doze) meses</strong>, a partir da data de sua assinatura.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Primeiro:</strong> Caso uma das partes tenha a intenção de rescindir o presente contrato, deverá manifestar-se expressamente por meio de notificação escrita simples, indicando o motivo da rescisão, <strong>com antecedência mínima de 30 (trinta) dias do término do contrato</strong>. Em caso de rescisão antecipada, será <strong>aplicada multa no valor de 10% (por cento) sobre o total do contrato</strong>, devendo os cartões ser devolvidos no ato do distrato.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Segundo:</strong> Haverá seu cancelamento após 30 (trinta) dias de atraso no pagamento da parcela devida, podendo ser reabilitado com o pagamento do débito em até 10 (dez) dias após o seu cancelamento.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Terceiro:</strong> Não será permitida a compra de novo pacote (cartão) pelo mesmo grupo familiar em casos de inadimplência, entretanto, o paciente poderá utilizar normalmente os serviços oferecidos pela Clínica, mas sem os benefícios deste cartão.</p>

  <h3 style="font-size: 13pt; font-weight: bold; color: #1a3a6b; border-bottom: 2px solid #1a3a6b; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA NONA: DAS DISPOSIÇÕES GERAIS</h3>
  <p style="text-align: justify; text-indent: 2em;">Fica disposto neste presente contrato que:</p>
  <ul style="margin-left: 4em; text-align: justify;">
    <li>O Cartão Consulta possibilita a inclusão de até 6 (seis) ASSOCIADOS, sendo um titular e cinco dependentes.</li>
    <li>O ASSOCIADO TITULAR somente poderá incluir os pais, cônjuges e filhos como ASSOCIADOS DEPENDENTES.</li>
    <li>Poderá ser acrescentado dependente a qualquer momento, com a ciência de que somente poderá haver exclusão do mesmo, com no mínimo 6 (seis) meses, e que o mesmo não poderá ser trocado por outro dependente.</li>
    <li>Menores de idade somente poderão se consultar com a presença do responsável.</li>
    <li>As consultas e exames podem ser realizadas por ordem de chegada ou por agendamento, a critério dos médicos.</li>
    <li>O atendimento será realizado mediante apresentação do Cartão Consulta e de um documento de identificação com foto.</li>
    <li>O horário de atendimento será realizado de segunda-feira a sexta-feira, em horário comercial, e sábados até às 12h.</li>
  </ul>

  <h3 style="font-size: 13pt; font-weight: bold; color: #1a3a6b; border-bottom: 2px solid #1a3a6b; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA DÉCIMA: DA PROTEÇÃO DE DADOS</h3>
  <p style="text-align: justify; text-indent: 2em;">Considerando a Lei de Proteção de Dados (LGPD), as partes se obrigam a observância e cumprimento das regras, inclusive no uso de <strong>dados pessoais sensíveis</strong> em relação aos clientes, como: dado pessoal sobre origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico, quando vinculado a uma pessoa natural, nos termos do artigo 5º da Lei 13.709/2018.</p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Primeiro:</strong> As partes concordam que a coleta e tratamento de dados, sempre que possível e recomendável, observará o <strong>consentimento</strong> do cliente no fornecimento de dados, que deverá ser livre, informado, inequívoco e relacionado a uma determinada finalidade, o que será feito mediante aditivos e termos específicos, de acordo com a necessidade e/ou obrigação legal de coleta de dados, conforme o <strong>ANEXO I.</strong></p>
  <p style="text-align: justify; text-indent: 2em;"><strong>Parágrafo Segundo:</strong> As partes se comprometem a correta conservação dos dados pessoais cadastrais e sensíveis do cliente, na vigência e após o seu eventual término para cumprimento de obrigação legal ou regulatória do controlador, respeitando os prazos previstos em leis e regulamentos, nos termos do artigo 16, I da Lei 13.079/2018.</p>

  <h3 style="font-size: 13pt; font-weight: bold; color: #1a3a6b; border-bottom: 2px solid #1a3a6b; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA DÉCIMA PRIMEIRA: DO FORO</h3>
  <p style="text-align: justify; text-indent: 2em;">As partes contratantes elegem o <strong>Foro da Comarca de São João de Meriti</strong>, com renúncia expressa de qualquer outro, por mais privilegiado que seja, para eventual solução de quaisquer questões decorrentes da execução deste contrato.</p>

  <p style="text-align: justify; text-indent: 2em; margin-top: 25px;">Assim acordados, assinam o presente Contrato, e declara o ASSOCIADO TITULAR que leu, compreendeu e concordou com todo o conteúdo do presente instrumento, responsabilizando-se por todos os dados informados.</p>

  <div style="text-align: center; margin-top: 40px; border-top: 2px solid #1a3a6b; padding-top: 25px;">
    <p style="font-weight: bold; font-size: 12pt;">São João de Meriti, {{DATA_HOJE}}</p>
    <br><br><br>
    <p style="font-weight: bold; text-decoration: underline; font-size: 12pt;">_________________________________________</p>
    <p style="font-weight: bold; font-size: 12pt;">CONTRATANTE: POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI</p>
    <br><br><br>
    <p style="font-weight: bold; text-decoration: underline; font-size: 12pt;">_________________________________________</p>
    <p style="font-weight: bold; font-size: 12pt;">CONTRATADA: {{PACIENTE_NOME}} (ASSOCIADO TITULAR)</p>
  </div>

</div>
`;

export async function printContrato(contratoId: string) {
  const { data: c, error } = await supabase.from("contratos_assinatura").select("*").eq("id", contratoId).maybeSingle();
  if (error || !c) throw new Error(error?.message ?? "Contrato não encontrado");

  // PDF estático por convênio: abre o PDF em iframe e imprime, sem renderizar HTML.
  const pdfOverrideUrl = (c as any).convenio_id
    ? CONVENIO_PDF_OVERRIDES[(c as any).convenio_id]
    : null;
  if (pdfOverrideUrl) {
    // Navegadores modernos (Chrome/Edge) não permitem chamar print() no
    // visualizador de PDF embutido em iframe oculto — a chamada silenciosa
    // não faz nada. Abrimos o PDF em uma nova aba: o próprio visualizador
    // do navegador tem o botão de imprimir e o usuário controla o fechamento.
    const w = window.open(pdfOverrideUrl, "_blank", "noopener,noreferrer");
    if (!w) {
      // Pop-up bloqueado: força download/abertura via link temporário
      const a = document.createElement("a");
      a.href = pdfOverrideUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    return;
  }

  const { data: cl } = await supabase
    .from("clinicas")
    .select("nome, cnpj, endereco, cidade, estado, telefone")
    .eq("id", (c as any).clinica_id)
    .maybeSingle();

  const { data: pl } = (c as any).plano_id
    ? await supabase
        .from("planos_assinatura")
        .select("template_contrato")
        .eq("id", (c as any).plano_id)
        .maybeSingle()
    : { data: null as any };

  const { data: cv } = (c as any).convenio_id
    ? await supabase
        .from("cb_convenios")
        .select("modelo_contrato")
        .eq("id", (c as any).convenio_id)
        .maybeSingle()
    : { data: null as any };

  const { data: pa } = await supabase
    .from("pacientes")
    .select("cpf, data_nascimento, telefone, email, logradouro, numero, bairro, cidade, estado, cep")
    .eq("id", (c as any).paciente_id)
    .maybeSingle();

  const { data: depsRaw } = await supabase
    .from("contrato_dependentes")
    .select("*")
    .eq("contrato_id", contratoId)
    .eq("ativo", true);

  const deps = depsRaw ?? [];

  const _cl: any = cl ?? {};
  const _pa: any = pa ?? {};

  const enderecoPaciente = [
    _pa.logradouro,
    _pa.numero,
    _pa.bairro,
    _pa.cidade && _pa.estado ? `${_pa.cidade}-${_pa.estado}` : _pa.cidade,
  ].filter(Boolean).join(", ");

  const pids = deps.map((d: any) => d.paciente_id).filter(Boolean);
  let pacsMap: Record<string, any> = {};
  if (pids.length > 0) {
    const { data: pacsData } = await supabase
      .from("pacientes")
      .select("id, cpf, data_nascimento, telefone")
      .in("id", pids);
    if (pacsData) {
      pacsData.forEach((p: any) => { pacsMap[p.id] = p; });
    }
  }

  const depSlotVars: Record<string, string> = {};
  for (let i = 0; i < 5; i++) {
    const d: any = deps[i];
    const pac: any = d ? pacsMap[d.paciente_id] : null;
    const idx = i + 1;
    depSlotVars[`DEPENDENTE_${idx}`] = d?.paciente_nome ?? "";
    depSlotVars[`DEPENDENTE_${idx}_PARENTESCO`] = d?.parentesco ?? "";
    depSlotVars[`DEPENDENTE_${idx}_CPF`] = fmtCPF(pac?.cpf);
    depSlotVars[`DEPENDENTE_${idx}_NASCIMENTO`] = pac?.data_nascimento ? fmtData(pac.data_nascimento) : "";
    depSlotVars[`DEPENDENTE_${idx}_TELEFONE`] = fmtTelefone(pac?.telefone ?? d?.telefone);
  }

  const plTpl = (pl as any)?.template_contrato;
  const cvTpl = (cv as any)?.modelo_contrato;
  const pick = (v: any) => (v && String(v).replace(/<[^>]+>/g, "").trim().length > 0 ? v : null);
  const overrideTpl = (c as any).convenio_id
    ? CONVENIO_TEMPLATE_OVERRIDES[(c as any).convenio_id]
    : null;
  const templateBody = overrideTpl ?? pick(plTpl) ?? pick(cvTpl) ?? TEXTO_CONTRATO_HTML;

  const corpo = applyTemplate(templateBody, {
    PACIENTE_NOME: c.paciente_nome ?? "",
    PACIENTE_CPF: fmtCPF(_pa.cpf),
    PACIENTE_NASCIMENTO: fmtData(_pa.data_nascimento),
    PACIENTE_ENDERECO: enderecoPaciente,
    PACIENTE_LOGRADOURO: _pa.logradouro ?? "",
    PACIENTE_NUMERO: _pa.numero ?? "",
    PACIENTE_BAIRRO: _pa.bairro ?? "",
    PACIENTE_CIDADE: _pa.cidade ?? "",
    PACIENTE_ESTADO: _pa.estado ?? "",
    PACIENTE_CEP: fmtCEP(_pa.cep),
    PACIENTE_TELEFONE: fmtTelefone(_pa.telefone),
    PACIENTE_EMAIL: _pa.email ?? "",
    DATA_HOJE: fmtDataExtenso(new Date().toISOString()),
    ...depSlotVars,
  });

  const isFullHtml = /<!doctype\s+html|<html[\s>]/i.test(corpo);

  const bodyHtml = isFullHtml
    ? corpo
    : `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Contrato #${c.numero} - ${esc(c.paciente_nome)}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #1a1a1a; line-height: 1.6; background: white; max-width: 210mm; margin: 0 auto; padding: 20px; }
  h1 { font-size: 18pt; }
  h2 { font-size: 14pt; }
  h3 { font-size: 13pt; color: #1a3a6b; border-bottom: 2px solid #1a3a6b; padding-bottom: 5px; margin-top: 25px; }
  table { width: 100%; border-collapse: collapse; font-size: 11pt; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #e8e8e8; }
  ul { margin-left: 4em; text-align: justify; }
</style>
</head><body>
${corpo}
</body></html>`;

  // Remove qualquer auto-print embutido no template — vamos disparar via iframe.
  const cleanHtml = bodyHtml.replace(
    /<script[^>]*>[\s\S]*?window\.print\([\s\S]*?<\/script>/gi,
    "",
  );

  // Iframe invisível: imprime sem bloquear a janela mãe e é removido ao final.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);

  const cleanup = () => {
    try { iframe.parentNode?.removeChild(iframe); } catch { /* noop */ }
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) { cleanup(); return; }
    // Aguarda o layout/imagens antes de imprimir.
    setTimeout(() => {
      try {
        win.onafterprint = () => setTimeout(cleanup, 100);
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
      // Fallback: remove o iframe mesmo se onafterprint não disparar.
      setTimeout(cleanup, 60_000);
    }, 350);
  };

  const doc = iframe.contentDocument;
  if (!doc) { cleanup(); throw new Error("Não foi possível preparar a impressão"); }
  doc.open();
  doc.write(cleanHtml);
  doc.close();
}