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

