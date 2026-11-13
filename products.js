(() => {
  function slugify(value) {
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function categoryFor(name) {
    const normalized = name.toLowerCase();
    if (normalized.includes('calça') || normalized.includes('calca') || normalized.includes('cargo')) {
      return { name: 'Calça', slug: 'calca' };
    }
    if (normalized.includes('boné') || normalized.includes('bone') || normalized.includes('cap')) {
      return { name: 'Boné', slug: 'bone' };
    }
    if (normalized.includes('moletom') || normalized.includes('hoodie')) {
      return { name: 'Moletom', slug: 'moletom' };
    }
    if (normalized.includes('jaqueta') || normalized.includes('jacket')) {
      return { name: 'Jaqueta', slug: 'jaqueta' };
    }
    return { name: 'Camiseta', slug: 'camiseta' };
  }

  function imageFor(category) {
    if (category.slug === 'bone') return 'jaqueta-realista.svg';
    if (category.slug === 'calca' || category.slug === 'jaqueta') return 'jaqueta-nexus.svg';
    if (category.slug === 'moletom') return 'Iron Mike Tyson.jpg';
    return 'Camisa-neymar.jpg.jpg';
  }

  window.NEXUS_PRODUCTS_READY = fetch('/api/products')
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível carregar o catálogo do banco de dados.');
      }
      if (!result || !Array.isArray(result.data)) {
        throw new Error('O catálogo recebido do banco de dados está em formato inválido.');
      }
      return result.data;
    })
    .then((rows) => {
      const groups = new Map();
      rows.forEach((row) => {
        const name = String(row.name || '').trim();
        if (!name) return;

        let product = groups.get(name);
        if (!product) {
          const category = categoryFor(name);
          product = {
            id: `db-${slugify(name) || row.id}-${row.id}`,
            name,
            category: category.name,
            categorySlug: category.slug,
            description: 'Produto cadastrado no estoque. Escolha uma cor e um tamanho disponíveis.',
            material: 'Não informado no cadastro',
            fit: 'Não informado no cadastro',
            images: [row.imageUrl || imageFor(category)],
            variants: [],
            measurements: [],
            reviews: [],
          };
          groups.set(name, product);
        }

        product.variants.push({
          id: Number(row.id),
          size: String(row.size ?? ''),
          color: String(row.color ?? ''),
          price: row.price === null ? null : Number(row.price),
          stock: Number(row.stock),
        });
      });

      const products = [...groups.values()];
      products.forEach((product) => {
        product.variants.sort((left, right) =>
          left.color.localeCompare(right.color, 'pt-BR')
          || left.size.localeCompare(right.size, 'pt-BR', { numeric: true })
        );
        product.sizes = [...new Set(product.variants.map((variant) => variant.size))];
        product.colors = [...new Set(product.variants.map((variant) => variant.color))];
        const prices = product.variants
          .map((variant) => variant.price)
          .filter((price) => Number.isFinite(price));
        product.price = prices.length ? Math.min(...prices) : null;
      });

      window.NEXUS_PRODUCTS = Object.fromEntries(products.map((product) => [product.id, product]));
      return products;
    });
})();
