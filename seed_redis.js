/**
 * seed_redis.js — Brewhaus
 * Pobla la base de datos Redis con la estructura inicial de la aplicación.
 *
 * Uso:
 *   npm install ioredis
 *   node seed_redis.js
 *
 * Variables de entorno opcionales:
 *   REDIS_HOST  (default: 127.0.0.1)
 *   REDIS_PORT  (default: 6379)
 *   REDIS_PASS  (default: sin contraseña)
 */

const Redis = require('ioredis');

const client = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASS || undefined,
});

/* ─────────────────────────────────────────────
   DATOS INICIALES
───────────────────────────────────────────── */

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

const SAMPLE_USERS = [
  { id: 'u1', name: 'Ana García',    email: 'ana@brewhaus.uy' },
  { id: 'u2', name: 'Carlos López',  email: 'carlos@brewhaus.uy' },
  { id: 'u3', name: 'María Fernández', email: 'maria@brewhaus.uy' },
];

const SAMPLE_ORDERS = [
  {
    id: 'order:1001',
    user: 'Ana García',
    items: JSON.stringify([
      { id: 'lat', name: 'Latte', price: 4.20, qty: 1 },
      { id: 'cro', name: 'Croissant', price: 3.50, qty: 2 },
    ]),
    total: 11.20,
    status: 'reserved',
    createdAt: Date.now() - 20000,
    expiresAt: Date.now() + 40000,
  },
  {
    id: 'order:1002',
    user: 'Carlos López',
    items: JSON.stringify([
      { id: 'cap', name: 'Cappuccino', price: 3.80, qty: 2 },
    ]),
    total: 7.60,
    status: 'processing',
    createdAt: Date.now() - 60000,
    expiresAt: Date.now() - 1000,
  },
  {
    id: 'order:1003',
    user: 'María Fernández',
    items: JSON.stringify([
      { id: 'mat', name: 'Matcha Latte', price: 4.80, qty: 1 },
      { id: 'muf', name: 'Muffin', price: 2.90, qty: 1 },
    ]),
    total: 7.70,
    status: 'completed',
    createdAt: Date.now() - 300000,
    expiresAt: Date.now() - 240000,
  },
];

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

function log(emoji, msg) {
  console.log(`${emoji}  ${msg}`);
}

function section(title) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(50));
}

/* ─────────────────────────────────────────────
   SEED
───────────────────────────────────────────── */

async function seed() {
  log('🔌', 'Conectando a Redis...');

  // ── 1. FLUSH (solo datos de la app, no todo el servidor) ──
  section('Limpiando claves previas de Brewhaus');
  const keysToDelete = await client.keys('brewhaus:*');
  if (keysToDelete.length > 0) {
    await client.del(...keysToDelete);
    log('🗑 ', `${keysToDelete.length} claves eliminadas`);
  } else {
    log('✅', 'No había claves previas');
  }

  // ── 2. CATÁLOGO — Hash por producto (cache) ───────────────
  section('Cargando catálogo de productos (Hashes)');
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
    await client.expire(key, 3600);
    log('📦', `Hash creado: ${key}  →  ${product.name} ($${product.price.toFixed(2)})`);
  }

  // ── 3. SET de IDs de productos disponibles ─────────────────
  section('Creando Set de IDs disponibles');
  const availableKey = 'brewhaus:catalog:available';
  for (const p of PRODUCTS.filter(p => p.stock > 0)) {
    await client.sadd(availableKey, p.id);
  }
  log('🗂 ', `Set creado: ${availableKey}  →  ${PRODUCTS.filter(p => p.stock > 0).length} productos`);

  // ── 4. CATEGORÍAS — Sets por categoría ────────────────────
  section('Creando Sets por categoría');
  const categories = [...new Set(PRODUCTS.map(p => p.category))];
  for (const cat of categories) {
    const catKey = `brewhaus:catalog:category:${cat}`;
    const ids = PRODUCTS.filter(p => p.category === cat).map(p => p.id);
    await client.sadd(catKey, ...ids);
    log('🏷 ', `Set creado: ${catKey}  →  [${ids.join(', ')}]`);
  }

  // ── 5. ÓRDENES — Hash por orden ────────────────────────────
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

  // ── 6. QUEUE — List (cola FIFO de órdenes reservadas) ──────
  section('Poblando queue de órdenes (List)');
  const queueKey = 'brewhaus:queue:pending';
  const pendingOrders = SAMPLE_ORDERS.filter(o => o.status === 'reserved' || o.status === 'processing');
  for (const order of pendingOrders) {
    await client.rpush(queueKey, order.id);
    log('📋', `Encolado en ${queueKey}  →  ${order.id}`);
  }

  // ── 7. CONTADORES — Strings ────────────────────────────────
  section('Inicializando contadores (Strings)');
  await client.set('brewhaus:stats:total_orders',     SAMPLE_ORDERS.length);
  await client.set('brewhaus:stats:completed_orders', SAMPLE_ORDERS.filter(o => o.status === 'completed').length);
  await client.set('brewhaus:stats:cache_hits',       0);
  await client.set('brewhaus:stats:cache_misses',     0);
  await client.set('brewhaus:stats:order_id_seq',     1003);
  log('🔢', 'Contadores inicializados: total_orders, completed_orders, cache_hits, cache_misses, order_id_seq');

  // ── 8. USUARIOS — Hashes ───────────────────────────────────
  section('Cargando usuarios de muestra (Hashes)');
  for (const user of SAMPLE_USERS) {
    const key = `brewhaus:user:${user.id}`;
    await client.hset(key, {
      id:    user.id,
      name:  user.name,
      email: user.email,
    });
    log('👤', `Hash creado: ${key}  →  ${user.name}`);
  }

  // ── 9. SORTED SET — Leaderboard de clientes ────────────────
  section('Creando leaderboard de clientes frecuentes (Sorted Set)');
  const leaderboardKey = 'brewhaus:leaderboard:customers';
  await client.zadd(leaderboardKey, 5, 'Ana García');
  await client.zadd(leaderboardKey, 3, 'Carlos López');
  await client.zadd(leaderboardKey, 8, 'María Fernández');
  log('🏆', `Sorted Set creado: ${leaderboardKey}  →  3 clientes`);

  // ── 10. SORTED SET — Productos más pedidos ─────────────────
  section('Creando ranking de productos más pedidos (Sorted Set)');
  const popularKey = 'brewhaus:leaderboard:products';
  await client.zadd(popularKey, 42, 'Latte');
  await client.zadd(popularKey, 38, 'Cappuccino');
  await client.zadd(popularKey, 31, 'Croissant');
  await client.zadd(popularKey, 27, 'Espresso');
  await client.zadd(popularKey, 19, 'Matcha Latte');
  await client.zadd(popularKey, 15, 'Muffin');
  await client.zadd(popularKey, 12, 'Sandwich');
  await client.zadd(popularKey,  9, 'Agua con gas');
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
  console.error('❌ Error durante el seed:', err);
  client.quit();
  process.exit(1);
});
