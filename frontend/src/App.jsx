import { useEffect, useMemo, useRef, useState, useCallback } from "react";

const API = "/api";

const STATUS_LABELS = {
  reserved: "Reservado",
  processing: "Procesando",
  completed: "Completado",
};

const STATUS_CLASSES = {
  reserved: "status-reserved",
  processing: "status-processing",
  completed: "status-completed",
};

function formatMoney(value) {
  return `$${Number(value).toFixed(2)}`;
}

// ─── Product Ranking View ────────────────────────────────────────────────────

function ProductRankingView({ ranking, totalUnitsSold, topProductName, onBack, onViewClients }) {
  return (
    <div className="app">
      <div className="header">
        <div>
          <div className="logo">Brew<span>haus</span></div>
          <div className="page-caption">Ranking de productos más vendidos</div>
        </div>
        <div className="nav-actions">
          <button className="btn btn-sm" type="button" onClick={onViewClients}>
            Ver clientes
          </button>
          <button className="btn" type="button" onClick={onBack}>
            Volver al inicio
          </button>
        </div>
      </div>

      <div className="metrics-row ranking-metrics">
        <div className="metric-card">
          <div className="metric-label">Unidades vendidas</div>
          <div className="metric-value">{totalUnitsSold}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Producto líder</div>
          <div className="metric-value metric-value-sm">{topProductName}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Productos rankeados</div>
          <div className="metric-value">{ranking.length}</div>
        </div>
      </div>

      <div className="ranking-layout">
        <div className="section-title">Top productos</div>
        <div className="panel ranking-list">
          {ranking.length === 0 && (
            <div className="empty-state">Aún no hay ventas registradas</div>
          )}
          {ranking.map((item, index) => (
            <div key={item.product} className="ranking-card">
              <div className="ranking-position">#{index + 1}</div>
              <div className="ranking-main">
                <div className="ranking-name">{item.product}</div>
              </div>
              <div className="ranking-side">
                <div className="ranking-units">{item.sold} uds</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Client Ranking View ─────────────────────────────────────────────────────

function ClientRankingView({ ranking, onBack, onViewProducts }) {
  const topClient = ranking[0]?.client ?? "Sin datos";
  return (
    <div className="app">
      <div className="header">
        <div>
          <div className="logo">Brew<span>haus</span></div>
          <div className="page-caption">Ranking de clientes frecuentes</div>
        </div>
        <div className="nav-actions">
          <button className="btn btn-sm" type="button" onClick={onViewProducts}>
            Ver productos
          </button>
          <button className="btn" type="button" onClick={onBack}>
            Volver al inicio
          </button>
        </div>
      </div>

      <div className="metrics-row ranking-metrics">
        <div className="metric-card">
          <div className="metric-label">Cliente líder</div>
          <div className="metric-value metric-value-sm">{topClient}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Clientes rankeados</div>
          <div className="metric-value">{ranking.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total órdenes top</div>
          <div className="metric-value">
            {ranking.reduce((s, c) => s + c.sold, 0)}
          </div>
        </div>
      </div>

      <div className="ranking-layout">
        <div className="section-title">Top clientes</div>
        <div className="panel ranking-list">
          {ranking.length === 0 && (
            <div className="empty-state">Aún no hay órdenes completadas</div>
          )}
          {ranking.map((item, index) => (
            <div key={item.client} className="ranking-card">
              <div className="ranking-position">#{index + 1}</div>
              <div className="ranking-main">
                <div className="ranking-name">{item.client}</div>
              </div>
              <div className="ranking-side">
                <div className="ranking-units">{item.sold} órdenes</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [menu, setMenu] = useState([]);
  const [reserveTime, setReserveTime] = useState(60);
  const [cacheHits, setCacheHits] = useState(0);
  const [cacheMisses, setCacheMisses] = useState(0);
  const [orders, setOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [cart, setCart] = useState({});
  const [username, setUsername] = useState("");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [notif, setNotif] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [productRanking, setProductRanking] = useState([]);
  const [clientRanking, setClientRanking] = useState([]);
  const [currentView, setCurrentView] = useState("home");
  const notifTimeoutRef = useRef(null);

  const menuById = useMemo(() => {
    const map = {};
    for (const item of menu) map[item.id] = item;
    return map;
  }, [menu]);

  // ── Notifications ───────────────────────────────────────────────────────────
  const showNotif = useCallback((message) => {
    setNotif(message);
    if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
    notifTimeoutRef.current = setTimeout(() => setNotif(""), 2500);
  }, []);

  useEffect(() => () => {
    if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
  }, []);

  // ── Fetch helpers ───────────────────────────────────────────────────────────
  const fetchCacheStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/cache/stats`);
      if (!res.ok) return;
      const data = await res.json();
      setCacheHits(data.hits ?? 0);
      setCacheMisses(data.misses ?? 0);
    } catch (_) {}
  }, []);

  const fetchPendingOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API}/orders/pending`);
      if (!res.ok) return;
      const data = await res.json();
      setOrders(
        data.map((o) => ({
          id: o.user ? o : o,
          // normalize fields from Redis hash
          dbKey: o.dbKey,
          user: o.user,
          items: (() => { try { return JSON.parse(o.items); } catch { return []; } })(),
          total: Number(o.total ?? 0),
          status: o.status ?? "reserved",
          createdAt: Number(o.createdAt ?? Date.now()),
          expiresAt: Number(o.expiresAt ?? Date.now()),
          ttl: Number(o.ttl ?? 0),
        }))
      );
    } catch (_) {}
  }, []);

  const fetchCompletedOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API}/orders/completed`);
      if (!res.ok) return;
      const data = await res.json();
      setCompletedOrders(
        data.map((o) => ({
          user: o.user,
          items: (() => { try { return JSON.parse(o.items); } catch { return []; } })(),
          total: Number(o.total ?? 0),
          status: "completed",
          createdAt: Number(o.createdAt ?? 0),
        }))
      );
    } catch (_) {}
  }, []);

  const fetchProductRanking = useCallback(async () => {
    try {
      const res = await fetch(`${API}/ranking/products`);
      if (!res.ok) return;
      const data = await res.json();
      setProductRanking(data);
    } catch (_) {}
  }, []);

  const fetchClientRanking = useCallback(async () => {
    try {
      const res = await fetch(`${API}/ranking/clients`);
      if (!res.ok) return;
      const data = await res.json();
      setClientRanking(data);
    } catch (_) {}
  }, []);

  const reloadMenu = useCallback(async () => {
    const res = await fetch(`${API}/menu`);
    if (!res.ok) throw new Error("No se pudo actualizar el catálogo");
    const data = await res.json();
    setMenu(data);
    return data;
  }, []);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const [menuRes, configRes] = await Promise.all([
          fetch(`${API}/menu`),
          fetch(`${API}/config`),
        ]);
        if (!menuRes.ok) throw new Error("No se pudo obtener el catálogo");
        if (!configRes.ok) throw new Error("No se pudo obtener la configuración");

        const menuData = await menuRes.json();
        const configData = await configRes.json();
        setMenu(menuData);
        setReserveTime(configData.reserveTimeSeconds ?? 60);
        setLoadError("");
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    };
    init();
    fetchCacheStats();
    fetchPendingOrders();
    fetchCompletedOrders();
    fetchProductRanking();
    fetchClientRanking();
  }, [fetchCacheStats, fetchPendingOrders, fetchCompletedOrders, fetchProductRanking, fetchClientRanking]);

  // ── Polling: pending orders + cache stats (every 3 s) ──────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      fetchPendingOrders();
      fetchCacheStats();
    }, 3000);
    return () => clearInterval(id);
  }, [fetchPendingOrders, fetchCacheStats]);

  // ── Countdown ticker (every second, purely visual) ─────────────────────────
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Cart helpers ────────────────────────────────────────────────────────────
  const changeQty = (id, delta) => {
    const item = menuById[id];
    if (!item) return;

    if (delta > 0) {
      const currentQty = cart[id] || 0;
      if (currentQty >= item.stock) {
        showNotif(`Stock insuficiente: ${item.name} (disponible: ${item.stock})`);
        return;
      }
    }

    setCart((prev) => {
      const nextQty = Math.max(0, (prev[id] || 0) + delta);
      if (nextQty === 0) {
        const { [id]: _deleted, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: nextQty };
    });
  };

  const cartItems = useMemo(() =>
    Object.entries(cart).map(([id, qty]) => {
      const item = menuById[id];
      return {
        id,
        name: item?.name ?? id,
        price: item?.price ?? 0,
        qty,
        subtotal: (item?.price ?? 0) * qty,
      };
    }),
    [cart, menuById]
  );

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.subtotal, 0),
    [cartItems]
  );

  // ── Place order ─────────────────────────────────────────────────────────────
  const placeOrder = async () => {
    if (!username.trim()) { showNotif("Ingresa el nombre del cliente"); return; }
    if (cartItems.length === 0) { showNotif("Selecciona al menos un producto"); return; }

    setIsPlacingOrder(true);
    try {
      const payload = {
        user: username.trim(),
        items: cartItems.map((i) => ({ id: i.id, qty: i.qty })),
      };

      const res = await fetch(`${API}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          const details = Array.isArray(data.insufficient)
            ? data.insufficient.map((i) => `${i.name}: disponible ${i.available}, pedido ${i.requested}`).join(" | ")
            : "";
          showNotif(details || "Stock insuficiente");
          await reloadMenu();
          return;
        }
        throw new Error(data.message || "No se pudo crear la orden");
      }

      setCart({});
      setUsername("");
      showNotif(`Orden #${data.order.id} agregada a la cola`);

      // Update stock locally
      if (Array.isArray(data.stockUpdates)) {
        const stockById = new Map(data.stockUpdates.map((u) => [u.id, u.stock]));
        setMenu((prev) =>
          prev.map((item) => {
            if (!stockById.has(item.id)) return item;
            const stock = stockById.get(item.id);
            return { ...item, stock, available: stock > 0 };
          })
        );
      } else {
        await reloadMenu();
      }

      // Refresh backend state
      await Promise.all([fetchPendingOrders(), fetchCacheStats()]);
    } catch (err) {
      showNotif(err.message || "Error creando la orden");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // ── Process next (marks UI only – backend queue still holds it) ─────────────
  // The template's backend doesn't have a separate "start processing" step;
  // processing means we pop from pending via /complete. We keep a local
  // "processing" state for visual feedback before completing.
  const [processingIds, setProcessingIds] = useState(new Set());

  const processNext = () => {
    const first = orders.find((o) => o.status === "reserved" && !processingIds.has(o.createdAt));
    if (!first) { showNotif("No hay órdenes reservadas"); return; }
    setProcessingIds((prev) => new Set([...prev, first.createdAt]));
    showNotif(`Orden de ${first.user} marcada como procesando`);
  };

  // ── Resolve next (calls /complete on backend) ────────────────────────────────
  const resolveNext = async () => {
    try {
      const res = await fetch(`${API}/complete`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        showNotif(data.error || "No hay órdenes para completar");
        return;
      }
      showNotif("Orden completada ✓");
      setProcessingIds(new Set()); // reset processing markers
      await Promise.all([
        fetchPendingOrders(),
        fetchCompletedOrders(),
        fetchClientRanking(),
        fetchProductRanking(),
      ]);
    } catch (err) {
      showNotif("Error al completar la orden");
    }
  };

  // ── Derived counts ──────────────────────────────────────────────────────────
  const reservedCount = orders.filter((o) => o.status === "reserved" && !processingIds.has(o.createdAt)).length;
  const processingCount = orders.filter((o) => processingIds.has(o.createdAt)).length;
  const totalOrdersCount = orders.length + completedOrders.length;

  const totalUnitsSold = productRanking.reduce((s, i) => s + i.sold, 0);
  const topProductName = productRanking[0]?.product ?? "Sin datos";

  // ── Render: loading / error ─────────────────────────────────────────────────
  if (loading) return <div className="empty-state">Cargando catálogo...</div>;
  if (loadError) return <div className="empty-state">Error cargando datos: {loadError}</div>;

  // ── Render: ranking views ───────────────────────────────────────────────────
  if (currentView === "ranking-products") {
    return (
      <>
        <ProductRankingView
          ranking={productRanking}
          totalUnitsSold={totalUnitsSold}
          topProductName={topProductName}
          onBack={() => setCurrentView("home")}
          onViewClients={() => setCurrentView("ranking-clients")}
        />
        {notif && <div className="notif">{notif}</div>}
      </>
    );
  }

  if (currentView === "ranking-clients") {
    return (
      <>
        <ClientRankingView
          ranking={clientRanking}
          onBack={() => setCurrentView("home")}
          onViewProducts={() => setCurrentView("ranking-products")}
        />
        {notif && <div className="notif">{notif}</div>}
      </>
    );
  }

  // ── Render: main view ───────────────────────────────────────────────────────
  return (
    <>
      <div className="app">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="header">
          <div className="logo">Brew<span>haus</span></div>
          <div className="stats-row">
            <div className="stat-pill">
              Cache hits: <strong>{cacheHits}</strong>
            </div>
            <div className="stat-pill">
              Misses: <strong>{cacheMisses}</strong>
            </div>
            <div className="stat-pill">
              En cola: <strong>{orders.length}</strong>
            </div>
            <button className="btn btn-sm nav-link-btn" type="button" onClick={() => { fetchProductRanking(); setCurrentView("ranking-products"); }}>
              🏆 Productos
            </button>
            <button className="btn btn-sm nav-link-btn" type="button" onClick={() => { fetchClientRanking(); setCurrentView("ranking-clients"); }}>
              👤 Clientes
            </button>
          </div>
        </div>

        {/* ── Metrics ─────────────────────────────────────────────────────── */}
        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-label">Órdenes totales</div>
            <div className="metric-value">{totalOrdersCount}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Completadas</div>
            <div className="metric-value">{completedOrders.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">En reserva</div>
            <div className="metric-value">{reservedCount}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Procesando</div>
            <div className="metric-value">{processingCount}</div>
          </div>
        </div>

        <div className="layout">
          {/* ── Left: catalog + cart ───────────────────────────────────────── */}
          <div>
            <div className="section-title">Catálogo de productos</div>
            <div className="panel">
              <div className="catalog-grid">
                {menu.map((item) => {
                  const qty = cart[item.id] || 0;
                  return (
                    <div key={item.id} className={`product-card${qty > 0 ? " selected" : ""}${!item.available ? " unavailable" : ""}`}>
                      <div className="product-name">{item.name}</div>
                      <div className="product-price">{formatMoney(item.price)}</div>
                      <div className="product-stock">Stock: {item.stock}</div>
                      {!item.available && (
                        <div className="product-stock" style={{ color: "var(--color-error, #ef4444)" }}>Sin stock</div>
                      )}
                      <div className="qty-controls">
                        <button className="qty-btn" type="button" onClick={() => changeQty(item.id, -1)} disabled={!item.available}>-</button>
                        <span className="qty-num">{qty}</span>
                        <button className="qty-btn" type="button" onClick={() => changeQty(item.id, 1)} disabled={!item.available}>+</button>
                      </div>
                      {qty > 0 && <div className="product-qty-label">{qty} en carrito</div>}
                    </div>
                  );
                })}
              </div>

              <div className="divider" />

              <div className="section-title" style={{ marginBottom: "0.5rem" }}>Nueva orden</div>
              <div className="user-row">
                <input
                  type="text"
                  placeholder="Nombre del cliente"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="cart-summary">
                {cartItems.length === 0 && (
                  <span style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>
                    Selecciona productos del catálogo
                  </span>
                )}
                {cartItems.map((item) => (
                  <div key={item.id} className="cart-item">
                    <span>{item.name} x{item.qty}</span>
                    <span>{formatMoney(item.subtotal)}</span>
                  </div>
                ))}
                {cartItems.length > 0 && (
                  <div className="total-row">
                    <span>Total</span>
                    <span>{formatMoney(cartTotal)}</span>
                  </div>
                )}
              </div>

              <button
                className="btn btn-primary"
                style={{ width: "100%", marginTop: "8px" }}
                type="button"
                onClick={placeOrder}
                disabled={isPlacingOrder}
              >
                {isPlacingOrder ? "Agregando..." : "Agregar a la cola"}
              </button>
            </div>
          </div>

          {/* ── Right: order queue ─────────────────────────────────────────── */}
          <div>
            <div className="section-title">Cola de órdenes</div>
            <div className="panel">
              <div className="queue-actions">
                <button className="btn btn-sm" type="button" onClick={processNext}>
                  Procesar siguiente
                </button>
                <button className="btn btn-sm" type="button" onClick={resolveNext}>
                  Resolver siguiente
                </button>
              </div>

              <div className="queue-list">
                {orders.length === 0 && (
                  <div className="empty-state">No hay órdenes en cola</div>
                )}

                {orders.map((order, idx) => {
                  const isProcessing = processingIds.has(order.createdAt);
                  const effectiveStatus = isProcessing ? "processing" : order.status;
                  const now = Date.now();
                  const timeLeft = Math.max(0, Math.round((order.expiresAt - now) / 1000));
                  const pct = effectiveStatus === "reserved"
                    ? Math.round((timeLeft / reserveTime) * 100)
                    : 100;
                  const fillClass = pct > 50 ? "" : pct > 20 ? " urgent" : " critical";
                  const itemsText = order.items.map((i) => `${i.name} x${i.qty}`).join(", ");

                  return (
                    <div key={`${order.createdAt}-${idx}`} className="order-card">
                      <div className="order-header">
                        <span className="order-user">{order.user}</span>
                        <span className="order-time">
                          {new Date(order.createdAt).toLocaleTimeString("es-UY", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="order-items">{itemsText}</div>
                      <div className="order-footer">
                        <span className={`status-badge ${STATUS_CLASSES[effectiveStatus]}`}>
                          {STATUS_LABELS[effectiveStatus]}
                        </span>
                        <span style={{ fontSize: "13px", fontWeight: 500 }}>
                          {formatMoney(order.total)}
                        </span>
                      </div>

                      {effectiveStatus === "reserved" && (
                        <>
                          <div className="timer-bar">
                            <div className={`timer-fill${fillClass}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="timer-label">
                            {timeLeft > 0 ? `Expira en ${timeLeft}s` : "Expirada"}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Completed orders section */}
              {completedOrders.length > 0 && (
                <>
                  <div className="divider" />
                  <div className="section-title" style={{ marginBottom: "0.5rem" }}>
                    Órdenes completadas ({completedOrders.length})
                  </div>
                  <div className="queue-list">
                    {completedOrders.map((order, idx) => {
                      const itemsText = order.items.map((i) => `${i.name} x${i.qty}`).join(", ");
                      return (
                        <div key={`completed-${idx}`} className="order-card">
                          <div className="order-header">
                            <span className="order-user">{order.user}</span>
                            <span className="order-time">
                              {new Date(order.createdAt).toLocaleTimeString("es-UY", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="order-items">{itemsText}</div>
                          <div className="order-footer">
                            <span className={`status-badge ${STATUS_CLASSES.completed}`}>
                              {STATUS_LABELS.completed}
                            </span>
                            <span style={{ fontSize: "13px", fontWeight: 500 }}>
                              {formatMoney(order.total)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {notif && <div className="notif">{notif}</div>}
    </>
  );
}
