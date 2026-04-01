/**
 * seed_redis.js — Brewhaus
 * Pobla el catálogo de productos en Redis.
 *
 * Uso:
 *   npm install ioredis
 *   node seed_redis.js
 */

const Redis = require('ioredis');

const client = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASS || undefined,
});

const PRODUCTS = [
  { id: 'esp',  name: 'Espresso',      price: 2.50, category: 'bebida' },
  { id: 'cap',  name: 'Cappuccino',    price: 3.80, category: 'bebida' },
  { id: 'lat',  name: 'Latte',         price: 4.20, category: 'bebida' },
  { id: 'mat',  name: 'Matcha Latte',  price: 4.80, category: 'bebida' },
  { id: 'cro',  name: 'Croissant',     price: 3.50, category: 'comida' },
  { id: 'muf',  name: 'Muffin',        price: 2.90, category: 'comida' },
  { id: 'sand', name: 'Sandwich',      price: 5.50, category: 'comida' },
  { id: 'aco',  name: 'Agua con gas',  price: 2.00, category: 'bebida' },
];

async function seed() {
  console.log('Cargando productos...');

  for (const product of PRODUCTS) {
    const key = `brewhaus:product:${product.id}`;
    await client.hset(key, {
      id:       product.id,
      name:     product.name,
      price:    product.price.toFixed(2),
      category: product.category,
    });
    console.log(`OK  ${key}  →  ${product.name}`);
  }

  console.log(`\nListo. ${PRODUCTS.length} productos cargados.`);
  await client.quit();
}

seed().catch(err => {
  console.error('Error:', err);
  client.quit();
  process.exit(1);
});
