const params = new URLSearchParams(window.location.search);
const gallery = document.getElementById('detailGallery');
const sizeOptions = document.getElementById('detailSizes');
const colorOptions = document.getElementById('detailColors');
const cartKey = 'nexus-cart';
const favoritesKey = 'nexus-favorites';
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
let product = null;
let activeImage = 0;

function escapeDetailText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatPrice(value) {
  return Number.isFinite(value) ? currency.format(value) : 'Preço não cadastrado';
}

function getSelectedColor() {
  return colorOptions.querySelector('input[name="color"]:checked')?.value || '';
}

function getSelectedSize() {
  return sizeOptions.querySelector('input[name="size"]:checked')?.value || '';
}

function getSelectedVariant() {
  if (!product) return null;
  return product.variants.find(
    (variant) => variant.color === getSelectedColor() && variant.size === getSelectedSize()
  ) || null;
}

function updatePurchaseState() {
  const variant = getSelectedVariant();
  const canPurchase = Boolean(
    variant && variant.stock > 0 && Number.isFinite(variant.price)
  );
  document.getElementById('detailAddCart').disabled = !canPurchase;
  document.getElementById('detailBuyNow').disabled = !canPurchase;
  if (variant && Number.isFinite(variant.price)) {
    document.getElementById('detailPrice').textContent = formatPrice(variant.price);
  }
  if (!variant) {
    document.getElementById('detailStatus').textContent = 'Selecione uma cor e um tamanho disponíveis.';
  } else if (variant.stock < 1) {
    document.getElementById('detailStatus').textContent = 'Esta variante está sem estoque.';
  } else if (!Number.isFinite(variant.price)) {
    document.getElementById('detailStatus').textContent = 'O preço desta variante não está cadastrado.';
  } else {
    document.getElementById('detailStatus').textContent = `Estoque disponível: ${variant.stock}.`;
  }
}

function renderGallery() {
  const images = product.images.length ? product.images : ['jaqueta-nexus.svg'];
  gallery.innerHTML = `
    <div class="detail-main-image"><img src="${escapeDetailText(images[activeImage])}" alt="${escapeDetailText(product.name)}" /></div>
    ${images.length > 1 ? `
      <div class="detail-thumbnails" aria-label="Imagens do produto">
        ${images.map((image, index) => `
          <button type="button" class="detail-thumbnail ${index === activeImage ? 'is-active' : ''}" data-image-index="${index}" aria-label="Ver imagem ${index + 1}"><img src="${escapeDetailText(image)}" alt="" /></button>
        `).join('')}
      </div>
    ` : ''}
  `;
}

function renderSizes() {
  const color = getSelectedColor();
  const variants = product.variants.filter((variant) => variant.color === color);
  const selectedSize = variants.find(
    (variant) => variant.stock > 0 && Number.isFinite(variant.price)
  )?.size ?? variants[0]?.size;
  sizeOptions.innerHTML = variants.map((variant) => {
    const selected = variant.size === selectedSize;
    const available = variant.stock > 0 && Number.isFinite(variant.price);
    return `
      <label class="size-option ${selected ? 'is-selected' : ''} ${available ? '' : 'is-unavailable'}">
        <input type="radio" name="size" value="${escapeDetailText(variant.size)}" ${selected ? 'checked' : ''} ${available ? '' : 'disabled'} />
        <span>${escapeDetailText(variant.size || '—')}</span>
      </label>
    `;
  }).join('');
  updatePurchaseState();
}

function setFavoriteState(button, isFavorite) {
  button.classList.toggle('is-favorite', isFavorite);
  button.textContent = isFavorite ? '♥ Salvo nos favoritos' : '♡ Favoritar';
  button.setAttribute('aria-pressed', String(isFavorite));
}

