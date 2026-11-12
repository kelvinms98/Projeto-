(() => {
  const form = document.getElementById('trackingForm');
  const input = document.getElementById('trackingToken');
  const message = document.getElementById('trackingMessage');
  const result = document.getElementById('trackingResult');
  const statusFlow = [
    ['awaiting_payment', 'Pedido recebido'],
    ['paid', 'Pagamento confirmado'],
    ['preparing', 'Em separação'],
    ['shipped', 'Enviado'],
    ['delivered', 'Entregue'],
  ];

  function cleanMessage(text, success = false) {
    message.textContent = text;
    message.classList.toggle('success', success);
  }

  function tokenFrom(value) {
    const candidate = value.trim();
    try {
      const url = new URL(candidate, window.location.origin);
      const token = url.searchParams.get('token');
      if (token) return token.toLowerCase();
    } catch { /* valor pode ser apenas o token */ }
    return candidate.toLowerCase();
  }

  function setText(id, value) {
    document.getElementById(id).textContent = value || '—';
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  }

  function renderTimeline(status) {
    const timeline = document.getElementById('orderTimeline');
    timeline.replaceChildren();
    if (status === 'cancelled') {
      const item = document.createElement('li');
      item.textContent = 'Pedido cancelado';
      item.className = 'is-cancelled';
      timeline.append(item);
      return;
    }
    const current = statusFlow.findIndex(([key]) => key === status);
    statusFlow.forEach(([key, label], index) => {
      const item = document.createElement('li');
      item.textContent = label;
      if (index < current || status === 'delivered') item.classList.add('is-complete');
      if (index === current) item.classList.add('is-current');
      timeline.append(item);
    });
  }

  function renderOrder(order) {
    setText('orderNumber', `#${order.orderId}`);
    setText('orderStatus', order.statusLabel);
    const badge = document.getElementById('orderStatus');
    badge.className = 'status-badge';
    if (order.status === 'delivered') badge.classList.add('is-done');
    if (order.status === 'cancelled') badge.classList.add('is-cancelled');
    setText('orderDate', order.createdAt);
    setText('orderPayment', order.paymentMethod);
    setText('orderDelivery', order.deliveryName);
    setText('orderCep', order.cep);
    document.getElementById('orderCepFact').hidden = !order.cep;
    setText('orderTotal', formatMoney(order.total));
    renderTimeline(order.status);

    const items = document.getElementById('orderItems');
    items.replaceChildren();
    for (const item of order.items || []) {
      const row = document.createElement('li');
      const description = document.createElement('span');
      description.textContent = `${item.quantity}x ${item.name} · ${item.size}`;
      const price = document.createElement('span');
      price.textContent = formatMoney(Number(item.unitPrice) * item.quantity);
      row.append(description, price);
      items.append(row);
    }
    result.hidden = false;
    cleanMessage('Pedido localizado. O status é atualizado quando a equipe avança o pedido.', true);
  }

  async function lookup(value) {
    const token = tokenFrom(value);
    result.hidden = true;
    if (!/^[a-f0-9]{64}$/.test(token)) {
      cleanMessage('Cole o link completo ou o código de acompanhamento recebido ao finalizar a compra.');
      return;
    }
    cleanMessage('Buscando seu pedido…');
    try {
      const response = await fetch(`/api/orders/track/${encodeURIComponent(token)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível localizar o pedido.');
      renderOrder(body.data);
    } catch (error) {
      cleanMessage(error.message || 'Não foi possível consultar o pedido. Tente novamente.');
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    lookup(input.value);
  });

  const initialToken = new URLSearchParams(window.location.search).get('token');
  if (initialToken) {
    input.value = initialToken;
    lookup(initialToken);
  }
})();
