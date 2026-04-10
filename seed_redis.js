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
  { id: 'esp',  name: 'Espresso',      price: 2.50, category: 'bebida', stock: 40 },
  { id: 'cap',  name: 'Cappuccino',    price: 3.80, category: 'bebida', stock: 35 },
  { id: 'lat',  name: 'Latte',         price: 4.20, category: 'bebida', stock: 30 },
  { id: 'mat',  name: 'Matcha Latte',  price: 4.80, category: 'bebida', stock: 20 },
  { id: 'cro',  name: 'Croissant',     price: 3.50, category: 'comida', stock: 25 },
  { id: 'muf',  name: 'Muffin',        price: 2.90, category: 'comida', stock: 28 },
  { id: 'sand', name: 'Sandwich',      price: 5.50, category: 'comida', stock: 18 },
  { id: 'aco',  name: 'Agua con gas',  price: 2.00, category: 'bebida', stock: 50 },
];

const now = Date.now();

const SAMPLE_ORDERS = [
  {
    id: 'order:1001',
    user: 'Ana García',
    items: JSON.stringify([{ id: 'lat', name: 'Latte', price: 4.20, qty: 2 }]),
    total: 8.40,
    status: 'completed',
    createdAt: now - 3600000,
    expiresAt: now - 3540000,
  },
  {
    id: 'order:1002',
    user: 'Carlos López',
    items: JSON.stringify([{ id: 'cap', name: 'Cappuccino', price: 3.80, qty: 1 }, { id: 'cro', name: 'Croissant', price: 3.50, qty: 1 }]),
    total: 7.30,
    status: 'completed',
    createdAt: now - 1800000,
    expiresAt: now - 1740000,
  },
  {
    id: 'order:1003',
    user: 'María Fernández',
    items: JSON.stringify([{ id: 'esp', name: 'Espresso', price: 2.50, qty: 1 }]),
    total: 2.50,
    status: 'reserved',
    createdAt: now,
    expiresAt: now + 60000,
  },
];

function log(icon, msg)  { console.log(`  ${icon}  ${msg}`); }
function section(title)  { console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`); }

async function seed() {
  
  console.log('Limpiando claves anteriores');
  const oldKeys = await client.keys('brewhaus:*');
  if (oldKeys.length > 0) {
    await client.del(...oldKeys);
    console.log('🗑 ', `Eliminadas ${oldKeys.length} claves anteriores \n`);
  } else {
    console.log('✔ ', 'No había claves previas \n');
  }

  console.log('Cargando productos...');

  for (const product of PRODUCTS) {
    const key = `brewhaus:product:${product.id}`;
    await client.hset(key, {
      id:        product.id,
      name:      product.name,
      price:     product.price.toFixed(2),
      category:  product.category,
      stock:     String(product.stock),
      available: product.stock > 0 ? '1' : '0',
    });
    // TTL de 1 hora para simular caché con expiración
    log('📦', `Hash creado: ${key}  →  ${product.name} ($${product.price.toFixed(2)})`);
  }

  // ── 3. SET de IDs de productos disponibles ─────────────────
  section('Creando Set de IDs disponibles');
  const availableKey = 'brewhaus:catalog:available';
  for (const p of PRODUCTS.filter(p => p.stock > 0)) {
    await client.sadd(availableKey, p.id);
  }
  log('🗂 ', `Set creado: ${availableKey}  →  ${PRODUCTS.filter(p => p.stock > 0).length} productos`);

  // ── 4. ÓRDENES — Hash por orden ────────────────────────────
  section('Cargando órdenes de muestra (Hashes)');
  for (const order of SAMPLE_ORDERS) {
    await client.hset(order.id, {
      user:      order.user,
      items:     order.items,
      total:     order.total.toFixed(2),
      status:    order.status,
      createdAt: order.createdAt,
      expiresAt: order.expiresAt,
    });
    log('🧾', `Hash creado: ${order.id}  →  ${order.user} — ${order.status}`);
  }

  // ── 5. QUEUE — List (cola FIFO de órdenes reservadas) ──────
  section('Poblando queue de órdenes (List)');
  const queueKey = 'brewhaus:queue:pending';
  const pendingOrders = SAMPLE_ORDERS.filter(o => o.status === 'reserved' || o.status === 'processing');
  for (const order of pendingOrders) {
    await client.rpush(queueKey, order.id);
    log('📋', `Encolado en ${queueKey}  →  ${order.id}`);
  }

  // ── 6. QUEUE completed ────────────────────────────────────
  section('Poblando queue de completadas (List)');
  const completedQueueKey = 'brewhaus:queue:completed';
  const completedOrders = SAMPLE_ORDERS.filter(o => o.status === 'completed');
  for (const order of completedOrders) {
    await client.rpush(completedQueueKey, order.id);
    log('✅', `Encolado en ${completedQueueKey}  →  ${order.id}`);
  }

// ── 7. CONTADORES — Strings ────────────────────────────────
  section('Inicializando contadores (Strings)');
  await client.set('brewhaus:stats:total_orders',     SAMPLE_ORDERS.length);
  await client.set('brewhaus:stats:completed_orders', SAMPLE_ORDERS.filter(o => o.status === 'completed').length);
  await client.set('brewhaus:stats:cache:hits',       0);
  await client.set('brewhaus:stats:cache:misses',     0);
  await client.set('brewhaus:stats:order_id_seq',     1003);
  log('🔢', 'Contadores inicializados: total_orders, completed_orders, cache_hits, cache_misses, order_id_seq');

  // ── 8. SORTED SET — Leaderboard de clientes ────────────────
  section('Creando leaderboard de clientes frecuentes (Sorted Set)');
  const leaderboardKey = 'brewhaus:leaderboard:customers';
  await client.zadd(leaderboardKey, 1, 'Ana García');
  await client.zadd(leaderboardKey, 1, 'Carlos López');
  await client.zadd(leaderboardKey, 1, 'María Fernández');
  log('🏆', `Sorted Set creado: ${leaderboardKey}  →  3 clientes`);

  // ── 9. SORTED SET — Productos más pedidos ─────────────────
  section('Creando ranking de productos más pedidos (Sorted Set)');
  const popularKey = 'brewhaus:leaderboard:products';
  await client.zadd(popularKey, 3, 'Latte');
  await client.zadd(popularKey, 2, 'Cappuccino');
  await client.zadd(popularKey, 4, 'Croissant');
  await client.zadd(popularKey, 1, 'Espresso');
  await client.zadd(popularKey, 0, 'Matcha Latte');
  await client.zadd(popularKey, 2, 'Muffin');
  await client.zadd(popularKey, 3, 'Sandwich');
  await client.zadd(popularKey,  1, 'Agua con gas');
  log('📊', `Sorted Set creado: ${popularKey}  →  8 productos`);

  // ── RESUMEN ────────────────────────────────────────────────
  section('Resumen final');
  const allKeys = await client.keys('brewhaus:*');
  log('✅', `Seed completado. Total de claves en Redis: ${allKeys.length}`);
  console.log('');
  allKeys.sort().forEach(k => console.log(`   ${k}`));
  console.log('');

  await client.quit();
}

seed().catch(err => {
  console.error('Error:', err);
  client.quit();
  process.exit(1);
});
