
DO $$
DECLARE
  v_html text;
BEGIN
v_html := $HTML$
<div style="font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:1.55;color:#1a1a1a;max-width:210mm;margin:0 auto;padding:20px;">

<div style="text-align:center;border-bottom:3px double #1a3a6b;padding-bottom:16px;margin-bottom:18px;">
  <h1 style="font-size:18pt;font-weight:bold;color:#1a3a6b;text-transform:uppercase;margin:0;">INSTRUMENTO PARTICULAR DE CONTRATO</h1>
  <h2 style="font-size:14pt;font-weight:bold;color:#1a3a6b;margin:6px 0 0 0;">&ldquo;CARTÃO CONSULTA + SEGUROS&rdquo;</h2>
</div>

<p style="text-align:justify;text-indent:2em;">Pelo presente instrumento, e na melhor forma de Direito, os signatários:</p>

<div style="border:1px solid #ccc;padding:12px 15px;margin:12px 0;background:#f9f9f9;">
  <p style="margin:0 0 6px 0;"><strong>CONTRATADA: POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI</strong></p>
  <p style="margin:3px 0;"><strong>CNPJ:</strong> 27.045.917/0001-69</p>
  <p style="margin:3px 0;"><strong>Endereço:</strong> Rua Expedicionários, nº 148 &nbsp;|&nbsp; <strong>Bairro:</strong> Centro</p>
  <p style="margin:3px 0;"><strong>Cidade:</strong> São João de Meriti &nbsp;|&nbsp; <strong>Estado:</strong> Rio de Janeiro &nbsp;|&nbsp; <strong>CEP:</strong> 25.520-591</p>
</div>

<div style="border:1px solid #ccc;padding:12px 15px;margin:12px 0;">
  <p style="margin:0 0 6px 0;"><strong>CONTRATANTE: ASSOCIADO TITULAR</strong></p>
  <p style="margin:3px 0;"><strong>Nome:</strong> {{PACIENTE_NOME}}</p>
  <p style="margin:3px 0;"><strong>CPF:</strong> {{PACIENTE_CPF}} &nbsp;|&nbsp; <strong>Nascimento:</strong> {{PACIENTE_NASCIMENTO}}</p>
  <p style="margin:3px 0;"><strong>Endereço:</strong> {{PACIENTE_LOGRADOURO}}, {{PACIENTE_NUMERO}} &nbsp;|&nbsp; <strong>Bairro:</strong> {{PACIENTE_BAIRRO}}</p>
  <p style="margin:3px 0;"><strong>Cidade:</strong> {{PACIENTE_CIDADE}} &nbsp;|&nbsp; <strong>Estado:</strong> {{PACIENTE_ESTADO}} &nbsp;|&nbsp; <strong>CEP:</strong> {{PACIENTE_CEP}}</p>
  <p style="margin:3px 0;"><strong>Telefone:</strong> {{PACIENTE_TELEFONE}} &nbsp;|&nbsp; <strong>E-mail:</strong> {{PACIENTE_EMAIL}}</p>
  <p style="margin:3px 0;"><strong>Vencimento:</strong> {{DATA_HOJE}}</p>
</div>

