const form = document.getElementById('fitForm');
const resetBtn = document.getElementById('resetBtn');
const vampiraMsg = document.getElementById('vampiraMsg');
const tamanhoResult = document.getElementById('tamanhoResult');
const descricaoResult = document.getElementById('descricaoResult');
const tipsList = document.getElementById('tipsList');
const cartCount = document.getElementById('cartCount');
const tamanhoSelect = document.getElementById('tamanhoSelect');
const addCartButtons = document.querySelectorAll('.add-cart-btn');
const cartToggle = document.getElementById('cartToggle');
const cartPanel = document.getElementById('cartPanel');
const closeCartBtn = document.getElementById('closeCartBtn');
const cartList = document.getElementById('cartList');
const cartTotal = document.getElementById('cartTotal');
const cartDiscount = document.getElementById('cartDiscount');
const cartFinalTotal = document.getElementById('cartFinalTotal');
const cartDelivery = document.getElementById('cartDelivery');
const cartCheckout = document.querySelector('.cart-checkout');
const paymentOptions = document.querySelectorAll('.payment-option');
const customerName = document.getElementById('customerName');
const customerStreet = document.getElementById('customerStreet');
const customerNumber = document.getElementById('customerNumber');
const customerComplement = document.getElementById('customerComplement');
const customerCEP = document.getElementById('customerCEP');
const installmentBox = document.getElementById('installmentBox');
const installmentSelect = document.getElementById('installmentSelect');

let cartItems = 0;
let cartProducts = [];
let selectedPaymentMethod = 'pix';
const AUTO_DISCOUNT_PERCENT = 0.10;
const DELIVERY_PRICE = 24.9;

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
    // Para calça, usa a medida de cintura em números
    if (cintura < 68) tamanho = '34';
    else if (cintura < 72) tamanho = '36';
    else if (cintura < 76) tamanho = '38';
    else if (cintura < 80) tamanho = '40';
    else if (cintura < 84) tamanho = '42';
    else if (cintura < 88) tamanho = '44';
    else if (cintura < 92) tamanho = '46';
    else tamanho = '48';
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

  if (tamanhoSelect) {
    tamanhoSelect.value = resultado.tamanho;
  }

  if (assistantWidget && assistantResponse) {
    const tamanho = resultado.tamanho;
    assistantResponse.textContent = `O tamanho ideal pra esse look é ${tamanho}. Vai cair certinho na sua peça e o pagamento pode ser feito por PIX, cartão ou boleto.`;
    assistantSize.value = tamanho;
  }
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
  if (tamanhoSelect) tamanhoSelect.value = 'M';
  updateTips('regular', 'camiseta');
}

form.addEventListener('submit', handleSubmit);
resetBtn.addEventListener('click', resetForm);
updateTips('regular', 'camiseta');

const productViewer = document.getElementById('productViewer');
const openShirtBtn = document.getElementById('openShirtBtn');
const rotateShirtBtn = document.getElementById('rotateShirtBtn');

if (productViewer && openShirtBtn) {
  openShirtBtn.addEventListener('click', () => {
    productViewer.classList.toggle('is-open');
    productViewer.classList.remove('is-rotating');
  });
}

if (productViewer && rotateShirtBtn) {
  rotateShirtBtn.addEventListener('click', () => {
    productViewer.classList.remove('is-rotating');
    void productViewer.offsetWidth;
    productViewer.classList.add('is-rotating');
    setTimeout(() => productViewer.classList.remove('is-rotating'), 900);
  });
}

const assistantWidget = document.getElementById('assistantWidget');
const assistantToggle = document.getElementById('assistantToggle');
const closeAssistant = document.getElementById('closeAssistant');
const minimizeAssistant = document.getElementById('minimizeAssistant');
const maximizeAssistant = document.getElementById('maximizeAssistant');
const assistantResponse = document.getElementById('assistantResponse');
const assistantSize = document.getElementById('assistantSize');
const assistantSuggest = document.getElementById('assistantSuggest');
const addToCartBtn = document.getElementById('addToCartBtn');

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

function getSubtotal() {
  return cartProducts.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity || 1), 0);
}

