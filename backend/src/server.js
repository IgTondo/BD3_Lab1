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

app.get("/products", async (_request, response) => { 
  let products = await redisClient.keys("brewhaus:product:*"); }) 
  .then(keys => { return Promise.all(keys.map(key => redisClient.hGetAll(key))); }) 
  .then(products => { response.json(products); }) 
  .catch(error => { console.error("Error fetching products:", error.message); 
  response.status(500).json({ error: "Failed to fetch products" }); });

app.get("/products", async (req, res) => {
  try {
    let keys = await redisClient.keys("brewhaus:product:*");
    const result = [];
    for (const key of keys){
      const product = await redisClient.hGetAll(key);
      result.push(product);
    }
    res.json(result);

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