<div style="border:1px solid #ccc;padding:12px 15px;margin:12px 0;">
  <p style="margin:0 0 8px 0;"><strong>ASSOCIADOS DEPENDENTES</strong></p>
  <table style="width:100%;border-collapse:collapse;font-size:11pt;">
    <thead>
      <tr style="background:#e8e8e8;">
        <th style="border:1px solid #ccc;padding:6px 8px;text-align:left;">#</th>
        <th style="border:1px solid #ccc;padding:6px 8px;text-align:left;">Nome</th>
        <th style="border:1px solid #ccc;padding:6px 8px;text-align:left;">Nascimento</th>
        <th style="border:1px solid #ccc;padding:6px 8px;text-align:left;">Parentesco</th>
        <th style="border:1px solid #ccc;padding:6px 8px;text-align:left;">Telefone</th>
      </tr>
    </thead>
    <tbody>
      {{#DEPENDENTE_1}}<tr><td style="border:1px solid #ccc;padding:6px 8px;">1</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_1}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_1_NASCIMENTO}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_1_PARENTESCO}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_1_TELEFONE}}</td></tr>{{/DEPENDENTE_1}}
      {{#DEPENDENTE_2}}<tr><td style="border:1px solid #ccc;padding:6px 8px;">2</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_2}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_2_NASCIMENTO}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_2_PARENTESCO}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_2_TELEFONE}}</td></tr>{{/DEPENDENTE_2}}
      {{#DEPENDENTE_3}}<tr><td style="border:1px solid #ccc;padding:6px 8px;">3</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_3}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_3_NASCIMENTO}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_3_PARENTESCO}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_3_TELEFONE}}</td></tr>{{/DEPENDENTE_3}}
      {{#DEPENDENTE_4}}<tr><td style="border:1px solid #ccc;padding:6px 8px;">4</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_4}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_4_NASCIMENTO}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_4_PARENTESCO}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_4_TELEFONE}}</td></tr>{{/DEPENDENTE_4}}
      {{#DEPENDENTE_5}}<tr><td style="border:1px solid #ccc;padding:6px 8px;">5</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_5}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_5_NASCIMENTO}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_5_PARENTESCO}}</td><td style="border:1px solid #ccc;padding:6px 8px;">{{DEPENDENTE_5_TELEFONE}}</td></tr>{{/DEPENDENTE_5}}
    </tbody>
  </table>
</div>

<p style="text-align:justify;text-indent:2em;">Firmam o presente contrato, para a utilização dos benefícios do Cartão Consulta da <strong>Policlínica Menino Jesus</strong>, através do qual serão concedidos descontos ao <strong>ASSOCIADO TITULAR</strong>, bem como, aos seus <strong>ASSOCIADOS DEPENDENTES</strong>, exclusivamente na sede situada no endereço acima, de acordo com os termos e condições previstas nas cláusulas a seguir.</p>

<h3 style="font-size:13pt;font-weight:bold;color:#1a3a6b;border-bottom:2px solid #1a3a6b;padding-bottom:5px;margin-top:22px;">CLÁUSULA PRIMEIRA: DO OBJETO</h3>
<p style="text-align:justify;text-indent:2em;">O objeto do contrato consiste em serviços médicos prestados pela CONTRATADA, da seguinte forma:</p>
<p style="text-align:justify;text-indent:2em;"><strong>I. APÓS O PAGAMENTO DA 1ª MENSALIDADE E TAXA DE INSCRIÇÃO:</strong> O cliente realizará <strong>CONSULTAS CLÍNICAS SEM CARÊNCIA</strong> referentes às especialidades de: Angiologia, Cardiologia, Clínica Médica, Dermatologia, Endocrinologia, Gastroenterologia, Geriatria, Ginecologia, Ortopedia, Otorrinolaringologia, Obstetrícia, Pediatria e Urologia.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Primeiro:</strong> O cliente terá desconto e pagará o valor de consulta, de acordo com a tabela disponibilizada pela CONTRATADA na sede de atendimento, para as seguintes especialidades: Alergologia, Cardiologia Infantil, Endocrinologia Infantil, Fonoaudiologia, Mastologia, Nefrologia, Neurologia, Nutrição, Oftalmologia, Podologia, Pneumologia, Proctologia, Psiquiatria, Psicologia e Reumatologia.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Segundo:</strong> <u>NÃO ESTÁ COBERTO POR ESTE CARTÃO CONSULTA OS SEGUINTES SERVIÇOS</u>: Procedimentos, pequenas cirurgias, anestesias, estética, revisão, risco cirúrgico, exame ocupacional; Laudo para INSS e CONCURSOS PÚBLICOS.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Terceiro:</strong> Os Associados ficam cientes de que <strong>não estão aderindo a um plano de saúde</strong>, mas a um serviço de operacionalização de descontos e benefícios aos consumidores aderentes.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Quarto:</strong> A <strong>CONTRATADA NÃO POSSUI EMERGÊNCIA, SERVIÇOS DE INTERNAÇÃO, NEM ATENDIMENTO 24 HORAS.</strong></p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Quinto:</strong> <strong>HAVERÁ LIMITE DE (1) UMA CONSULTA DIÁRIA POR CONTRATO.</strong></p>

<h3 style="font-size:13pt;font-weight:bold;color:#1a3a6b;border-bottom:2px solid #1a3a6b;padding-bottom:5px;margin-top:22px;">CLÁUSULA SEGUNDA: DOS BENEFÍCIOS</h3>
<p style="text-align:justify;text-indent:2em;">Após o pagamento de algumas mensalidades os ASSOCIADOS terão direito aos seguintes serviços de saúde:</p>
<p style="text-align:justify;text-indent:2em;"><strong>I. APÓS A 1ª MENSALIDADE:</strong> Gratuidade para verificação de peso e pressão.</p>
<p style="text-align:justify;text-indent:2em;"><strong>II. APÓS A 2ª MENSALIDADE:</strong></p>
<ul style="margin-left:4em;text-align:justify;">
  <li><strong>10% de desconto</strong> nos exames: Laboratoriais; Eletrocardiograma; Raio X; Preventivo; Mamografia; Densitometria óssea;</li>
  <li><strong>5% de desconto</strong> nos exames: Odontologia (consultar tabela), Ultrassonografia; Tomografia Computadorizada; Ressonância Magnética; Ecocardiograma; Teste ergométrico; Endoscopia Digestiva Alta; Pacotes de Fisioterapia/RPG/Acupuntura.</li>
</ul>
<p style="text-align:justify;text-indent:2em;"><strong>III. APÓS O PAGAMENTO DA 6ª MENSALIDADE:</strong></p>
<ul style="margin-left:4em;text-align:justify;">
  <li><strong>Gratuidade em exames laboratoriais</strong>, como: Ácido Úrico; Hemograma Completo; Glicose; EAS; Lipidograma; Parasitológico de fezes (EPF);</li>
  <li><strong>ANUALMENTE</strong>, será concedida a realização de 1 (um) exame por contrato (titular): Preventivo; Mamografia ou USG da Mama; PSA ou USG da Próstata; Densitometria Óssea; Eletrocardiograma (ECG) e Raio-X do tórax PA/PERFIL.</li>
</ul>

<h3 style="font-size:13pt;font-weight:bold;color:#1a3a6b;border-bottom:2px solid #1a3a6b;padding-bottom:5px;margin-top:22px;">CLÁUSULA TERCEIRA: DO PAGAMENTO</h3>
<p style="text-align:justify;text-indent:2em;">No ato da adesão, serão cobrados além da primeira parcela, uma taxa de adesão de acordo com o número de ASSOCIADOS. A taxa corresponde ao custo de despesas administrativas para a confecção de carnê, carteirinha, etc.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Primeiro:</strong> O valor do cartão consulta poderá ser pago à vista para utilização de um período anual, com 10% de desconto, ou ser parcelado em 12 vezes pelo valor integral do contrato, através de carnê, que será pago em dinheiro na sede da CONTRATADA.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Segundo:</strong> Os ASSOCIADOS farão o pagamento mensal das parcelas, bem como, o valor da taxa de franquia, de acordo com a tabela disponibilizada pela CONTRATADA na sede de atendimento, referente às especialidades descritas na Cláusula Primeira e seus parágrafos.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Terceiro:</strong> Não haverá devolução das importâncias pagas, ainda que não utilizados os benefícios.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Quarto:</strong> O valor da mensalidade será reajustado todo mês de janeiro, de acordo com o Índice de Variação de Custos Médicos Hospitalares (VCMH).</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Quinto:</strong> O pagamento deverá ser efetuado sempre na data do vencimento, com tolerância de 5 (cinco) dias corridos, no caso de atraso, serão cobrados multa de 10% (dez por cento), além de juros de 0,033% ao dia.</p>

<h3 style="font-size:13pt;font-weight:bold;color:#1a3a6b;border-bottom:2px solid #1a3a6b;padding-bottom:5px;margin-top:22px;">CLÁUSULA QUARTA: DO ATENDIMENTO POR TELEMEDICINA</h3>
<p style="text-align:justify;text-indent:2em;">O titular e seus dependentes, devidamente cadastrados, terão direito ao benefício para o atendimento por telemedicina, conforme os termos e condições estabelecidos neste contrato.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Primeiro:</strong> A Telemedicina refere-se a prestação de serviço, via internet, por videoconferência, para <strong>situações clínicas agudas de baixa complexidade</strong>.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Segundo:</strong> Momentaneamente não haverá cobrança adicional na mensalidade do contrato pela disponibilização do serviço, entretanto, <strong>será aplicada uma franquia por cada atendimento realizado</strong> através do serviço de telemedicina, conforme a tabela de valores vigente no momento do atendimento. As condições estabelecidas nesta cláusula não eximem o paciente do pagamento de quaisquer outros valores previstos no presente contrato, que sejam decorrentes de serviços adicionais ou procedimentos realizados durante a consulta por telemedicina.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Terceiro:</strong> Os horários de atendimento serão realizados da seguinte forma:</p>
<ul style="margin-left:4em;text-align:justify;">
  <li>As consultas realizadas durante o horário de funcionamento da clínica serão efetuadas por nossos profissionais de saúde, conforme os horários estabelecidos pela clínica.</li>
  <li>As consultas realizadas fora do horário de funcionamento da clínica — incluindo períodos noturnos, finais de semana e feriados — serão prestadas por parceiro da contratada (Seguros Unimed), por meio de atendimento remoto na especialidade de Clínica Médica. <strong>O associado arcará com 50% do valor da consulta, conforme tabela contratual vigente, sendo o respectivo valor cobrado na próxima mensalidade</strong>. O acesso ao Pronto Atendimento Digital poderá ser feito pelo aplicativo Seguros Unimed ou pelo site https://paciente.conexasaude.com.br.</li>
  <li>É importante destacar que o referido atendimento <strong>não se configura como um serviço de urgência ou emergência</strong>, mas sim como uma extensão do atendimento regular em horários alternativos, <strong>voltado exclusivamente para consultas que possam ser conduzidas de forma remota e que não exijam intervenção imediata</strong>.</li>
</ul>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Quarto:</strong> Para a realização da consulta por telemedicina, o paciente deverá ter uma conexão estável à internet e um dispositivo com acesso à câmera de vídeo e som.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Quinto:</strong> <strong>O serviço NÃO contempla o acompanhamento de doenças crônicas, renovação de receitas contínuas, pedidos de exames de rotina ou a prescrição de medicamentos com controle de receita.</strong></p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Sexto:</strong> Se durante o atendimento a contratada identificar a necessidade de buscar outros profissionais ou serviços de saúde não cobertos por este contrato, o paciente pode optar por seguir essa recomendação. Nesse caso, ele deverá procurar tais serviços e atendimentos por conta própria, com prestadores de sua escolha.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Sétimo:</strong> A contratada não é responsável por: (i) sugerir outras unidades de saúde ao paciente; (ii) realizar a transferência para essas unidades; (iii) garantir ou custear o atendimento em locais distintos; ou (iv) acompanhar o paciente na sua jornada para outra unidade. A responsabilidade por essas ações e seus custos é <strong>exclusivamente do contratante</strong>.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Oitavo:</strong> O contratante é responsável por garantir que seus dados de acesso sejam utilizados de forma adequada e não divulgados a terceiros.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Nono:</strong> O contratante poderá encaminhar dúvidas, solicitações e reclamações quanto ao &ldquo;Atendimento Virtual&rdquo; pelo telefone ou enviar mensagem para <strong>(21) 97377-5431 (resposta em até 48h)</strong>.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Décimo:</strong> O contratante consente expressamente que seus dados pessoais fornecidos para esta contratação sejam utilizados pela contratada para enviar comunicações relacionadas ao contrato e para oferecer outros serviços de saúde que possam interessá-lo. O contratante pode revogar esse consentimento e interromper o recebimento de comunicações a qualquer momento, diretamente pelo mesmo canal em que as mensagens foram enviadas.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Décimo Primeiro:</strong> A Policardmed não se responsabiliza por falhas no atendimento decorrentes de problemas técnicos no dispositivo do paciente, incluindo falhas de conexão à internet, problemas de hardware ou software.</p>

<h3 style="font-size:13pt;font-weight:bold;color:#1a3a6b;border-bottom:2px solid #1a3a6b;padding-bottom:5px;margin-top:22px;">CLÁUSULA QUINTA: DO CLUBE DE DESCONTOS</h3>
<p style="text-align:justify;text-indent:2em;">O Clube de Descontos será disponibilizado como um <strong>benefício</strong> para os associados aos <strong>contratos</strong> de saúde.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Primeiro:</strong> Somente o <strong>titular</strong> do contrato de saúde terá direito ao benefício do Clube de Descontos e deverá estar devidamente <strong>cadastrado no aplicativo</strong> próprio do Clube Policardmed para usufruir dos benefícios oferecidos.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Segundo:</strong> Os beneficiários terão direito aos seguintes benefícios:</p>
<ul style="margin-left:4em;text-align:justify;">
  <li><strong>Descontos</strong> nas lojas cadastradas, com percentuais de desconto diferenciados de acordo com cada loja parceira.</li>
  <li><strong>Resgate de cashbacks</strong>, que serão disponibilizados por algumas lojas parceiras. O resgate dos cashbacks deverá ser realizado dentro do próprio aplicativo do Clube Policardmed.</li>
</ul>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Terceiro:</strong> A Policardmed não assume qualquer responsabilidade pelo gerenciamento, validade ou condições dos descontos e cashbacks, <strong>gerenciados única e exclusivamente pelas lojas parceiras</strong>, assim, qualquer questão ou reclamação deverá ser diretamente tratada com a loja parceira responsável pelo benefício em questão.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Quarto:</strong> A Policardmed não é responsável por danos que possam decorrer de uma administração inadequada dos serviços ou de falhas nos produtos oferecidos pelos seus parceiros.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Quinto:</strong> A Policardmed não tem controle sobre os preços praticados, <strong>os valores cobrados são de inteira responsabilidade dos parceiros</strong> e podem ser ajustados a qualquer momento. A Policardmed obriga-se a manter a lista de parceiros e os produtos e serviços disponíveis sempre atualizados por meio do site https://clube.policardmed.com.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Sexto:</strong> Das condições gerais do benefício:</p>
<ul style="margin-left:4em;text-align:justify;">
  <li>O Clube de Descontos, por se tratar de um <strong>serviço terceirizado</strong>, poderá ser encerrado ou ter suas condições modificadas a qualquer momento, sem a necessidade de comunicação prévia aos beneficiários.</li>
  <li>No caso de tais alterações ou encerramento, o beneficiário terá o direito de rescindir o contrato, <strong>sem a imposição de quaisquer taxas adicionais</strong>, desde que todas as mensalidades do contrato vigente estejam devidamente quitadas até a data da rescisão.</li>
</ul>

<h3 style="font-size:13pt;font-weight:bold;color:#1a3a6b;border-bottom:2px solid #1a3a6b;padding-bottom:5px;margin-top:22px;">CLÁUSULA SEXTA: DOS SEGUROS</h3>
<p style="text-align:justify;text-indent:2em;">A POLICARDMED, como intermediadora, <strong>oferece aos associados, de forma facultativa, benefícios assistenciais complementares por meio da Unimed e empresas parceiras, compreendendo auxílio-funeral, seguro de vida por acidente e telemedicina (em horários específicos).</strong> Tais benefícios têm caráter assistencial e securitário, não configurando plano de saúde, <strong>sendo regidos pelas condições gerais da Unimed e pela tabela de benefícios vigente.</strong></p>

<h3 style="font-size:13pt;font-weight:bold;color:#1a3a6b;border-bottom:2px solid #1a3a6b;padding-bottom:5px;margin-top:22px;">CLÁUSULA SÉTIMA: DA RESPONSABILIDADE</h3>
<p style="text-align:justify;text-indent:2em;">A guarda do uso do cartão consulta é responsabilidade única do ASSOCIADO TITULAR, que deverá utilizá-lo e conservá-lo para que somente quem figure como titular ou dependente do cartão possa usufruir dos benefícios que o cartão oferece. Em caso de mau uso ou empréstimo do cartão fornecido, poderá o ASSOCIADO TITULAR ser civil e criminalmente responsabilizado.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Primeiro:</strong> Em caso de extravio ou roubo do cartão, o ASSOCIADO deverá avisar a administração do cartão consulta imediatamente, e por escrito, bem como solicitar novo cartão, que terá um custo adicional de R$ 5,00 (cinco) reais.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Segundo:</strong> O ASSOCIADO TITULAR é o único responsável contratual perante o Cartão Consulta, responsabilizando-se civil e criminalmente pelos pagamentos e informações prestadas, inclusive referentes aos ASSOCIADOS DEPENDENTES.</p>

<h3 style="font-size:13pt;font-weight:bold;color:#1a3a6b;border-bottom:2px solid #1a3a6b;padding-bottom:5px;margin-top:22px;">CLÁUSULA OITAVA: DA VIGÊNCIA E FORMA DE RESCISÃO</h3>
<p style="text-align:justify;text-indent:2em;">O presente contrato vigerá por <strong>tempo determinado de 12 (doze) meses</strong>, a partir da data de sua assinatura.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Primeiro:</strong> Caso uma das partes tenha a intenção de rescindir o presente contrato, deverá manifestar-se expressamente por meio de notificação escrita simples, indicando o motivo da rescisão, <strong>com antecedência mínima de 30 (trinta) dias do término do contrato</strong>. Em caso de rescisão antecipada, será <strong>aplicada multa no valor de 10% (por cento) sobre o total do contrato</strong>, devendo os cartões ser devolvidos no ato do distrato.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Segundo:</strong> Haverá seu cancelamento após 30 (trinta) dias de atraso no pagamento da parcela devida, podendo ser reabilitado com o pagamento do débito em até 10 (dez) dias após o seu cancelamento.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Terceiro:</strong> Não será permitida a compra de novo pacote (cartão) pelo mesmo grupo familiar em casos de inadimplência, entretanto, o paciente poderá utilizar normalmente os serviços oferecidos pela Clínica, mas sem os benefícios deste cartão.</p>

<h3 style="font-size:13pt;font-weight:bold;color:#1a3a6b;border-bottom:2px solid #1a3a6b;padding-bottom:5px;margin-top:22px;">CLÁUSULA NONA: DAS DISPOSIÇÕES GERAIS</h3>
<p style="text-align:justify;text-indent:2em;">Fica disposto neste presente contrato que:</p>
<ul style="margin-left:4em;text-align:justify;">
  <li>O Cartão Consulta possibilita a inclusão de até 6 (seis) ASSOCIADOS, sendo um titular e cinco dependentes.</li>
  <li>O ASSOCIADO TITULAR somente poderá incluir os pais, cônjuges e filhos como ASSOCIADOS DEPENDENTES.</li>
  <li>Poderá ser acrescentado dependente a qualquer momento, com a ciência de que somente poderá haver exclusão do mesmo, com no mínimo 6 (seis) meses, e que o mesmo não poderá ser trocado por outro dependente.</li>
  <li>Menores de idade somente poderão se consultar com a presença do responsável.</li>
  <li>As consultas e exames podem ser realizadas por ordem de chegada ou por agendamento, a critério dos médicos.</li>
  <li>O atendimento será realizado mediante apresentação do Cartão Consulta e de um documento de identificação com foto.</li>
  <li>O horário de atendimento será realizado de segunda-feira a sexta-feira, em horário comercial, e sábados até às 12h.</li>
</ul>

<h3 style="font-size:13pt;font-weight:bold;color:#1a3a6b;border-bottom:2px solid #1a3a6b;padding-bottom:5px;margin-top:22px;">CLÁUSULA DÉCIMA: DA PROTEÇÃO DE DADOS</h3>
<p style="text-align:justify;text-indent:2em;">Considerando a Lei de Proteção de Dados (LGPD), as partes se obrigam à observância e cumprimento das regras, inclusive no uso de <strong>dados pessoais sensíveis</strong> em relação aos clientes, como: dado pessoal sobre origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico, quando vinculado a uma pessoa natural, nos termos do artigo 5º da Lei 13.709/2018.</p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Primeiro:</strong> As partes concordam que a coleta e tratamento de dados, sempre que possível e recomendável, observará o <strong>consentimento</strong> do cliente no fornecimento de dados, que deverá ser livre, informado, inequívoco e relacionado a uma determinada finalidade, o que será feito mediante aditivos e termos específicos, de acordo com a necessidade e/ou obrigação legal de coleta de dados, conforme o <strong>ANEXO I.</strong></p>
<p style="text-align:justify;text-indent:2em;"><strong>Parágrafo Segundo:</strong> As partes se comprometem à correta conservação dos dados pessoais cadastrais e sensíveis do cliente, na vigência e após o seu eventual término para cumprimento de obrigação legal ou regulatória do controlador, respeitando os prazos previstos em leis e regulamentos, nos termos do artigo 16, I da Lei 13.709/2018.</p>

<h3 style="font-size:13pt;font-weight:bold;color:#1a3a6b;border-bottom:2px solid #1a3a6b;padding-bottom:5px;margin-top:22px;">CLÁUSULA DÉCIMA PRIMEIRA: DO FORO</h3>
<p style="text-align:justify;text-indent:2em;">As partes contratantes elegem o <strong>Foro da Comarca de São João de Meriti</strong>, com renúncia expressa de qualquer outro, por mais privilegiado que seja, para eventual solução de quaisquer questões decorrentes da execução deste contrato.</p>

<p style="text-align:justify;text-indent:2em;margin-top:20px;">Assim acordados, assinam o presente Contrato, e declara o ASSOCIADO TITULAR que leu, compreendeu e concordou com todo o conteúdo do presente instrumento, responsabilizando-se por todos os dados informados.</p>

<div style="text-align:center;margin-top:35px;border-top:2px solid #1a3a6b;padding-top:22px;">
  <p style="font-weight:bold;font-size:12pt;">São João de Meriti, {{DATA_HOJE}}</p>
  <br><br><br>
  <p style="font-weight:bold;font-size:12pt;">_________________________________________</p>
  <p style="font-weight:bold;font-size:12pt;">CONTRATANTE: POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI</p>
  <br><br><br>
  <p style="font-weight:bold;font-size:12pt;">_________________________________________</p>
  <p style="font-weight:bold;font-size:12pt;">CONTRATADA: {{PACIENTE_NOME}} (ASSOCIADO TITULAR)</p>
</div>

<div style="page-break-before:always;"></div>

<div style="text-align:center;border-bottom:3px double #1a3a6b;padding-bottom:16px;margin-bottom:18px;">
  <h2 style="font-size:16pt;font-weight:bold;color:#1a3a6b;margin:0;">ANEXO I — TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS</h2>
</div>

<div style="border:1px solid #ccc;padding:12px 15px;margin:12px 0;">
  <p style="margin:0 0 6px 0;"><strong>ASSOCIADO TITULAR</strong></p>
  <p style="margin:3px 0;"><strong>Nome:</strong> {{PACIENTE_NOME}}</p>
  <p style="margin:3px 0;"><strong>CPF:</strong> {{PACIENTE_CPF}}</p>
</div>

<p style="text-align:justify;text-indent:2em;">O(a) TITULAR acima identificado(a) vem por meio deste manifestar livre, informada e inequívoca autorização para o tratamento de dados pessoais e dados pessoais sensíveis, com finalidade determinada, para a empresa <strong>POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI</strong>, aqui denominada como CONTROLADOR, inscrita no CNPJ sob nº 27.045.917/0001-69, de acordo com a Lei nº 13.709/2018, conforme disposto neste termo.</p>

<h3 style="font-size:13pt;font-weight:bold;color:#1a3a6b;border-bottom:2px solid #1a3a6b;padding-bottom:5px;margin-top:22px;">DA COLETA E DA FINALIDADE DO TRATAMENTO DE DADOS</h3>
<p style="text-align:justify;text-indent:2em;">O tratamento dos dados pessoais e dados pessoais sensíveis, listados no presente termo, tem as seguintes finalidades específicas:</p>

<table style="width:100%;border-collapse:collapse;font-size:11pt;margin-top:8px;">
  <thead>
    <tr style="background:#e8e8e8;">
      <th style="border:1px solid #ccc;padding:6px 8px;text-align:left;">Finalidade</th>
      <th style="border:1px solid #ccc;padding:6px 8px;text-align:center;width:60px;">SIM</th>
      <th style="border:1px solid #ccc;padding:6px 8px;text-align:center;width:60px;">NÃO</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="border:1px solid #ccc;padding:6px 8px;">Coleta de dados pessoais para manutenção de cadastro e agendamento de consultas e exames, bem como para cumprir obrigações legais e regulatórias.</td><td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">☐</td><td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">☐</td></tr>
    <tr><td style="border:1px solid #ccc;padding:6px 8px;">Coleta de dados sensíveis, referentes à saúde, para preenchimento da ficha de anamnese e prontuários médicos, necessários para evolução dos tratamentos e para apoiar na descrição do resultado e direcionamento no diagnóstico, e definir um prognóstico.</td><td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">☐</td><td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">☐</td></tr>
    <tr><td style="border:1px solid #ccc;padding:6px 8px;">Coleta de dados para a prescrição de medicamentos.</td><td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">☐</td><td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">☐</td></tr>
    <tr><td style="border:1px solid #ccc;padding:6px 8px;">Utilização dos dados para encaminhar correspondências e mensagens por meios físicos e digitais, abrangendo correio eletrônico (e-mail) e WhatsApp.</td><td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">☐</td><td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">☐</td></tr>
    <tr><td style="border:1px solid #ccc;padding:6px 8px;">Utilizar dados cadastrais para a emissão de carnês de pagamento e emissão de notas fiscais.</td><td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">☐</td><td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">☐</td></tr>
  </tbody>
</table>

<p style="text-align:justify;text-indent:2em;margin-top:14px;">Ressaltamos que é possível retirar, a qualquer tempo, o seu consentimento para o tratamento dos dados nas finalidades referidas neste Instrumento. Também será possível solicitar o acesso aos seus dados pessoais, bem como a sua retificação, eliminação, limitação do seu uso e a portabilidade dos seus dados.</p>

<p style="text-align:justify;text-indent:2em;">Estou ciente e concordo com a utilização de meus dados pessoais pela <strong>POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI</strong>, para as finalidades citadas e autorizadas acima, o que faço expressamente por <strong>assinatura escrita ou digital</strong>, com validade jurídica.</p>

<div style="text-align:center;margin-top:35px;padding-top:22px;">
  <p style="font-weight:bold;font-size:12pt;">São João de Meriti, {{DATA_HOJE}}</p>
  <br><br><br>
  <p style="font-weight:bold;font-size:12pt;">_________________________________________</p>
  <p style="font-weight:bold;font-size:12pt;">Assinatura do ASSOCIADO TITULAR: {{PACIENTE_NOME}}</p>
</div>

</div>
$HTML$;

UPDATE public.planos_assinatura
   SET template_contrato = v_html
 WHERE id = 'b3bbd5a8-a811-4d68-94db-d65fd5a2bdca';
END $$;
