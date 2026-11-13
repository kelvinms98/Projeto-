(() => {
  const guestState = document.getElementById('vipGuestState');
  const memberState = document.getElementById('vipMemberState');
  const pageStatus = document.getElementById('vipPageStatus');
  const refreshButton = document.getElementById('vipRefresh');
  const progressBar = document.getElementById('vipProgressBar');
  const progressFill = document.getElementById('vipProgressFill');
  const statusBadge = document.getElementById('vipStatusBadge');
  const lockedAccess = document.getElementById('vipLockedAccess');
  const unlockedAccess = document.getElementById('vipUnlockedAccess');
  const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  function showGuest(message) {
    guestState.hidden = false;
    memberState.hidden = true;
    pageStatus.textContent = message;
    progressBar.setAttribute('aria-valuenow', '0');
    progressFill.style.width = '0%';
    statusBadge.textContent = 'VIP / 001';
    statusBadge.classList.remove('is-active');
    lockedAccess.hidden = false;
    unlockedAccess.hidden = true;
  }

  async function loadProgress() {
    refreshButton.disabled = true;
    pageStatus.textContent = 'Carregando seu progresso...';
    pageStatus.classList.remove('is-error');
    try {
      const sessionResponse = await fetch('/api/customer/session', { cache: 'no-store' });
      const session = await sessionResponse.json();
      if (!sessionResponse.ok) throw new Error(session.error || 'Não foi possível verificar sua sessão.');
      if (!session.data?.customer) {
        showGuest('Entre na sua conta para visualizar seu progresso VIP.');
        return;
      }

      const response = await fetch('/api/customer/vip-progress', { cache: 'no-store' });
      const result = await response.json();
      if (response.status === 401) {
        showGuest('Entre na sua conta para visualizar seu progresso VIP.');
        return;
      }
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar seu progresso VIP.');
      const data = result.data;
      if (!data || !Number.isFinite(data.spent) || !Number.isFinite(data.progressPercent)) {
        throw new Error('O servidor retornou dados inválidos para o progresso VIP.');
      }

      guestState.hidden = true;
      memberState.hidden = false;
      document.getElementById('vipGreeting').textContent =
        `Olá, ${String(data.customerName || '').trim().split(/\s+/)[0] || 'cliente'}.`;
      document.getElementById('vipSpent').textContent = formatter.format(data.spent);
      document.getElementById('vipTarget').textContent = formatter.format(data.target);
      const progressPercent = Math.max(0, Math.min(100, data.progressPercent));
      progressBar.setAttribute('aria-valuenow', String(progressPercent));
      progressFill.style.width = `${progressPercent}%`;
      statusBadge.textContent = data.isVip ? 'VIP ATIVO' : 'VIP / 001';
      statusBadge.classList.toggle('is-active', data.isVip);
      document.getElementById('vipProgressMessage').textContent = data.isVip
        ? 'Parabéns! Seu acesso VIP está ativo.'
        : `Faltam ${formatter.format(data.remaining)} para desbloquear o acesso antecipado.`;

      const pendingNotice = document.getElementById('vipPendingNotice');
      pendingNotice.hidden = data.pendingOrders < 1;
      pendingNotice.textContent = data.pendingOrders > 0
        ? `${data.pendingOrders} pedido(s) aguardando confirmação ainda não entram no progresso.`
        : '';
      lockedAccess.hidden = data.isVip;
      unlockedAccess.hidden = !data.isVip;
      pageStatus.textContent = data.isVip
        ? `Nível VIP ativo · ${data.confirmedOrders} pedido(s) confirmado(s).`
        : `${data.confirmedOrders} pedido(s) confirmado(s) contabilizado(s).`;
    } catch (error) {
      guestState.hidden = true;
      memberState.hidden = true;
      pageStatus.textContent = error.message || 'Não foi possível carregar seu progresso VIP.';
      pageStatus.classList.add('is-error');
    } finally {
      refreshButton.disabled = false;
    }
  }

  refreshButton.addEventListener('click', loadProgress);
  loadProgress();
})();
