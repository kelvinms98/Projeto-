const form = document.getElementById('quoteForm');
const resultCard = document.getElementById('resultCard');
const historyList = document.getElementById('historyList');
const resetBtn = document.getElementById('resetBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const printBtn = document.getElementById('printBtn');

const STORAGE_KEY = 'cotacao_export_quotes_v1';

let quotes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));
}

function formatUSD(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0));
}

function readFormData() {
  return {
    clientName: document.getElementById('clientName').value.trim(),
    productName: document.getElementById('productName').value.trim(),
    quantity: Number(document.getElementById('quantity').value || 0),
    unitPrice: Number(document.getElementById('unitPrice').value || 0),
    freight: Number(document.getElementById('freight').value || 0),
    insuranceRate: Number(document.getElementById('insuranceRate').value || 0),
    exportTax: Number(document.getElementById('exportTax').value || 0),
    margin: Number(document.getElementById('margin').value || 0),
    exchangeRate: Number(document.getElementById('exchangeRate').value || 0),
  };
}

function calculateQuote(data) {
  const quantity = Number(data.quantity || 0);
  const unitPrice = Number(data.unitPrice || 0);
  const freight = Number(data.freight || 0);
  const insuranceRate = Number(data.insuranceRate || 0);
  const exportTax = Number(data.exportTax || 0);
  const margin = Number(data.margin || 0);
  const exchangeRate = Number(data.exchangeRate || 0);

  const subtotal = quantity * unitPrice;
  const insurance = subtotal * (insuranceRate / 100);
  const cif = subtotal + freight + insurance;
  const exportTaxValue = cif * (exportTax / 100);
  const marginValue = (cif + exportTaxValue) * (margin / 100);

  const totalUSD = subtotal + freight + insurance + exportTaxValue + marginValue;
  const totalBRL = totalUSD * exchangeRate;

  return {
    subtotal,
    freight,
    insurance,
    cif,
    exportTaxValue,
    marginValue,
    totalUSD,
    totalBRL,
  };
}

function renderResult(data) {
  const quote = {
    ...data,
    ...calculateQuote(data),
    createdAt: new Date().toISOString(),
  };

  resultCard.innerHTML = `
    <div class="result-client">${quote.clientName || 'Cliente'}</div>
    <div class="result-product">${quote.productName || 'Produto'} • ${quote.quantity || 0} unidades</div>

    <div class="total-price">${formatBRL(quote.totalBRL)}</div>

    <div class="summary-line">
      <span>FOB</span>
      <strong>${formatUSD(quote.subtotal)}</strong>
    </div>

    <div class="summary-line">
      <span>Frete</span>
      <strong>${formatUSD(quote.freight)}</strong>
    </div>

    <div class="summary-line">
      <span>Seguro</span>
      <strong>${formatUSD(quote.insurance)}</strong>
    </div>

    <div class="summary-line">
      <span>CIF</span>
      <strong>${formatUSD(quote.cif)}</strong>
    </div>

    <div class="summary-line">
      <span>Taxa exportação</span>
      <strong>${formatUSD(quote.exportTaxValue)}</strong>
    </div>

    <div class="summary-line">
      <span>Margem</span>
      <strong>${formatUSD(quote.marginValue)}</strong>
    </div>

    <div class="summary-line">
      <span>Total em USD</span>
      <strong>${formatUSD(quote.totalUSD)}</strong>
    </div>
  `;

  return quote;
}

function renderHistory() {
  if (!quotes.length) {
    historyList.innerHTML = '<p class="empty-history">Nenhuma cotação salva ainda.</p>';
    return;
  }

  const orderedQuotes = [...quotes].reverse();

  historyList.innerHTML = orderedQuotes
    .map((quote) => {
      const label = quote.productName || 'Produto';
      const client = quote.clientName || 'Cliente';
      return `
        <div class="quote-item">
          <div>
            <strong>${client}</strong>
            <div class="quote-meta">${label} • ${quote.quantity || 0} unidades</div>
          </div>
          <div class="quote-value">${formatBRL(quote.totalBRL)}</div>
        </div>
      `;
    })
    .join('');
}

function saveQuote(quote) {
  quotes.push(quote);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
  renderHistory();
}

function resetForm() {
  form.reset();
  document.getElementById('quantity').value = 1;
  document.getElementById('unitPrice').value = 25;
  document.getElementById('freight').value = 150;
  document.getElementById('insuranceRate').value = 1.5;
  document.getElementById('exportTax').value = 2.5;
  document.getElementById('margin').value = 20;
  document.getElementById('exchangeRate').value = 5.45;

  resultCard.innerHTML = '<p class="empty-state">Preencha os dados para ver o cálculo.</p>';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const data = readFormData();
  const quote = renderResult(data);
  saveQuote(quote);
  form.reset();

  document.getElementById('quantity').value = 1;
  document.getElementById('unitPrice').value = 25;
  document.getElementById('freight').value = 150;
  document.getElementById('insuranceRate').value = 1.5;
  document.getElementById('exportTax').value = 2.5;
  document.getElementById('margin').value = 20;
  document.getElementById('exchangeRate').value = 5.45;

  renderResult(readFormData());
});

resetBtn.addEventListener('click', () => {
  resetForm();
});

clearHistoryBtn.addEventListener('click', () => {
  quotes = [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
  renderHistory();
});

printBtn.addEventListener('click', () => {
  window.print();
});

['input', 'change'].forEach((eventName) => {
  form.addEventListener(eventName, () => {
    const data = readFormData();
    if (data.clientName || data.productName || data.quantity || data.unitPrice || data.exchangeRate) {
      renderResult(data);
    }
  });
});

renderHistory();
resetForm();
