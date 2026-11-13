(() => {
  const accountPage = document.body.classList.contains('account-page');
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let currentUser = null;
  let csrfTokenValue = '';
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });

  function message(element, text, isError = true) {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle('is-success', !isError);
  }

  async function customerRequest(url, { method = 'GET', body } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-CSRF-Token'] = csrfTokenValue;
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a solicitação.');
    if (result.data?.csrfToken) csrfTokenValue = result.data.csrfToken;
    return result.data;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  }

  function appendTrackingLink(element, token) {
    if (!element || !/^[a-f0-9]{64}$/i.test(String(token || ''))) return;
    const link = document.createElement('a');
    link.className = 'nexus-order-track-link';
    link.href = `/acompanhar-pedido.html?token=${encodeURIComponent(token)}`;
    link.textContent = 'Acompanhar pedido';
    element.append(document.createElement('br'), link);
  }

  function persistShoppingState(user = currentUser) {
    if (!user) return;
    localStorage.setItem(`nexus-cart:${user.id}`, localStorage.getItem('nexus-cart') || '[]');
    localStorage.setItem(`nexus-favorites:${user.id}`, localStorage.getItem('nexus-favorites') || '[]');
  }

  function activateShoppingState(user) {
    const previousUserId = localStorage.getItem('nexus-active-user');
    if (previousUserId && previousUserId !== user.id) persistShoppingState(currentUser);
    if (previousUserId !== user.id) {
      localStorage.setItem('nexus-cart', localStorage.getItem(`nexus-cart:${user.id}`) || '[]');
      localStorage.setItem('nexus-favorites', localStorage.getItem(`nexus-favorites:${user.id}`) || '[]');
    }
    localStorage.setItem('nexus-active-user', user.id);
  }

  function clearActiveShoppingState() {
    persistShoppingState();
    localStorage.setItem('nexus-cart', '[]');
    localStorage.setItem('nexus-favorites', '[]');
    localStorage.removeItem('nexus-active-user');
  }

  function redirectForAuth(intent, target) {
    sessionStorage.setItem('nexus-pending-action', JSON.stringify({ intent, target }));
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.href = `conta.html?redirect=${encodeURIComponent(returnTo)}&intent=${encodeURIComponent(intent)}`;
  }

  function replayPendingAction() {
    let pending;
    try { pending = JSON.parse(sessionStorage.getItem('nexus-pending-action') || 'null'); } catch { pending = null; }
    if (!pending) return;
    sessionStorage.removeItem('nexus-pending-action');
    const target = pending.target || {};
    let element = null;
    if (pending.intent === 'buy-now') element = document.getElementById('detailBuyNow');
    if (pending.intent === 'checkout') element = document.getElementById('cartToggle');
    if (pending.intent === 'add-cart') {
      element = document.getElementById('detailAddCart');
      if (!element && target.productName) {
        element = [...document.querySelectorAll('.add-cart-btn')].find((button) => button.dataset.product === target.productName);
      }
    }
    if (pending.intent === 'favorite') {
      element = document.getElementById('detailFavorite');
      if (!element && target.productName) {
        element = [...document.querySelectorAll('.favorite-btn')].find((button) =>
          button.dataset.favorite === target.productName || button.dataset.favoriteProduct === target.productName);
      }
    }
    if (element) window.setTimeout(() => element.click(), 100);
  }

  function updateAccountLinks() {
    document.querySelectorAll('.store-account-link').forEach((link) => {
      link.setAttribute('aria-label', currentUser ? 'Minha conta' : 'Entrar ou criar conta');
      link.href = `conta.html?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`)}`;
    });
  }

  async function loadDeliveryOptions() {
    const response = await fetch('/api/delivery-options');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as opções de entrega.');
    window.NEXUS_DELIVERY_OPTIONS = result.data || [];
    window.NEXUS_DELIVERY_ERROR = '';
    return window.NEXUS_DELIVERY_OPTIONS;
  }

  function normalizeCep(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function validCep(value) {
    return /^\d{5}-?\d{3}$/.test(String(value || '').trim());
  }

  function renderDeliveryOptions() {
    const options = window.NEXUS_DELIVERY_OPTIONS || [];
    document.querySelectorAll('#deliveryOption, #shopDeliveryOption').forEach((select) => {
      const isDrawer = select.id === 'shopDeliveryOption';
      const cep = normalizeCep(document.getElementById(isDrawer ? 'shopCEP' : 'customerCEP')?.value);
      const quote = window.NEXUS_SHIPPING_QUOTE;
      const validQuote = validCep(document.getElementById(isDrawer ? 'shopCEP' : 'customerCEP')?.value)
        && quote?.cep === cep;
      const previous = select.value;
      select.innerHTML = options.map((option) => {
        const fee = option.requires_address && validQuote ? quote.fee : option.fee;
        const estimate = option.requires_address && validQuote
          ? `frete fixo ${formatMoney(quote.baseFee)} + serviço ${formatMoney(quote.serviceFee)}`
          : option.estimate;
        const disabled = option.requires_address && !validQuote ? ' disabled' : '';
        return `<option value="${escapeHtml(option.id)}"${disabled}>${escapeHtml(option.name)} · ${formatMoney(fee)} · ${escapeHtml(estimate)}</option>`;
      }).join('');
      if (options.some((option) => option.id === previous
        && (!option.requires_address || validQuote))) {
        select.value = previous;
      } else if (select.value && options.some((option) => option.id === select.value && option.requires_address)) {
        select.value = '';
      }
    });
  }

  async function refreshShippingQuote(cepValue, formName) {
    const cep = normalizeCep(cepValue);
    const statusId = formName === 'shop' ? 'shopDeliveryStatus' : 'deliveryStatus';
    const status = document.getElementById(statusId);
    if (!validCep(cepValue)) {
      window.NEXUS_SHIPPING_QUOTE = null;
      renderDeliveryOptions();
      message(status, 'Informe um CEP de destino válido com 8 dígitos.');
      return;
    }
    message(status, 'Calculando a taxa fixa para este CEP...', false);
    try {
      const response = await fetch('/api/shipping-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokenValue },
        body: JSON.stringify({ cep }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível calcular o frete.');
      window.NEXUS_SHIPPING_QUOTE = result.data;
      renderDeliveryOptions();
      window.dispatchEvent(new CustomEvent('nexus:shipping-quote-updated', { detail: result.data }));
      message(
        status,
        `Frete ${formatMoney(result.data.baseFee)} + serviço ${formatMoney(result.data.serviceFee)} = ${formatMoney(result.data.fee)}.`,
        false,
      );
    } catch (error) {
      window.NEXUS_SHIPPING_QUOTE = null;
      renderDeliveryOptions();
      window.dispatchEvent(new CustomEvent('nexus:shipping-quote-updated', { detail: null }));
      message(status, error.message || 'Não foi possível calcular o frete.');
    }
  }

  async function createOrder(order) {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokenValue },
      body: JSON.stringify(order)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível registrar o pedido.');
    return result;
  }

  window.NexusStoreAccount = {
    ready,
    getUser: () => currentUser,
    loadDeliveryOptions,
    createOrder,
    renderDeliveryOptions,
    refreshShippingQuote,
  };

  document.addEventListener('input', (event) => {
    if (!event.target.matches('#customerCEP, #shopCEP')) return;
    const cep = normalizeCep(event.target.value);
    if (window.NEXUS_SHIPPING_QUOTE?.cep === cep) return;
    window.NEXUS_SHIPPING_QUOTE = null;
    renderDeliveryOptions();
    window.dispatchEvent(new CustomEvent('nexus:shipping-quote-updated', { detail: null }));
  });

  if (!accountPage) {
    document.addEventListener('click', async (event) => {
      const quoteButton = event.target.closest('[data-calculate-shipping]');
      if (quoteButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await ready;
        if (!currentUser) {
          redirectForAuth('checkout', {});
          return;
        }
        const formName = quoteButton.dataset.calculateShipping;
        const cepId = formName === 'shop' ? 'shopCEP' : 'customerCEP';
        quoteButton.disabled = true;
        await refreshShippingQuote(document.getElementById(cepId)?.value, formName);
        quoteButton.disabled = false;
        return;
      }

      const target = event.target.closest(
        '#detailFavorite, .favorite-btn, #detailAddCart, .add-cart-btn, #detailBuyNow, '
        + '.payment-option, #deliveryOption, #shopDeliveryOption, #shopPaymentMethod, '
        + '.qty-btn, .remove-cart-item, [data-cart-action], '
        + '#detailSizes .size-option, #detailColors .size-option, #detailSizes input, #detailColors input, '
        + 'input[name="size"], input[name="color"]'
      );
      const checkout = event.target.closest('.cart-checkout, [data-confirm-order]');
      if (!target && !checkout) return;
      if (!currentUser) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await ready;
        if (currentUser) {
          (target || checkout)?.click();
          return;
        }
        const intent = checkout || target?.matches(
          '.payment-option, #deliveryOption, #shopDeliveryOption, #shopPaymentMethod, '
          + '.qty-btn, .remove-cart-item, [data-cart-action]'
        )
          ? 'checkout'
          : target?.matches('#detailSizes, #detailColors, #detailSizes *, #detailColors *, input[name="size"], input[name="color"]')
            ? 'select-options'
            : target?.id === 'detailBuyNow' ? 'buy-now'
              : target?.id === 'detailFavorite' || target?.matches('.favorite-btn') ? 'favorite' : 'add-cart';
        const productName = target?.dataset.product || target?.dataset.favoriteProduct || target?.dataset.favorite
          || window.NEXUS_PRODUCTS?.[new URLSearchParams(window.location.search).get('id')]?.name || '';
        redirectForAuth(intent, { productName });
        return;
      }
      if (target || event.target.closest('.qty-btn, .remove-cart-item, [data-cart-action]')) {
        window.setTimeout(() => persistShoppingState(), 0);
      }
      if (!checkout) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const localCart = (() => {
        try { return JSON.parse(localStorage.getItem('nexus-cart') || '[]'); } catch { return []; }
      })();
      const isDrawer = Boolean(checkout?.matches('[data-confirm-order]'));
      const field = (name, fallbackId) => isDrawer
        ? document.getElementById(`shop${name}`)?.value?.trim() || ''
        : document.getElementById(fallbackId)?.value?.trim() || '';
      const selectedDelivery = isDrawer ? document.getElementById('shopDeliveryOption') : document.getElementById('deliveryOption');
      const paymentMethod = isDrawer ? document.getElementById('shopPaymentMethod')?.value
        : document.querySelector('.payment-option.active')?.dataset.method;
      const options = window.NEXUS_DELIVERY_OPTIONS || [];
      const delivery = options.find((option) => option.id === selectedDelivery?.value);
      if (!localCart.length) {
        window.alert('O carrinho está vazio.');
        return;
      }
      if (!delivery || !paymentMethod) {
        const deliveryStatus = document.getElementById(isDrawer ? 'shopDeliveryStatus' : 'deliveryStatus')?.textContent;
        window.alert(deliveryStatus || 'As opções de entrega ainda não estão disponíveis.');
        return;
      }
      const orderData = {
        items: localCart,
        deliveryOptionId: delivery.id,
        paymentMethod,
        customerName: field('Name', 'customerName'),
        customerEmail: currentUser?.email || field('Email', 'customerEmail'),
        phone: field('Phone', 'customerPhone'),
        street: field('Street', 'customerStreet'),
        number: field('Number', 'customerNumber'),
        complement: field('Complement', 'customerComplement'),
        cep: field('CEP', 'customerCEP')
      };
      const status = document.getElementById(isDrawer ? 'shopOrderStatus' : 'checkoutStatus');
      if (delivery.requires_address && (!orderData.street || !orderData.number || !orderData.cep)) {
        message(status, 'Preencha rua, número e CEP para esta modalidade.');
        return;
      }
      if (delivery.requires_address && (
        !validCep(orderData.cep)
        || window.NEXUS_SHIPPING_QUOTE?.cep !== normalizeCep(orderData.cep)
      )) {
        message(status, 'Calcule o frete pelo CEP informado antes de selecionar a entrega.');
        return;
      }
      if (!orderData.customerName) {
        message(status, 'Informe o nome que deve constar no pedido.');
        return;
      }
      if (!emailPattern.test(orderData.customerEmail)) {
        message(status, 'Informe um e-mail válido para receber a confirmação do pedido.');
        return;
      }
      const submitButton = checkout;
      submitButton.disabled = true;
      try {
        const receipt = await createOrder(orderData);
        localStorage.setItem('nexus-cart', '[]');
        if (currentUser) localStorage.setItem(`nexus-cart:${currentUser.id}`, '[]');
        if (isDrawer) {
          const list = document.getElementById('shopCartList');
          const footer = document.getElementById('shopCartFooter');
          list.textContent = `Pedido #${receipt.orderId} registrado. Aguardando confirmação do pagamento. ${receipt.emailMessage}`;
          appendTrackingLink(list, receipt.trackingToken);
          footer.innerHTML = '<button type="button" class="shop-continue-button">Continuar comprando</button>';
          document.getElementById('cartCount').textContent = '0';
        } else {
          sessionStorage.setItem('nexus-order-notice', JSON.stringify({
            message: `Pedido #${receipt.orderId} registrado e aguardando confirmação do pagamento. ${receipt.emailMessage}`,
            emailSent: receipt.emailSent,
            emailConfigured: receipt.emailConfigured,
            trackingToken: receipt.trackingToken,
          }));
          window.location.reload();
        }
      } catch (error) {
        message(status, error.message || 'Não foi possível registrar o pedido.');
        submitButton.disabled = false;
      }
    }, true);
  }

  async function loadProfile(user) {
    const form = document.getElementById('profilePanel');
    if (!form) return;
    form.elements.email.value = user.email || '';
    form.elements.full_name.value = user.name || '';
    form.elements.phone.value = user.phone || '';
    document.getElementById('accountWelcome').textContent = `Olá, ${(user.name || user.email || '').split(' ')[0]}`;
  }

  async function loadOrders(user) {
    const container = document.getElementById('ordersList');
    if (!container) return;
    container.innerHTML = '<p class="account-empty">Carregando seus pedidos...</p>';
    let data;
    try {
      data = await customerRequest('/api/customer/orders');
    } catch (error) {
      container.innerHTML = `<p class="account-empty">${escapeHtml(error.message)}</p>`;
      return;
    }
    if (!data?.length) {
      container.innerHTML = '<p class="account-empty">Você ainda não tem pedidos.</p>';
      return;
    }
    container.innerHTML = data.map((order) => {
      const date = new Date(order.created_at).toLocaleDateString('pt-BR');
      const items = (order.items || []).map((item) =>
        `${item.quantity}x ${escapeHtml(item.product_name)} (${escapeHtml(item.size)})`).join(', ');
      const trackingLink = `/acompanhar-pedido.html?token=${encodeURIComponent(order.tracking_token)}`;
      return `<article class="order-card"><div class="order-card-heading"><strong>Pedido #${escapeHtml(order.id_venda)}</strong><span>${date}</span></div><p>${items}</p><p>${escapeHtml(order.delivery_name || 'Entrega')} · ${escapeHtml(order.statusLabel)}</p><p>Total ${formatMoney(order.total)}</p><a href="${trackingLink}">Acompanhar pedido</a></article>`;
    }).join('');
  }

  function setAccountTab(tab) {
    const profile = tab === 'profile';
    document.getElementById('profileTab').classList.toggle('is-active', profile);
    document.getElementById('ordersTab').classList.toggle('is-active', !profile);
    document.getElementById('profileTab').setAttribute('aria-selected', String(profile));
    document.getElementById('ordersTab').setAttribute('aria-selected', String(!profile));
    document.getElementById('profilePanel').hidden = !profile;
    document.getElementById('ordersPanel').hidden = profile;
    if (!profile && currentUser) loadOrders(currentUser);
  }

  function setupAccountPage() {
    const authView = document.getElementById('accountAuthView');
    const signedView = document.getElementById('accountSignedView');
    const authMessage = document.getElementById('accountMessage');
    const profileMessage = document.getElementById('profileMessage');
    const loginTab = document.getElementById('loginTab');
    const signupTab = document.getElementById('signupTab');
    const loginPanel = document.getElementById('loginPanel');
    const signupPanel = document.getElementById('signupPanel');
    const signupPassword = signupPanel.elements.password;
    const signupPasswordConfirmation = signupPanel.elements.password_confirmation;
    const validatePasswordConfirmation = () => {
      signupPasswordConfirmation.setCustomValidity(
        signupPasswordConfirmation.value && signupPasswordConfirmation.value !== signupPassword.value
          ? 'As senhas não são iguais.' : ''
      );
    };
    signupPassword.addEventListener('input', validatePasswordConfirmation);
    signupPasswordConfirmation.addEventListener('input', validatePasswordConfirmation);

    const switchMode = (signup) => {
      loginTab.classList.toggle('is-active', !signup);
      signupTab.classList.toggle('is-active', signup);
      loginTab.setAttribute('aria-selected', String(!signup));
      signupTab.setAttribute('aria-selected', String(signup));
      loginPanel.hidden = signup;
      signupPanel.hidden = !signup;
      message(authMessage, '');
    };
    loginTab.addEventListener('click', () => switchMode(false));
    signupTab.addEventListener('click', () => switchMode(true));
    document.getElementById('profileTab').addEventListener('click', () => setAccountTab('profile'));
    document.getElementById('ordersTab').addEventListener('click', () => setAccountTab('orders'));

    loginPanel.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = new FormData(loginPanel);
      const email = String(values.get('email')).trim().toLowerCase();
      if (!emailPattern.test(email)) return message(authMessage, 'Digite um e-mail no formato nome@dominio.com.');
      const submit = loginPanel.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const data = await customerRequest('/api/customer/login', {
          method: 'POST',
          body: { email, password: values.get('password') },
        });
        await showSignedIn(data.customer);
      } catch (error) {
        message(authMessage, error.message);
      } finally {
        submit.disabled = false;
      }
    });
    signupPanel.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = new FormData(signupPanel);
      const email = String(values.get('email')).trim();
      const password = String(values.get('password'));
      if (!emailPattern.test(email)) return message(authMessage, 'Digite um e-mail no formato nome@dominio.com.');
      if (password.length < 12) return message(authMessage, 'A senha precisa ter pelo menos 12 caracteres.');
      if (password !== values.get('password_confirmation')) return message(authMessage, 'As senhas não são iguais.');
      const submit = signupPanel.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const data = await customerRequest('/api/customer/signup', {
          method: 'POST',
          body: {
            full_name: String(values.get('full_name')).trim(),
            email: email.toLowerCase(),
            password,
          },
        });
        await showSignedIn(data.customer);
      } catch (error) {
        message(authMessage, error.message);
      } finally {
        submit.disabled = false;
      }
    });
    document.getElementById('accountSignout').addEventListener('click', async () => {
      try {
        await customerRequest('/api/customer/logout', { method: 'POST', body: {} });
        clearActiveShoppingState();
        currentUser = null;
        signedView.hidden = true;
        authView.hidden = false;
        updateAccountLinks();
        message(authMessage, 'Você saiu da sua conta.', false);
      } catch (error) {
        message(profileMessage, error.message);
      }
    });
    document.getElementById('profilePanel').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!currentUser) return;
      const values = new FormData(event.currentTarget);
      try {
        currentUser = await customerRequest('/api/customer/profile', {
          method: 'PUT',
          body: {
        full_name: values.get('full_name').trim(),
        phone: values.get('phone').trim() || null,
          },
        });
        await loadProfile(currentUser);
        message(profileMessage, 'Seus dados foram atualizados.', false);
      } catch (error) {
        message(profileMessage, error.message);
      }
    });
  }

  async function showSignedIn(user) {
    currentUser = user;
    activateShoppingState(user);
    ['customerName', 'shopName'].forEach((id) => {
      const field = document.getElementById(id);
      if (field) {
        if (!field.value) field.value = user.name || '';
        field.readOnly = true;
      }
    });
    ['customerEmail', 'shopEmail'].forEach((id) => {
      const field = document.getElementById(id);
      if (field) {
        field.value = user.email || '';
        field.readOnly = true;
      }
    });
    ['customerPhone', 'shopPhone'].forEach((id) => {
      const field = document.getElementById(id);
      if (field && !field.value) field.value = user.phone || '';
    });
    const authView = document.getElementById('accountAuthView');
    const signedView = document.getElementById('accountSignedView');
    if (authView && signedView) {
      authView.hidden = true;
      signedView.hidden = false;
      try { await loadProfile(user); } catch (error) { message(document.getElementById('profileMessage'), error.message); }
    }
    updateAccountLinks();
    if (accountPage) {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect');
      if (redirect) {
        const destination = new URL(redirect, window.location.href);
        if (destination.origin === window.location.origin) window.location.href = destination.href;
      }
    }
  }

  async function initialize() {
    if (accountPage) setupAccountPage();
    const noticeValue = sessionStorage.getItem('nexus-order-notice');
    if (noticeValue) {
      sessionStorage.removeItem('nexus-order-notice');
      let notice;
      try { notice = JSON.parse(noticeValue); } catch { notice = { message: noticeValue }; }
      message(
        document.getElementById('checkoutStatus'),
        notice.message,
        notice.emailSent === false && notice.emailConfigured !== false
      );
      appendTrackingLink(document.getElementById('checkoutStatus'), notice.trackingToken);
    }
    try {
      const session = await customerRequest('/api/customer/session');
      if (session.customer) await showSignedIn(session.customer);
      else {
        currentUser = null;
        updateAccountLinks();
      }
      if (currentUser) {
        const options = await loadDeliveryOptions();
        renderDeliveryOptions();
        document.querySelectorAll('#deliveryOption, #shopDeliveryOption').forEach((select) => {
          select.addEventListener('change', () => {
            const selected = options.find((option) => option.id === select.value);
            const addressFields = document.getElementById(
              select.id === 'shopDeliveryOption' ? 'shopAddressFields' : 'customerAddressFields'
            );
            if (addressFields) addressFields.hidden = !selected?.requires_address;
          });
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
      } else {
        window.NEXUS_DELIVERY_OPTIONS = [];
        document.querySelectorAll('#deliveryOption, #shopDeliveryOption').forEach((select) => {
          select.innerHTML = '<option value="">Entre para ver as opções de entrega</option>';
          select.disabled = true;
        });
      }
    } catch (error) {
      window.NEXUS_DELIVERY_OPTIONS = [];
      window.NEXUS_DELIVERY_ERROR = error.message || 'Não foi possível carregar as opções de entrega.';
      document.querySelectorAll('#deliveryOption, #shopDeliveryOption').forEach((select) => {
        select.innerHTML = '<option value="">Entrega indisponível</option>';
        select.disabled = true;
      });
      if (accountPage) message(document.getElementById('accountMessage'), error.message);
    } finally {
      readyResolve();
    }
    if (currentUser) replayPendingAction();
  }

  initialize().catch((error) => {
    const status = document.getElementById('accountMessage');
    message(status, error.message || 'Não foi possível conectar à conta.');
    readyResolve();
  });
})();
