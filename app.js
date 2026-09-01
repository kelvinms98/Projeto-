const form = document.getElementById('fitForm');
const resetBtn = document.getElementById('resetBtn');
const vampiraMsg = document.getElementById('vampiraMsg');
const tamanhoResult = document.getElementById('tamanhoResult');
const descricaoResult = document.getElementById('descricaoResult');
const tipsList = document.getElementById('tipsList');

function calcularTamanho({ peito, cintura, quadril, altura, fitStyle, tipoPeca }) {
  const media = (peito + cintura + quadril) / 3;
  const variacao = (altura - 170) / 10;

  let tamanho = 'M';
  let descricao = 'Caimento confortável com visual urbano e controle.';
  let mensagem = 'Seu look está pronto para entrar no clima.';

  if (fitStyle === 'slim') {
    if (media < 90) tamanho = 'P';
    if (media >= 90 && media < 100) tamanho = 'M';
    if (media >= 100 && media < 110) tamanho = 'G';
    if (media >= 110) tamanho = 'GG';
    descricao = 'Corte mais ajustado para um visual clean e intenso.';
    mensagem = 'Esse fit é mais sensacional, com presença e corte impecável.';
  }

  if (fitStyle === 'regular') {
    if (media < 95) tamanho = 'P';
    if (media >= 95 && media < 105) tamanho = 'M';
    if (media >= 105 && media < 115) tamanho = 'G';
    if (media >= 115) tamanho = 'GG';
    descricao = 'Tamanho equilibrado, confortável para uso diário.';
    mensagem = 'Esse combo vai cair certinho, sem apertar e sem exagero.';
  }

  if (fitStyle === 'oversized') {
    if (media < 100) tamanho = 'M';
    if (media >= 100 && media < 110) tamanho = 'G';
    if (media >= 110 && media < 120) tamanho = 'GG';
    if (media >= 120) tamanho = 'XG';
    descricao = 'Visual mais soltinho com atitude e presença street.';
    mensagem = 'Tá no clima oversized, com volume e energia total.';
  }

  if (tipoPeca === 'camiseta') {
    if (media > 110) tamanho = tamanho === 'M' ? 'G' : tamanho;
    descricao = 'Camiseta com conforto e visual leve para o cotidiano.';
  }

  if (tipoPeca === 'moletom') {
    if (fitStyle === 'oversized') tamanho = tamanho === 'M' ? 'G' : tamanho;
    descricao = 'Moletom com conforto térmico e vibe release.';
  }

  if (tipoPeca === 'jaqueta') {
    if (peito > 100 || cintura > 90) tamanho = tamanho === 'M' ? 'G' : tamanho;
    descricao = 'Jaqueta com estrutura e caimento premium.';
  }

  if (tipoPeca === 'calca') {
    if (quadril > 105) tamanho = tamanho === 'M' ? 'G' : tamanho;
    descricao = 'Calça com conforto na cintura e ajuste firme no quadril.';
  }

  if (variacao > 1.5) {
    if (tamanho === 'P') tamanho = 'M';
    if (tamanho === 'M') tamanho = 'G';
    if (tamanho === 'G') tamanho = 'GG';
  }

  return { tamanho, descricao, mensagem };
}

function updateTips(fitStyle, tipoPeca) {
  const tipMap = {
    slim: [
      '• Ajuste de peito com corte mais focado.',
      '• Cintura sem apertar e visual clean.',
      '• Quadril alinhado para um look elegante.'
    ],
    regular: [
      '• Peito com espaço para se movimentar.',
      '• Cintura com conforto e estrutura.',
      '• Quadril em caimento natural e sem exagero.'
    ],
    oversized: [
      '• Peito com volume e presença.',
      '• Cintura mais solta, com vibe forte.',
      '• Quadril com caída suave e visual pesado.'
    ]
  };

  const selectedTips = tipMap[fitStyle] || tipMap.regular;
  tipsList.innerHTML = selectedTips.map((tip) => `<li>${tip}</li>`).join('');

  if (tipoPeca === 'jaqueta') {
    tipsList.innerHTML += '<li>• Jaqueta: reserve espaço para ombro e movimento.</li>';
  }

  if (tipoPeca === 'calca') {
    tipsList.innerHTML += '<li>• Calça: a cintura e o quadril devem cair sem prender.</li>';
  }
}

function handleSubmit(event) {
  event.preventDefault();

  const data = {
    peito: Number(document.getElementById('peito').value),
    cintura: Number(document.getElementById('cintura').value),
    quadril: Number(document.getElementById('quadril').value),
    altura: Number(document.getElementById('altura').value),
    fitStyle: document.getElementById('fitStyle').value,
    tipoPeca: document.getElementById('tipoPeca').value,
  };

  const resultado = calcularTamanho(data);
  tamanhoResult.textContent = resultado.tamanho;
  descricaoResult.textContent = resultado.descricao;
  vampiraMsg.textContent = resultado.mensagem;
  updateTips(data.fitStyle, data.tipoPeca);
}

function resetForm() {
  document.getElementById('fitForm').reset();
  document.getElementById('peito').value = 96;
  document.getElementById('cintura').value = 82;
  document.getElementById('quadril').value = 100;
  document.getElementById('altura').value = 172;
  document.getElementById('fitStyle').value = 'regular';
  document.getElementById('tipoPeca').value = 'camiseta';

  tamanhoResult.textContent = 'M';
  descricaoResult.textContent = 'Caimento confortável com visual urbano e controle.';
  vampiraMsg.textContent = 'Seu look está pronto para entrar no clima.';
  updateTips('regular', 'camiseta');
}

form.addEventListener('submit', handleSubmit);
resetBtn.addEventListener('click', resetForm);
updateTips('regular', 'camiseta');

const assistantWidget = document.getElementById('assistantWidget');
const assistantToggle = document.getElementById('assistantToggle');
const closeAssistant = document.getElementById('closeAssistant');
const minimizeAssistant = document.getElementById('minimizeAssistant');
const maximizeAssistant = document.getElementById('maximizeAssistant');
const assistantResponse = document.getElementById('assistantResponse');
const assistantSize = document.getElementById('assistantSize');
const assistantSuggest = document.getElementById('assistantSuggest');

function openAssistant() {
  assistantWidget.classList.remove('closed');
  assistantWidget.classList.remove('minimized');
  assistantToggle.style.display = 'none';
}

function closeAssistantPanel() {
  assistantWidget.classList.add('closed');
  assistantToggle.style.display = 'block';
}

function toggleMinimize() {
  assistantWidget.classList.toggle('minimized');
  assistantWidget.classList.remove('maximized');
}

function toggleMaximize() {
  assistantWidget.classList.toggle('maximized');
  assistantWidget.classList.remove('minimized');
}

assistantToggle.addEventListener('click', openAssistant);
closeAssistant.addEventListener('click', closeAssistantPanel);
minimizeAssistant.addEventListener('click', toggleMinimize);
maximizeAssistant.addEventListener('click', toggleMaximize);

assistantSuggest.addEventListener('click', () => {
  const selectedSize = assistantSize.value;
  const message = `O tamanho ideal pra esse look é ${selectedSize}. Vai cair certinho na sua peça e o pagamento pode ser feito por PIX, cartão ou boleto.`;
  assistantResponse.textContent = message;
});

assistantToggle.style.display = 'block';
