const NAVY = "#1f3864";
const RED = "#c00000";
const FONT = "font-family:'Times New Roman',Times,serif";
const BD = `border:1pt solid ${NAVY};padding:6px`;
const TD = `${BD};text-align:center`;

export const INFORMATIVO_CARTAO_CONSULTA_SEGUROS_HTML = `
<div style="${FONT};font-size:11pt;color:#000">
<p style="text-align:center;margin:0 0 6px 0">
  <img src="/cartao-beneficios/logo-policardmed.png" alt="Policardmed" style="height:70px;display:inline-block;vertical-align:middle;margin-right:24px" />
  <img src="/cartao-beneficios/logo-menino-jesus.png" alt="Policlínica Menino Jesus" style="height:85px;display:inline-block;vertical-align:middle" />
</p>
<h2 style="text-align:center;${FONT};margin:8px 0 14px 0;font-size:16pt"><span style="color:${RED}"><em><strong>*NÃO POSSUI EMERGÊNCIA, SERVIÇOS DE INTERNAÇÃO*</strong></em></span></h2>
<table style="width:100%;border-collapse:collapse;border:1.5pt solid ${NAVY};${FONT}">
  <tbody>
    <tr>
      <th colspan="2" style="background-color:${NAVY};${TD}"><span style="color:#ffffff;font-size:14pt"><strong>CARTÃO CONSULTA + SEGUROS</strong></span></th>
      <th rowspan="8" style="background-color:#ffffff;${TD};vertical-align:middle;width:32%"><p style="margin:0;font-size:13pt"><strong>TAXA DE ADESÃO ÚNICA</strong></p><p style="margin:8px 0 0 0;font-size:14pt"><strong>R$ 30,00</strong></p></th>
    </tr>
    <tr>
      <th style="${TD}"><strong>MODALIDADE</strong></th>
      <th style="${TD}"><strong>VALOR</strong></th>
    </tr>
    <tr><td style="${BD}">1 PESSOA</td><td style="${BD}">R$ 120,00</td></tr>
    <tr><td style="${BD}">2 PESSOAS</td><td style="${BD}">R$ 175,00</td></tr>
    <tr><td style="${BD}">3 PESSOAS</td><td style="${BD}">R$ 210,00</td></tr>
    <tr><td style="${BD}">4 PESSOAS</td><td style="${BD}">R$ 245,00</td></tr>
    <tr><td style="${BD}">5 PESSOAS</td><td style="${BD}">R$ 280,00</td></tr>
    <tr><td style="${BD}">6 PESSOAS</td><td style="${BD}">R$ 295,00</td></tr>
  </tbody>
</table>
<ul style="margin-top:10px">
  <li><strong>O Contrato é válido por 12 meses, prorrogado automaticamente após o vencimento;</strong></li>
  <li><strong>ASSOCIADO TITULAR somente poderá incluir cônjuges e filhos;</strong></li>
  <li><strong>O valor do cartão poderá ser pago à vista para utilização de um período anual, ou parcelado em 12 vezes no carnê ou boleto bancário (com acréscimo bancário de R$ 3,50 em cada boleto), sendo exclusivo, o pagamento no carnê por cartão de débito ou espécie, ou ainda, por cobrança recorrente no cartão de crédito.</strong></li>
</ul>
<p style="background-color:${NAVY};color:#ffffff;padding:6px 10px;margin:14px 0 10px 0;border:1pt solid ${NAVY}"><span style="color:#ffffff;font-size:13pt"><strong>CONDIÇÕES E BENEFÍCIOS</strong></span></p>
<h3><span style="color:${RED}"><strong><u>I. APÓS O PAGAMENTO DA 1ª MENSALIDADE E TAXA DE INSCRIÇÃO</u></strong></span></h3>
<ul>
  <li><strong>Gratuidade</strong> para verificação de peso e pressão;</li>
  <li><strong>Os ASSOCIADOS farão o pagamento mensal das parcelas, bem como, <span style="color:${RED}">o valor de R$ 9,99 (nove reais e noventa e nove centavos)</span> sendo pago no ato de cada consulta realizada referente às especialidades clínicas;</strong></li>
  <li><span style="color:${RED}"><strong>Atendimento em todas as especialidades médicas (consultas) sem carência;</strong></span></li>
  <li><span style="color:${RED}"><strong>Haverá limite de (1) uma consulta diária por contrato;</strong></span></li>
  <li><strong>CONSULTAS CLÍNICAS SEM CARÊNCIA</strong>: referentes às especialidades de: Angiologia, Cardiologia, Clínica Médica, Dermatologia, Endocrinologia, Gastroenterologia, Geriatria, Ginecologia, Ortopedia, Otorrinolaringologia, Obstetrícia, Pediatria e Urologia;</li>
  <li><strong>SEGURO DE VIDA POR ACIDENTE:</strong> O titular e seus dependentes terão suas vidas asseguradas por morte por acidente. O acionamento do auxílio pode ser feito pelo telefone 0800 016 6633, na opção 6; <span style="color:${RED}"><strong>OBS: O seguro está disponível apenas para titulares e dependentes com faixa etária entre 14 e 69 anos.</strong></span></li>
  <li><strong>AUXÍLIO FUNERAL:</strong> O titular e seus dependentes terão auxílio funeral; incluindo translado, urna ornamentada, coroa de flores, além de profissionais especializados e a prestação de um serviço de qualidade e personalizado. O acionamento do auxílio pode ser feito pelo telefone 0800 016 6633, na opção 6; <span style="color:${RED}"><strong>OBS: O auxílio funeral está disponível apenas para titulares e dependentes até 69 anos.</strong></span></li>
  <li><strong>CONSULTA DE TELEMEDICINA:</strong> O titular e seus dependentes poderão realizar consultas virtuais em Telemedicina, disponíveis em duas modalidades de atendimento:
    <ul>
      <li><strong>Nas dependências da clínica:</strong> para consultas nas especialidades disponibilizadas pela unidade, voltadas a casos que não exijam intervenção imediata. Os valores seguem a tabela previamente estabelecida em contrato.</li>
      <li><strong>Fora das dependências da clínica:</strong> atendimento remoto em Clínica Médica para situações de urgência, em horários noturnos, finais de semana e feriados. O associado pagará <strong>50% do valor da consulta</strong>, conforme tabela contratual, sendo o valor cobrado na próxima mensalidade. O acesso ao Pronto Atendimento Digital pode ser realizado pelo aplicativo <strong>Seguros Unimed</strong> ou pelo site <span style="color:#0563c1"><u>https://paciente.conexasaude.com.br</u></span>. <span style="color:${RED}"><strong>OBS: Disponível apenas para titulares e dependentes até 69 anos.</strong></span></li>
    </ul>
  </li>
  <li><strong>CLUBE DE DESCONTO:</strong> Somente o TITULAR terá acesso ao clube de benefícios, onde poderá obter descontos em lojas parceiras.</li>
</ul>
<p><strong><u>FRANQUIA DIFERENCIADA:</u></strong></p>
<ul>
  <li>Para as especialidades de <strong>Psicologia e Nutrição</strong>, o associado pagará uma taxa de <span style="color:${RED}"><strong>R$ 60,00</strong></span> toda vez que utilizar o serviço;</li>
  <li>Para as especialidades de <strong>Alergologia, Cardiologia Infantil, Endocrinologia Infantil, Fonoaudiologia, Mastologia, Nefrologia, Neurologia, Oftalmologia, Podologia, Pneumologia, Proctologia, Psiquiatria e Reumatologia,</strong> o associado pagará <span style="color:${RED}"><strong>R$ 80,00</strong></span> toda vez que utilizar o serviço.</li>
</ul>
<h3><span style="color:${RED}"><strong><u>II. APÓS O PAGAMENTO DA 2ª MENSALIDADE</u></strong></span></h3>
<ul>
  <li><strong>10% de desconto nos exames</strong>: Laboratoriais; Eletrocardiograma; Raio X; Preventivo; Mamografia e Densitometria Óssea;</li>
  <li><strong>5% de desconto nos exames</strong>: Odontologia (consultar tabela); Ultrassonografia; Tomografia Computadorizada; Ressonância Magnética; Ecocardiograma, Eletroencefalograma, Teste Ergométrico; Endoscopia Digestiva Alta; Pacotes de Fisioterapia/RPG/Acupuntura.</li>
</ul>
<h3><span style="color:${RED}"><strong><u>III. APÓS O PAGAMENTO DA 6ª MENSALIDADE</u></strong></span></h3>
<ul>
  <li><strong>Gratuidade em exames laboratoriais:</strong> Ácido Úrico; Hemograma Completo; Glicose; EAS; Lipidograma; Parasitológico de fezes (EPF).</li>
  <li><strong>ANUALMENTE,</strong> será concedida a realização de 1 (um) exame por contrato (titular): Preventivo; Mamografia <span style="color:${RED}"><strong>ou</strong></span> USG da Mama; PSA <span style="color:${RED}"><strong>ou</strong></span> USG da Próstata; Densitometria Óssea; Eletrocardiograma (ECG) e Raio-X do tórax PA/PERFIL.</li>
</ul>
<p><strong><u>NÃO ESTÁ INCLUSO:</u></strong></p>
<ul>
  <li>Pequenas cirurgias, anestesias, estética, laudos médicos e revisão (incluindo risco cirúrgico e exame ocupacional).</li>
</ul>
<p style="text-align:center"><strong>Para demais informações referente a consultas, exames e o contrato segue os demais contatos:</strong></p>
<p style="text-align:center"><strong>WhatsApp: (21) 98464-2531 / Site: <span style="color:#0563c1"><u>www.policardmed.com</u></span></strong></p>
<p style="text-align:center"><span style="color:${RED}"><strong>TRAZER: ORIGINAL E CÓPIA DE RG, CPF, E COMPROVANTE DE RESIDÊNCIA DO TITULAR NO MOMENTO DA CONTRATAÇÃO E CÓPIA DOS DEPENDENTES</strong></span></p>
</div>
`.trim();
