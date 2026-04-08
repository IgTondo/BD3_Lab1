import cors from "cors";
import express from "express";
import { createClient } from "redis";

const app = express();
const port = process.env.PORT || 3000;
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

app.use(cors());
app.use(express.json());

const redisClient = createClient({
  url: redisUrl,
});

const APP_CONFIG = {
  reserveTimeSeconds: 60,
};

const AVAILABLE_SET_KEY = "brewhaus:catalog:available";
const ORDER_QUEUE_KEY = "brewhaus:queue:pending";

function normalizeProductHash(hash) {
  return {
    id: hash.id,
    name: hash.name,
    price: Number.parseFloat(hash.price ?? "0"),
    category: hash.category ?? "general",
    stock: Number.parseInt(hash.stock ?? "0", 10),
    available: (hash.available ?? "0") === "1",
  };
}

async function loadMenuFromRedis() {
  const productKeys = await redisClient.keys("brewhaus:product:*");
  if (productKeys.length === 0) {
    return [];
  }

  const products = await Promise.all(
    productKeys.map(async (key) => {
      const hash = await redisClient.hGetAll(key);
      if (!hash.id) {
        return null;
      }
      return normalizeProductHash(hash);
    }),
  );

  return products
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

redisClient.on("error", (error) => {
  console.error("Redis error:", error.message);
});

await redisClient.connect();

app.get("/health", async (_request, response) => {
  try {
    const redisReply = await redisClient.ping();

    response.json({
      backend: "ok",
      redis: redisReply === "PONG" ? "healthy" : "unhealthy",
    });
  } catch (error) {
    response.status(500).json({
      backend: "error",
      redis: "unhealthy",
      message: error.message,
    });
  }
});

app.get("/menu", async (_request, response) => {
  try {
    const menu = await loadMenuFromRedis();
    response.json(menu);
  } catch (error) {
    response.status(500).json({
      message: "No se pudo obtener el catalogo",
      error: error.message,
    });
  }
});

app.get("/config", (_request, response) => {
  response.json(APP_CONFIG);
});

app.post("/orders", async (request, response) => {
  try {
    const user = String(request.body?.user ?? "").trim();
    const rawItems = Array.isArray(request.body?.items) ? request.body.items : [];

    if (!user) {
      return response.status(400).json({ message: "El nombre del cliente es obligatorio" });
    }

    if (rawItems.length === 0) {
      return response.status(400).json({ message: "La orden no tiene productos" });
    }

    const requestedQtyById = new Map();
    for (const rawItem of rawItems) {
      const id = String(rawItem?.id ?? "").trim();
      const qty = Number.parseInt(rawItem?.qty, 10);
      if (!id || !Number.isInteger(qty) || qty <= 0) {
        return response.status(400).json({
          message: "Cada item debe incluir id y qty entero mayor a 0",
        });
      }
      requestedQtyById.set(id, (requestedQtyById.get(id) ?? 0) + qty);
    }

    const productIds = [...requestedQtyById.keys()];
    const productHashes = await Promise.all(
      productIds.map((id) => redisClient.hGetAll(`brewhaus:product:${id}`)),
    );

    const productsById = new Map();
    for (const hash of productHashes) {
      if (!hash.id) {
        return response.status(400).json({
          message: "Uno o mas productos no existen en el catalogo",
        });
      }
      productsById.set(hash.id, normalizeProductHash(hash));
    }

    const insufficient = [];
    for (const [id, qty] of requestedQtyById.entries()) {
      const product = productsById.get(id);
      if (product.stock < qty) {
        insufficient.push({
          id,
          name: product.name,
          requested: qty,
          available: product.stock,
        });
      }
    }

    if (insufficient.length > 0) {
      return response.status(409).json({
        message: "Stock insuficiente para uno o mas productos",
        insufficient,
      });
    }

    const orderSeq = await redisClient.incr("brewhaus:stats:order_id_seq");
    const orderId = `order:${orderSeq}`;
    const createdAt = Date.now();
    const expiresAt = createdAt + APP_CONFIG.reserveTimeSeconds * 1000;

    const orderItems = [];
    let total = 0;
    for (const [id, qty] of requestedQtyById.entries()) {
      const product = productsById.get(id);
      orderItems.push({
        id,
        name: product.name,
        price: product.price,
        qty,
      });
      total += product.price * qty;
    }

    const multi = redisClient.multi();
    const stockUpdates = [];

    for (const item of orderItems) {
      const productKey = `brewhaus:product:${item.id}`;
      const currentStock = productsById.get(item.id).stock;
      const nextStock = currentStock - item.qty;
      stockUpdates.push({ id: item.id, stock: nextStock });

      multi.hIncrBy(productKey, "stock", -item.qty);
      multi.hSet(productKey, { available: nextStock > 0 ? "1" : "0" });

      if (nextStock > 0) {
        multi.sAdd(AVAILABLE_SET_KEY, item.id);
      } else {
        multi.sRem(AVAILABLE_SET_KEY, item.id);
      }

      multi.zIncrBy("brewhaus:leaderboard:products", item.qty, item.name);
    }

    multi.hSet(orderId, {
      user,
      items: JSON.stringify(orderItems),
      total: total.toFixed(2),
      status: "reserved",
      createdAt,
      expiresAt,
    });
    multi.rPush(ORDER_QUEUE_KEY, orderId);
    multi.incr("brewhaus:stats:total_orders");

    await multi.exec();

    return response.status(201).json({
      order: {
        id: orderSeq,
        user,
        items: orderItems,
        total,
        status: "reserved",
        createdAt,
        expiresAt,
      },
      stockUpdates,
    });
  } catch (error) {
    return response.status(500).json({
      message: "No se pudo crear la orden",
      error: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
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

app.get("/products", async (req, res) => {
  try {
    let keys = await redisClient.keys("brewhaus:product:*");
    if (keys.length>0){
      const result = [];
      for (const key of keys){
        const product = await redisClient.hGetAll(key);
        result.push(product);
      }
      await redisClient.incr("brewhaus:cache:hits");
      res.json(result)
    }
    else{
      const result = [];
      await redisClient.incr("brewhaus:cache:misses")
      for (const product of PRODUCTS){
        const key = "brewhaus:product:"+ product.id;
        const prod = {
          id:       product.id,
          name:     product.name,
          price:    product.price.toFixed(2),
          category: product.category,
        };
        await redisClient.hset(key, prod);
        result.push(prod)
      }
      res.json(result)
    }

  } catch (error) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.post("/order", async (req,res) => {
  try{
    const id = await redisClient.incr("brewhaus:order:id");  
    const orderKey = "brewhaus:order:" + id;
    const body = req.body;
    const customer = body.name;
    const products = body.products;
    
    if (!body.name || !body.products) {
      return res.status(400).json({ error: "invalid input" });}

    let suma=0
    for (const prod of products){
      let info = await redisClient.hGetAll("brewhaus:product:" + prod.id);
      
      if (!info.price) {
        throw new Error("product not found");
      }

      suma += parseFloat(info.price)*prod.qty;
    }

    await redisClient.hset(orderKey, {
      prods: JSON.stringify(products),
      total : suma,
      status : "pending",
      timestamp : Date.now(),
      name : customer
    });
    await redisClient.rPush("brewhaus:orders:pending", orderKey);
    await redisClient.expire(orderKey,60)

    res.json({ 
      message: "order created", 
      id: id 
    })
  
  } catch(error) {
    res.status(500).json({ error: "Failed to post order"})
    }
})

app.get("/orders/pending", async (req, res) =>{
  try{
    let keys = await redisClient.lRange("brewhaus:orders:pending", 0, -1);
    const result = [];
    for (const key of keys){
      const order = await redisClient.hGetAll(key);
      const ttl = await redisClient.ttl(key);
      if (ttl===-2){
        await redisClient.lRem("brewhaus:orders:pending", key);
        continue;
      }
      order.ttl = ttl;
      result.push(order);
    }
    res.json(result)
  } catch (error) {
    res.status(500).json({ error : "Failed to fetch pending orders"});
  }
})

app.get("/orders/processed", async (req, res) =>{
  try{
    let keys = await redisClient.lRange("brewhaus:orders:processed", 0, -1);
    const result = [];
    for (const key of keys){
      const order = await redisClient.hGetAll(key);
      result.push(order);
    }
    res.json(result)
  } catch (error) {
    res.status(500).json({ error : "Failed to fetch porcessed orders"});
  }
})

app.get("/orders/completed", async (req, res) =>{
  try{
    let keys = await redisClient.lRange("brewhaus:orders:completed", 0, -1);
    const result = [];
    for (const key of keys){
      const order = await redisClient.hGetAll(key);
      result.push(order);
    }
    res.json(result)
  } catch (error) {
    res.status(500).json({ error : "Failed to fetch completed orders"});
  }
})

app.post("/process", async (req,res) => {
  try{
    const orderKey = await redisClient.lPop("brewhaus:orders:pending");
    if (!orderKey){
      return res.status(400).json({error : "No order to process"});
    }
    await redisClient.rPush("brewhaus:orders:processed", orderKey);
    await redisClient.hset(orderKey, "status", "processed");
    res.json({message: "Order porcessed succesfully", id: orderKey})

  } catch (error) {
    res.status(500).json({error: "Failed to process order"})
  }
})

app.post("/complete", async (req,res) => {
  try{
    const orderKey = await redisClient.lPop("brewhaus:orders:processed");
    if (!orderKey){
      return res.status(400).json({error : "No order to complete"});
    }
    await redisClient.rPush("brewhaus:orders:completed", orderKey);
    await redisClient.hset(id, "status", "completed");
    res.json({message: "Order completed succesfully", id: orderKey})

  } catch (error) {
    res.status(500).json({error: "Failed to complete order"})
  }
})

app.get("/cache/stats", async(req,res) => {
  try{
    const count_misses = await redisClient.get("brewhaus:cache:misses") || 0;
    const count_hits = await redisClient.get("brewhaus:cache:hits") || 0;
    res.json({misses : Number(count_misses),
      hits : Number(count_hits)})
  } catch (error){
    res.status(500).json({error: "Failed to get hit and miss counters"})
  }
})