function updateInstallmentOptions() {
  if (!installmentSelect) return;
  
  const subtotal = getSubtotal();
  const discount = subtotal * AUTO_DISCOUNT_PERCENT;
  const delivery = subtotal > 250 ? 0 : DELIVERY_PRICE;
  const finalTotal = subtotal - discount + delivery;

  const options = installmentSelect.querySelectorAll('option');
  options.forEach((option, index) => {
    if (index === 0) {
      option.textContent = `À vista (sem juros)`;
    } else {
      const installments = parseInt(option.value);
      const installmentValue = finalTotal / installments;
      option.textContent = `${installments}x de ${formatCurrency(installmentValue)}`;
    }
  });
}

function renderCart() {
  if (!cartList || !cartTotal || !cartDiscount || !cartFinalTotal || !cartDelivery) return;

  if (cartProducts.length === 0) {
    cartList.innerHTML = '<p class="cart-empty">Seu carrinho está vazio.</p>';
    cartTotal.textContent = 'R$ 0,00';
    cartDiscount.textContent = '-R$ 0,00';
    cartDelivery.textContent = 'R$ 0,00';
    cartFinalTotal.textContent = 'R$ 0,00';
    return;
  }

  const subtotal = getSubtotal();
  const discount = subtotal * AUTO_DISCOUNT_PERCENT;
  const delivery = subtotal > 250 ? 0 : DELIVERY_PRICE;
  const finalTotal = subtotal - discount + delivery;

  cartList.innerHTML = cartProducts.map((item) => `
    <div class="cart-item">
      <div>
        <strong>${item.name}</strong>
        <small>Tamanho ${item.size}</small>
      </div>
      <div class="cart-item-actions">
        <div class="quantity-box">
          <button type="button" class="qty-btn" data-action="minus" data-id="${item.id}">−</button>
          <strong>${item.quantity || 1}</strong>
          <button type="button" class="qty-btn" data-action="plus" data-id="${item.id}">+</button>
        </div>
        <span>${formatCurrency(Number(item.price) * (item.quantity || 1))}</span>
        <button type="button" class="remove-cart-item" data-id="${item.id}">Remover</button>
      </div>
    </div>
  `).join('');

  cartTotal.textContent = formatCurrency(subtotal);
  cartDiscount.textContent = `-${formatCurrency(discount)}`;
  cartDelivery.textContent = formatCurrency(delivery);
  cartFinalTotal.textContent = formatCurrency(finalTotal);
  updateInstallmentOptions();
}

function updateCartCount() {
  const totalQuantity = cartProducts.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  cartItems = totalQuantity;
  if (cartCount) {
    cartCount.textContent = String(totalQuantity);
  }
  renderCart();
}

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
  const selectedSize = assistantSize.value || tamanhoResult.textContent;
  const message = `O tamanho ideal pra esse look é ${selectedSize}. Vai cair certinho na sua peça e o pagamento pode ser feito por PIX, cartão ou boleto.`;
  assistantResponse.textContent = message;
});

if (addToCartBtn) {
  addToCartBtn.addEventListener('click', () => {
    cartItems += 1;
    updateCartCount();
    const selectedSize = assistantSize.value || tamanhoResult.textContent;
    assistantResponse.textContent = `Adicionado ao carrinho: jaqueta no tamanho ${selectedSize}. Você pode finalizar por PIX, cartão ou boleto.`;
  });
}

addCartButtons.forEach((button) => {
  button.addEventListener('click', () => {
    cartItems += 1;
    const productName = button.dataset.product || 'Produto';
    const selectedSize = button.closest('.product-card') ? (tamanhoSelect ? tamanhoSelect.value : 'M') : (assistantSize ? assistantSize.value : 'M');
    const price = Number(button.dataset.price || 0);
    cartProducts.push({ id: `${productName}-${selectedSize}-${Date.now()}`, name: productName, size: selectedSize, price });
    cartItems = cartProducts.length;
    updateCartCount();
    if (assistantResponse) {
      assistantResponse.textContent = `${productName} foi adicionado ao carrinho. O pagamento pode ser feito por PIX, cartão ou boleto.`;
    }
    if (cartPanel) {
      cartPanel.classList.add('open');
    }
  });
});

if (cartToggle) {
  cartToggle.addEventListener('click', () => {
    if (cartPanel) {
      cartPanel.classList.toggle('open');
    }
  });
}

if (closeCartBtn && cartPanel) {
  closeCartBtn.addEventListener('click', () => {
    cartPanel.classList.remove('open');
  });
}