function renderProduct() {
  document.title = `${product.name} | Nexus Store`;
  document.getElementById('detailCategory').textContent = product.category;
  document.getElementById('detailName').textContent = product.name;
  document.getElementById('detailPrice').textContent = formatPrice(product.price);
  document.getElementById('detailDescription').textContent = product.description;
  document.getElementById('detailDescriptionCopy').textContent = product.description;
  document.getElementById('detailMaterial').textContent = product.material;
  document.getElementById('detailFit').textContent = product.fit;

  const colors = [...new Set(product.variants.map((variant) => variant.color))];
  const firstAvailable = product.variants.find(
    (variant) => variant.stock > 0 && Number.isFinite(variant.price)
  );
  const initialColor = firstAvailable?.color ?? colors[0] ?? '';
  colorOptions.innerHTML = colors.map((color, index) => `
    <label class="size-option ${color === initialColor ? 'is-selected' : ''}">
      <input type="radio" name="color" value="${escapeDetailText(color)}" ${color === initialColor ? 'checked' : ''} />
      <span>${escapeDetailText(color || 'Não informada')}</span>
    </label>
  `).join('');
  renderSizes();

  const headings = product.category === 'Calça'
    ? ['Tamanho', 'Cintura (cm)', 'Quadril (cm)', 'Comprimento (cm)']
    : product.category === 'Boné'
      ? ['Tamanho', 'Circunferência (cm)', 'Altura (cm)', 'Aba (cm)']
      : ['Tamanho', 'Largura (cm)', 'Comprimento (cm)', 'Manga (cm)'];
  document.getElementById('measurementHeadings').innerHTML = headings
    .map((heading) => `<th scope="col">${escapeDetailText(heading)}</th>`)
    .join('');
  document.getElementById('measurementRows').innerHTML = product.measurements.length
    ? product.measurements.map((row) => `
      <tr>${row.map((value, index) => index === 0
        ? `<th scope="row">${escapeDetailText(value)}</th>`
        : `<td>${escapeDetailText(value)}</td>`).join('')}</tr>
    `).join('')
    : '<tr><td colspan="4">Não há medidas cadastradas para este produto.</td></tr>';
  document.getElementById('detailReviews').innerHTML = product.reviews.length
    ? product.reviews.map((review) => `
      <article class="review-item"><div class="review-topline"><strong>${escapeDetailText(review.name)}</strong><time>${escapeDetailText(review.date)}</time></div><div class="review-stars" aria-label="${review.rating} de 5 estrelas">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div><p>${escapeDetailText(review.text)}</p></article>
    `).join('')
    : '<p>Ainda não há avaliações cadastradas para este produto.</p>';

  const favoriteButton = document.getElementById('detailFavorite');
  const favorites = JSON.parse(localStorage.getItem(favoritesKey) || '[]');
  setFavoriteState(favoriteButton, favorites.includes(product.name));
  renderGallery();
}

function addProductToCart() {
  const variant = getSelectedVariant();
  if (!variant || variant.stock < 1 || !Number.isFinite(variant.price)) {
    updatePurchaseState();
    return null;
  }

  const cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
  const existing = cart.find((item) => Number(item.productId) === variant.id);
  if (existing) {
    if (Number(existing.quantity || 1) >= variant.stock) {
      document.getElementById('detailStatus').textContent = 'A quantidade no carrinho já atingiu o estoque disponível.';
      return null;
    }
    existing.quantity = Number(existing.quantity || 1) + 1;
  } else {
    cart.push({
      id: `db-${variant.id}`,
      productId: variant.id,
      name: product.name,
      size: variant.size,
      color: variant.color,
      price: variant.price,
      quantity: 1,
    });
  }
  localStorage.setItem(cartKey, JSON.stringify(cart));
  return variant;
}

gallery.addEventListener('click', (event) => {
  const button = event.target.closest('[data-image-index]');
  if (!button || !product) return;
  activeImage = Number(button.dataset.imageIndex);
  renderGallery();
});

colorOptions.addEventListener('change', (event) => {
  colorOptions.querySelectorAll('.size-option').forEach((option) => {
    option.classList.toggle('is-selected', option.contains(event.target));
  });
  if (product) renderSizes();
});

sizeOptions.addEventListener('change', (event) => {
  sizeOptions.querySelectorAll('.size-option').forEach((option) => {
    option.classList.toggle('is-selected', option.contains(event.target));
  });
  updatePurchaseState();
});

document.getElementById('detailFavorite').addEventListener('click', (event) => {
  if (!product) return;
  const favorites = JSON.parse(localStorage.getItem(favoritesKey) || '[]');
  const nextFavorites = favorites.includes(product.name)
    ? favorites.filter((name) => name !== product.name)
    : [...favorites, product.name];
  localStorage.setItem(favoritesKey, JSON.stringify(nextFavorites));
  setFavoriteState(event.currentTarget, nextFavorites.includes(product.name));
});

document.getElementById('detailAddCart').addEventListener('click', () => {
  const variant = addProductToCart();
  if (variant) {
    document.getElementById('detailStatus').textContent =
      `${product.name}, ${variant.color}, tamanho ${variant.size}, foi adicionado à sacola.`;
  }
});

document.getElementById('detailBuyNow').addEventListener('click', () => {
  const variant = addProductToCart();
  if (variant) document.getElementById('cartToggle')?.click();
});

window.NEXUS_PRODUCTS_READY
  .then((products) => {
    product = products.find((item) => item.id === params.get('id')) || null;
    if (!product) {
      document.getElementById('detailName').textContent = 'Produto não encontrado';
      document.getElementById('detailStatus').textContent = 'Volte à loja e escolha um produto cadastrado.';
      document.getElementById('detailAddCart').disabled = true;
      document.getElementById('detailBuyNow').disabled = true;
      return;
    }
    renderProduct();
  })
  .catch((error) => {
    document.getElementById('detailName').textContent = 'Catálogo indisponível';
    document.getElementById('detailStatus').textContent = 'Verifique se o servidor local está disponível.';
    document.getElementById('detailAddCart').disabled = true;
    document.getElementById('detailBuyNow').disabled = true;
    console.error('Falha ao carregar detalhes do produto:', error);
  });
