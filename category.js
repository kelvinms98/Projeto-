const categoryLabels = {
  camiseta: 'Camisetas',
  moletom: 'Moletons e blusas',
  calca: 'Calças',
  bone: 'Bonés',
  touca: 'Toucas',
};
const params = new URLSearchParams(window.location.search);
const selectedCategory = params.get('categoria') || '';
const categoryTitle = document.getElementById('categoryTitle');
const categoryCount = document.getElementById('categoryCount');
const categoryProducts = document.getElementById('categoryProducts');
const categoryEmpty = document.getElementById('categoryEmpty');
const categoryTabs = document.getElementById('categoryTabs');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function escapeCategoryText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

const tabs = [
  { slug: '', label: 'Todas' },
  ...Object.entries(categoryLabels).map(([slug, label]) => ({ slug, label }))
];
categoryTabs.innerHTML = tabs.map(({ slug, label }) => `
  <a class="category-tab ${slug === selectedCategory ? 'is-active' : ''}" href="categoria.html${slug ? `?categoria=${slug}` : ''}" ${slug === selectedCategory ? 'aria-current="page"' : ''}>${label}</a>
`).join('');

function renderCategory(products) {
  const matchingProducts = products.filter(
    (product) => !selectedCategory || product.categorySlug === selectedCategory
  );
  const selectedLabel = categoryLabels[selectedCategory] || 'Todas as peças';
  categoryTitle.textContent = selectedCategory && !categoryLabels[selectedCategory]
    ? 'Categoria não encontrada'
    : selectedLabel;
  document.title = `${categoryTitle.textContent} | Nexus Store`;
  categoryCount.textContent = `${matchingProducts.length} ${matchingProducts.length === 1 ? 'peça' : 'peças'}`;
  categoryEmpty.hidden = matchingProducts.length > 0;
  categoryProducts.innerHTML = matchingProducts.map((product) => {
    const prices = product.variants
      .map((variant) => variant.price)
      .filter((price) => Number.isFinite(price));
    const priceLabel = prices.length
      ? money.format(Math.min(...prices))
      : 'Preço não cadastrado';
    const sizes = [...new Set(product.variants.map((variant) => variant.size).filter(Boolean))];
    const colors = [...new Set(product.variants.map((variant) => variant.color).filter(Boolean))];
    const variantSummary = [
      colors.length ? `Cores: ${colors.join(', ')}` : '',
      sizes.length ? `Tamanhos: ${sizes.join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    const detailUrl = product.detailPage || `produto.html?id=${encodeURIComponent(product.id)}`;

    return `
      <article class="product-card category-product-card">
        <div class="product-image">
          <a class="category-product-image" href="${escapeCategoryText(detailUrl)}" aria-label="Ver ${escapeCategoryText(product.name)}">
            <img src="${escapeCategoryText(product.images[0])}" alt="${escapeCategoryText(product.name)}" />
          </a>
          <button type="button" class="favorite-btn category-favorite" data-favorite="${escapeCategoryText(product.name)}" aria-label="Favoritar ${escapeCategoryText(product.name)}" aria-pressed="false">♡</button>
        </div>
        <div class="product-body">
          <div class="product-topline"><span>${escapeCategoryText(product.category)}</span><strong>${escapeCategoryText(priceLabel)}</strong></div>
          <h2><a href="${escapeCategoryText(detailUrl)}">${escapeCategoryText(product.name)}</a></h2>
          <p>${escapeCategoryText(variantSummary || product.description)}</p>
          <a class="category-view-product" href="${escapeCategoryText(detailUrl)}">Ver detalhes</a>
        </div>
      </article>
    `;
  }).join('');

  categoryProducts.querySelectorAll('[data-favorite]').forEach((button) => {
    const isFavorite = JSON.parse(localStorage.getItem('nexus-favorites') || '[]')
      .includes(button.dataset.favorite);
    button.classList.toggle('is-favorite', isFavorite);
    button.textContent = isFavorite ? '♥' : '♡';
  });
}

categoryProducts.addEventListener('click', (event) => {
  const button = event.target.closest('[data-favorite]');
  if (!button) return;
  const name = button.dataset.favorite;
  const favorites = JSON.parse(localStorage.getItem('nexus-favorites') || '[]');
  const nextFavorites = favorites.includes(name)
    ? favorites.filter((favorite) => favorite !== name)
    : [...favorites, name];
  localStorage.setItem('nexus-favorites', JSON.stringify(nextFavorites));
  const isFavorite = nextFavorites.includes(name);
  button.classList.toggle('is-favorite', isFavorite);
  button.textContent = isFavorite ? '♥' : '♡';
  button.setAttribute('aria-pressed', String(isFavorite));
});

window.NEXUS_PRODUCTS_READY
  .then(renderCategory)
  .catch((error) => {
    categoryTitle.textContent = 'Catálogo indisponível';
    categoryCount.textContent = '';
    categoryProducts.innerHTML = '';
    categoryEmpty.hidden = false;
    categoryEmpty.querySelector('h2').textContent = 'Não foi possível carregar os produtos.';
    categoryEmpty.querySelector('p').textContent = error.message || 'Não foi possível carregar o catálogo.';
    console.error('Falha ao carregar catálogo por categoria:', error);
  });