if (cartList) {
  cartList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.remove-cart-item');
    if (removeButton) {
      const idToRemove = removeButton.dataset.id;
      cartProducts = cartProducts.filter((item) => item.id !== idToRemove);
      updateCartCount();

      if (assistantResponse) {
        assistantResponse.textContent = 'Produto removido do carrinho. Você pode continuar escolhendo sua peça.';
      }
      return;
    }

    const qtyButton = event.target.closest('.qty-btn');
    if (!qtyButton) return;

    const itemId = qtyButton.dataset.id;
    const action = qtyButton.dataset.action;
    const item = cartProducts.find((entry) => entry.id === itemId);
    if (!item) return;

    if (action === 'plus') {
      item.quantity = Number(item.quantity || 1) + 1;
    }

    if (action === 'minus') {
      item.quantity = Number(item.quantity || 1) - 1;
      if (item.quantity <= 0) {
        cartProducts = cartProducts.filter((entry) => entry.id !== itemId);
      }
    }

    updateCartCount();
    if (assistantResponse) {
      assistantResponse.textContent = `Quantidade atualizada para ${item.name}.`;
    }
  });
}

if (paymentOptions) {
  paymentOptions.forEach((option) => {
    option.addEventListener('click', () => {
      paymentOptions.forEach((item) => item.classList.toggle('active', item === option));
      selectedPaymentMethod = option.dataset.method || 'pix';
      
      if (installmentBox) {
        installmentBox.style.display = selectedPaymentMethod === 'cartao' ? 'block' : 'none';
      }
      
      if (assistantResponse) {
        const labelMap = { pix: 'PIX', cartao: 'Cartão', boleto: 'Boleto' };
        assistantResponse.textContent = `Método de pagamento selecionado: ${labelMap[selectedPaymentMethod]}.`;
      }
    });
  });
}

if (cartCheckout) {
  cartCheckout.addEventListener('click', () => {
    if (cartProducts.length === 0) {
      if (assistantResponse) {
        assistantResponse.textContent = 'Seu carrinho está vazio. Adicione uma peça antes de seguir com o pagamento.';
      }
      return;
    }

    const nameVal = customerName && customerName.value.trim() ? customerName.value.trim() : '';
    const streetVal = customerStreet && customerStreet.value.trim() ? customerStreet.value.trim() : '';
    const numberVal = customerNumber && customerNumber.value.trim() ? customerNumber.value.trim() : '';
    const cepVal = customerCEP && customerCEP.value.trim() ? customerCEP.value.trim() : '';

    if (!nameVal || !streetVal || !numberVal || !cepVal) {
      if (assistantResponse) {
        assistantResponse.textContent = 'Por favor, preencha todos os campos obrigatórios: nome, rua, número e CEP.';
      }
      return;
    }

    const paymentName = selectedPaymentMethod === 'pix' ? 'PIX' : selectedPaymentMethod === 'cartao' ? 'Cartão' : 'Boleto';
    const complementVal = customerComplement && customerComplement.value.trim() ? `, ${customerComplement.value.trim()}` : '';
    const fullAddress = `${streetVal}, ${numberVal}${complementVal}`;
    
    const subtotal = getSubtotal();
    const discount = subtotal * AUTO_DISCOUNT_PERCENT;
    const delivery = subtotal > 250 ? 0 : DELIVERY_PRICE;
    const finalTotal = subtotal - discount + delivery;

    if (assistantResponse) {
      assistantResponse.innerHTML = `<strong>Pedido Confirmado!</strong><br>Cliente: ${nameVal}<br>Endereço: ${fullAddress}, CEP ${cepVal}<br>Pagamento: ${paymentName}<br>Total: ${formatCurrency(finalTotal)}<br><em>Obrigado por sua compra!</em>`;
    }

    setTimeout(() => {
      if (cartPanel) {
        cartPanel.classList.remove('open');
      }
      cartProducts = [];
      if (customerName) customerName.value = '';
      if (customerStreet) customerStreet.value = '';
      if (customerNumber) customerNumber.value = '';
      if (customerComplement) customerComplement.value = '';
      if (customerCEP) customerCEP.value = '';
      updateCartCount();
    }, 2500);
  });
}

assistantToggle.style.display = 'block';
updateCartCount();

if (tamanhoResult && assistantSize) {
  assistantSize.value = tamanhoResult.textContent.trim();
}
