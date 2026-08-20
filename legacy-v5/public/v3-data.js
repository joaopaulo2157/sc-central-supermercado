// ==========================================================
// SC CENTRAL V3 - DADOS PADRÃO COMPARTILHADOS
// Utilizado pela loja e pelo painel administrativo.
// ==========================================================

window.SC_V3_DEFAULTS = {
  settings: {
    storeName: "Supermercado SC Central",
    whatsapp: "55XXXXXXXXXXX",
    cartGoal: 200,
    minimumOrder: 25,
    primaryMessage: "Economia, variedade e praticidade todos os dias.",
    openingHours: "Segunda a sábado • 07h às 20h",
    address: "Configure o endereço no painel administrativo",
    allowDelivery: true,
    allowPickup: true
  },

  coupons: {
    BEMVINDO5: { type: "percent", value: 5, label: "5% de desconto", active: true },
    CENTRAL10: { type: "fixed", value: 10, label: "R$ 10,00 de desconto", active: true },
    FEIRAO8: { type: "percent", value: 8, label: "8% de desconto", active: true }
  },

  neighborhoods: [
    { id: 1, name: "Centro", fee: 5, minimum: 25, active: true },
    { id: 2, name: "Bairro próximo", fee: 7, minimum: 30, active: true },
    { id: 3, name: "Zona urbana", fee: 10, minimum: 40, active: true },
    { id: 4, name: "Retirada na loja", fee: 0, minimum: 0, active: true }
  ],

  banners: [
    {
      id: 1,
      eyebrow: "V5 • OFERTAS DA SEMANA",
      title: "Sua compra completa com mais praticidade.",
      text: "Pesquise, adicione ao carrinho e envie tudo organizado para o WhatsApp do supermercado.",
      button: "Ver ofertas",
      target: "#ofertas",
      icon: "🛒",
      image: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1600&q=80",
      theme: "blue",
      active: true
    },
    {
      id: 2,
      eyebrow: "HORTIFRUTI FRESQUINHO",
      title: "Frutas, verduras e legumes todos os dias.",
      text: "Uma vitrine especial para destacar o frescor e a variedade do setor de hortifruti.",
      button: "Comprar hortifruti",
      target: "#produtos",
      icon: "🥬",
      image: "",
      theme: "fresh",
      active: true
    },
    {
      id: 3,
      eyebrow: "FINALIZAÇÃO INTELIGENTE",
      title: "O pedido chega pronto para o atendente.",
      text: "Cliente, endereço, pagamento, entrega e observações seguem juntos em uma única mensagem.",
      button: "Começar compra",
      target: "#produtos",
      icon: "💬",
      image: "",
      theme: "dark",
      active: true
    }
  ],

  products: [
    { id: 1, name: "Arroz Branco Tipo 1", category: "mercearia", unit: "Pacote 5kg", price: 28.90, oldPrice: 32.99, badge: "OFERTA", emoji: "🍚", stock: 48, featured: true, image: "https://loremflickr.com/720/720/rice,food,supermarket?lock=1" },
    { id: 2, name: "Feijão Carioca Premium", category: "mercearia", unit: "Pacote 1kg", price: 7.99, oldPrice: 9.49, badge: "OFERTA", emoji: "🫘", stock: 66, featured: true, image: "https://loremflickr.com/720/720/beans,food,supermarket?lock=2" },
    { id: 3, name: "Leite Integral", category: "bebidas", unit: "Caixa 1L", price: 5.79, oldPrice: 6.49, badge: "OFERTA", emoji: "🥛", stock: 80, featured: true, image: "https://loremflickr.com/720/720/milk,carton,supermarket?lock=3" },
    { id: 4, name: "Refrigerante Cola", category: "bebidas", unit: "Garrafa 2L", price: 8.99, oldPrice: 10.99, badge: "OFERTA", emoji: "🥤", stock: 54, featured: true, image: "https://loremflickr.com/720/720/cola,soda,bottle?lock=4" },
    { id: 5, name: "Banana Prata", category: "hortifruti", unit: "Preço por kg", price: 5.49, oldPrice: null, badge: "FRESQUINHO", emoji: "🍌", stock: 35, featured: true, image: "https://loremflickr.com/720/720/banana,fruit?lock=5" },
    { id: 6, name: "Tomate Selecionado", category: "hortifruti", unit: "Preço por kg", price: 6.79, oldPrice: 8.29, badge: "OFERTA", emoji: "🍅", stock: 24, featured: true, image: "https://loremflickr.com/720/720/tomato,vegetable?lock=6" },
    { id: 7, name: "Carne Bovina de Primeira", category: "acougue", unit: "Preço por kg", price: 34.90, oldPrice: 39.90, badge: "OFERTA", emoji: "🥩", stock: 20, featured: true, image: "https://loremflickr.com/720/720/beef,steak,meat?lock=7" },
    { id: 8, name: "Frango Inteiro Resfriado", category: "acougue", unit: "Preço por kg", price: 10.99, oldPrice: 12.49, badge: "OFERTA", emoji: "🍗", stock: 26, featured: true, image: "https://loremflickr.com/720/720/chicken,meat?lock=8" },
    { id: 9, name: "Pão Francês", category: "padaria", unit: "Preço por kg", price: 14.90, oldPrice: null, badge: "PADARIA", emoji: "🥖", stock: 90, featured: true, image: "https://loremflickr.com/720/720/bread,bakery?lock=9" },
    { id: 10, name: "Bolo Caseiro", category: "padaria", unit: "Unidade", price: 18.90, oldPrice: 21.90, badge: "OFERTA", emoji: "🍰", stock: 14, featured: true, image: "https://loremflickr.com/720/720/cake,bakery?lock=10" },
    { id: 11, name: "Detergente Neutro", category: "limpeza", unit: "Frasco 500ml", price: 2.79, oldPrice: 3.49, badge: "OFERTA", emoji: "🧴", stock: 72, featured: false, image: "https://loremflickr.com/720/720/detergent,bottle,cleaning?lock=11" },
    { id: 12, name: "Sabão em Pó", category: "limpeza", unit: "Pacote 1,6kg", price: 16.90, oldPrice: 19.99, badge: "OFERTA", emoji: "🧼", stock: 41, featured: true, image: "https://loremflickr.com/720/720/laundry,powder,detergent?lock=12" },
    { id: 13, name: "Café Torrado e Moído", category: "mercearia", unit: "Pacote 500g", price: 17.49, oldPrice: 19.90, badge: "OFERTA", emoji: "☕", stock: 37, featured: true, image: "https://loremflickr.com/720/720/coffee,package?lock=13" },
    { id: 14, name: "Açúcar Cristal", category: "mercearia", unit: "Pacote 1kg", price: 4.89, oldPrice: null, badge: "ECONOMIA", emoji: "🧂", stock: 57, featured: false, image: "https://loremflickr.com/720/720/sugar,package?lock=14" },
    { id: 15, name: "Óleo de Soja", category: "mercearia", unit: "Garrafa 900ml", price: 7.49, oldPrice: 8.39, badge: "OFERTA", emoji: "🫗", stock: 43, featured: true, image: "https://loremflickr.com/720/720/cooking,oil,bottle?lock=15" },
    { id: 16, name: "Maçã Nacional", category: "hortifruti", unit: "Preço por kg", price: 9.90, oldPrice: null, badge: "FRESQUINHO", emoji: "🍎", stock: 28, featured: true, image: "https://loremflickr.com/720/720/apple,fruit?lock=16" },
    { id: 17, name: "Cebola Branca", category: "hortifruti", unit: "Preço por kg", price: 5.29, oldPrice: 6.19, badge: "OFERTA", emoji: "🧅", stock: 30, featured: false, image: "https://loremflickr.com/720/720/onion,vegetable?lock=17" },
    { id: 18, name: "Água Mineral", category: "bebidas", unit: "Garrafa 1,5L", price: 3.29, oldPrice: null, badge: "MAIS VENDIDO", emoji: "💧", stock: 94, featured: true, image: "https://loremflickr.com/720/720/water,bottle?lock=18" },
    { id: 19, name: "Suco de Laranja", category: "bebidas", unit: "Garrafa 1L", price: 8.49, oldPrice: 9.79, badge: "OFERTA", emoji: "🍊", stock: 19, featured: false, image: "https://loremflickr.com/720/720/orange,juice,bottle?lock=19" },
    { id: 20, name: "Papel Higiênico", category: "limpeza", unit: "Pacote c/ 12 rolos", price: 18.90, oldPrice: 22.90, badge: "OFERTA", emoji: "🧻", stock: 38, featured: true, image: "https://loremflickr.com/720/720/toilet,paper,package?lock=20" },
    { id: 21, name: "Macarrão Espaguete", category: "mercearia", unit: "Pacote 500g", price: 4.39, oldPrice: 5.19, badge: "OFERTA", emoji: "🍝", stock: 63, featured: false, image: "https://loremflickr.com/720/720/spaghetti,pasta,package?lock=21" },
    { id: 22, name: "Farinha de Trigo", category: "mercearia", unit: "Pacote 1kg", price: 5.69, oldPrice: null, badge: "ECONOMIA", emoji: "🌾", stock: 46, featured: false, image: "https://loremflickr.com/720/720/wheat,flour,package?lock=22" },
    { id: 23, name: "Ovos Brancos", category: "mercearia", unit: "Bandeja c/ 30", price: 21.90, oldPrice: 24.90, badge: "OFERTA", emoji: "🥚", stock: 18, featured: true, image: "https://loremflickr.com/720/720/eggs,carton?lock=23" },
    { id: 24, name: "Queijo Mussarela", category: "frios", unit: "Preço por kg", price: 39.90, oldPrice: 44.90, badge: "OFERTA", emoji: "🧀", stock: 16, featured: true, image: "https://loremflickr.com/720/720/mozzarella,cheese?lock=24" },
    { id: 25, name: "Presunto Cozido", category: "frios", unit: "Preço por kg", price: 26.90, oldPrice: null, badge: "FATIADOS", emoji: "🥓", stock: 18, featured: false, image: "https://loremflickr.com/720/720/ham,sliced?lock=25" },
    { id: 26, name: "Iogurte Natural", category: "frios", unit: "Pote 170g", price: 3.69, oldPrice: 4.29, badge: "OFERTA", emoji: "🥣", stock: 44, featured: false, image: "https://loremflickr.com/720/720/yogurt,cup?lock=26" },
    { id: 27, name: "Batata Inglesa", category: "hortifruti", unit: "Preço por kg", price: 6.49, oldPrice: null, badge: "FRESQUINHO", emoji: "🥔", stock: 29, featured: false, image: "https://loremflickr.com/720/720/potato,vegetable?lock=27" },
    { id: 28, name: "Alface Crespa", category: "hortifruti", unit: "Unidade", price: 3.49, oldPrice: null, badge: "FRESQUINHO", emoji: "🥬", stock: 12, featured: true, image: "https://loremflickr.com/720/720/lettuce,vegetable?lock=28" },
    { id: 29, name: "Linguiça Toscana", category: "acougue", unit: "Preço por kg", price: 21.90, oldPrice: 24.90, badge: "OFERTA", emoji: "🌭", stock: 17, featured: false, image: "https://loremflickr.com/720/720/sausage,meat?lock=29" },
    { id: 30, name: "Água Sanitária", category: "limpeza", unit: "Frasco 1L", price: 4.29, oldPrice: null, badge: "ECONOMIA", emoji: "🧴", stock: 51, featured: false, image: "https://loremflickr.com/720/720/bleach,bottle,cleaning?lock=30" },
    { id: 31, name: "Amaciante Concentrado", category: "limpeza", unit: "Frasco 1L", price: 11.90, oldPrice: 13.90, badge: "OFERTA", emoji: "🫧", stock: 36, featured: false, image: "https://loremflickr.com/720/720/fabric,softener,bottle?lock=31" },
    { id: 32, name: "Biscoito Recheado", category: "mercearia", unit: "Pacote 120g", price: 2.99, oldPrice: 3.49, badge: "OFERTA", emoji: "🍪", stock: 70, featured: false, image: "https://loremflickr.com/720/720/cookies,package?lock=32" }
  ]
};
