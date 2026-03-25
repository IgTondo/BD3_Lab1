import cors from "cors";
import express from "express";
import { createClient } from "redis";

const app = express();
const port = process.env.PORT || 3000;
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

app.use(cors());

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
  let products = await redisClient.keys("brewhaus:product:*");
})
  .then(keys => {
    return Promise.all(keys.map(key => redisClient.hGetAll(key)));
  })
  .then(products => {
    response.json(products);
  })
  .catch(error => {
    console.error("Error fetching products:", error.message);
    response.status(500).json({ error: "Failed to fetch products" });
  });

