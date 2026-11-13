(() => {
  const isLoopbackHost = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  if (isLoopbackHost && window.location.port === '5500') {
    const scriptPath = new URL(document.currentScript.src).pathname;
    const projectPath = scriptPath.slice(0, scriptPath.lastIndexOf('/'));
    const target = new URL(window.location.href);
    if (projectPath && target.pathname.startsWith(projectPath)) {
      target.pathname = target.pathname.slice(projectPath.length) || '/';
    }
    target.protocol = 'http:';
    target.port = '8081';
    window.location.replace(target.href);
    return;
  }

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
    if (normalized.includes('calça') || normalized.includes('calca') || normalized.includes('cargo') || normalized.includes('patchwork') || normalized.includes('baggy')) {
      return { name: 'Calça', slug: 'calca' };
    }
    if (normalized.includes('beanie') || normalized.includes('touca')) {
      return { name: 'Touca', slug: 'touca' };
    }
    if (normalized.includes('boné') || normalized.includes('bone') || normalized.includes('cap') || normalized.includes('panel')) {
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
    if (category.slug === 'bone') return 'imagens/jaqueta-realista.svg';
    if (category.slug === 'touca') return 'imagens/BD1.jpeg';
    if (category.slug === 'calca' || category.slug === 'jaqueta') return 'imagens/jaqueta-nexus.svg';
    if (category.slug === 'moletom') return 'imagens/Iron Mike Tyson.jpg';
    return 'imagens/Camisa-neymar.jpg.jpg';
  }

  const productProfiles = {
    'NEXUS NEYMAR JR. 100% CORRE PAULISTÃO 2012': {
      description: 'Camiseta NEXUS inspirada no corre do Paulistão 2012 e na trajetória do Neymar Jr.',
      detailPage: 'nexus-neymar-jr.html',
      material: '100% algodão — estimativa',
      fit: 'Oversized, caimento amplo — estimativa',
      measurements: [
        ['P', '50', '68', '21'],
        ['M', '53', '71', '22'],
        ['G', '56', '74', '23'],
        ['GG', '59', '77', '24'],
      ],
      reviews: [
        { name: 'Lívia M.', rating: 5, text: 'A estampa tem bastante presença e o caimento amplo combina com a proposta da peça.' },
        { name: 'Rafael C.', rating: 4, text: 'Visual marcante e confortável. A tabela de medidas ajuda a escolher o tamanho.' },
      ],
    },
    'NEXUS “WASTED FUR” HOODIE': {
      description: 'Moletom NEXUS WASTED FUR com visual marcante e modelagem confortável.',
      detailPage: 'nexus-wasted-fur-hoodie.html',
      material: 'Moletom: 80% algodão e 20% poliéster — estimativa',
      fit: 'Oversized, com punhos e barra em ribana — estimativa',
      measurements: [
        ['P', '58', '66', '60'],
        ['M', '61', '69', '62'],
        ['G', '64', '72', '64'],
        ['GG', '67', '75', '66'],
      ],
      reviews: [
        { name: 'Caio N.', rating: 5, text: 'O formato amplo e os punhos dão um visual confortável para usar no dia a dia.' },
        { name: 'Marina T.', rating: 4, text: 'Gostei da proposta do hoodie e do espaço na modelagem para usar com outra camada.' },
      ],
    },
    'NEXUS PATCHWORK BAGGY': {
      description: 'Calça baggy NEXUS PATCHWORK com caimento amplo e painéis de tecido.',
      detailPage: 'nexus-patchwork-baggy.html',
      material: 'Sarja: 100% algodão — estimativa',
      fit: 'Baggy, cintura média e pernas amplas — estimativa',
      measurements: [
        ['38', '76', '102', '106'],
        ['40', '80', '106', '108'],
        ['42', '84', '110', '110'],
        ['44', '88', '114', '112'],
        ['46', '92', '118', '114'],
      ],
      reviews: [
        { name: 'Bruno F.', rating: 5, text: 'O caimento baggy e os recortes deixam a calça com bastante personalidade.' },
        { name: 'Júlia R.', rating: 4, text: 'Boa proposta de patchwork e modelagem folgada. Vale conferir a cintura na tabela.' },
      ],
    },
    'BEANIE DESTROYED NEON': {
      description: 'Touca BEANIE DESTROYED NEON com acabamento desgastado e destaque neon.',
      detailPage: 'beanie-destroyed-neon.html',
      material: 'Malha 100% acrílica — estimativa',
      fit: 'Tricô canelado com ajuste elástico — estimativa',
      measurements: [
        ['Único', '44', '22', '18'],
      ],
      reviews: [
        { name: 'Bianca A.', rating: 5, text: 'O detalhe neon dá destaque ao visual e o formato canelado combina com a proposta.' },
        { name: 'Lucas V.', rating: 4, text: 'A ideia do acabamento destroyed ficou interessante para completar o look.' },
      ],
    },
    '5-PANEL PIET - OLIVE MINIMAL': {
      description: 'Boné 5-panel em tom olive minimal.',
      detailPage: '5-panel-piet-olive.html',
      material: 'Sarja 100% algodão — estimativa',
      fit: 'Modelo 5-panel com ajuste traseiro — estimativa',
      measurements: [
        ['Único', '58–62', '11', '7'],
      ],
      reviews: [
        { name: 'Enzo P.', rating: 5, text: 'A cor olive é fácil de combinar e o formato 5-panel deixa o boné com visual limpo.' },
        { name: 'Camila D.', rating: 4, text: 'Gostei do estilo minimalista e da possibilidade de ajustar atrás.' },
      ],
    },
  };

  const serverHint = window.location.protocol === 'file:'
    ? 'A loja foi aberta como arquivo local. Inicie a opção 1 em comandos.bat e acesse http://localhost:8081.'
    : 'Servidor local indisponível. Inicie a opção 1 em comandos.bat e acesse http://localhost:8081.';

  window.NEXUS_PRODUCTS_READY = fetch('/api/products', { cache: 'no-store' })
    .catch((error) => {
      if (error instanceof TypeError) throw new Error(serverHint, { cause: error });
      throw error;
    })
    .then(async (response) => {
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(
          `O servidor em ${window.location.origin} retornou uma página HTML para o catálogo. Abra http://localhost:8081 e mantenha o servidor local ativo.`,
        );
      }
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
          const profile = productProfiles[name] || {};
          const galleryImages = Array.isArray(row.galleryImages)
            ? row.galleryImages.filter((image) => typeof image === 'string' && image)
            : [];
          const images = row.hasCustomImage && row.imageUrl
            ? [row.imageUrl, ...galleryImages.filter((image) => image !== row.imageUrl)]
            : galleryImages.length
              ? galleryImages
              : row.imageUrl
                ? [row.imageUrl]
                : [];
          product = {
            id: `db-${slugify(name) || row.id}-${row.id}`,
            name,
            category: category.name,
            categorySlug: category.slug,
            description: profile.description || 'Produto cadastrado no estoque. Escolha uma cor e um tamanho disponíveis.',
            material: profile.material || 'Não informado no cadastro',
            fit: profile.fit || 'Não informado no cadastro',
            detailPage: profile.detailPage || null,
            images: images.length ? images : [imageFor(category)],
            variants: [],
            measurements: profile.measurements || [],
            reviews: profile.reviews || [],
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
