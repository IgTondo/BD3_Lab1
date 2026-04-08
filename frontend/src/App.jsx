import { useEffect, useMemo, useRef, useState } from "react";

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

const MOCK_RANKING = [
  { id: "demo-1", sold: 24, trend: "+12%", note: "Pico despues del almuerzo" },
  { id: "demo-2", sold: 18, trend: "+8%", note: "Alto rendimiento en combos" },
  { id: "demo-3", sold: 13, trend: "+4%", note: "Buen movimiento durante la tarde" },
];

function formatMoney(value) {
  return `$${value.toFixed(2)}`;
}

function ProductRankingView({ ranking, totalUnitsSold, topProductName, onBack }) {
  return (
    <div className="app">
      <div className="header">
        <div>
          <div className="logo">
            Brew<span>haus</span>
          </div>
          <div className="page-caption">Ranking de productos mas vendidos</div>
        </div>

        <div className="nav-actions">
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
          <div className="metric-label">Producto lider</div>
          <div className="metric-value metric-value-sm">{topProductName}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Actualizacion</div>
          <div className="metric-value metric-value-sm">Demo en vivo</div>
        </div>
      </div>

      <div className="ranking-layout">
        <div className="section-title">Top productos</div>
        <div className="panel ranking-list">
          {ranking.map((item, index) => (
            <div key={item.id} className="ranking-card">
              <div className="ranking-position">#{index + 1}</div>
              <div className="ranking-main">
                <div className="ranking-name">{item.name}</div>
                <div className="ranking-note">{item.note}</div>
              </div>
              <div className="ranking-side">
                <div className="ranking-units">{item.sold} uds</div>
                <div className="ranking-trend">{item.trend}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [menu, setMenu] = useState([]);
  const [reserveTime, setReserveTime] = useState(60);
  const [cacheStore, setCacheStore] = useState({});
  const [cacheHits, setCacheHits] = useState(0);
  const [cacheMisses, setCacheMisses] = useState(0);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState({});
  const [totalOrders, setTotalOrders] = useState(0);
  const [completedOrders, setCompletedOrders] = useState(0);
  const [username, setUsername] = useState("");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [notif, setNotif] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentView, setCurrentView] = useState(() =>
    window.location.hash === "#/ranking" ? "ranking" : "home",
  );
  const notifTimeoutRef = useRef(null);

  const menuById = useMemo(() => {
    const map = {};
    for (const item of menu) {
      map[item.id] = item;
    }
    return map;
  }, [menu]);

  useEffect(() => {
    const syncViewWithHash = () => {
      setCurrentView(window.location.hash === "#/ranking" ? "ranking" : "home");
    };

    window.addEventListener("hashchange", syncViewWithHash);
    return () => window.removeEventListener("hashchange", syncViewWithHash);
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [menuResponse, configResponse] = await Promise.all([
          fetch("/api/menu"),
          fetch("/api/config"),
        ]);

        if (!menuResponse.ok) {
          throw new Error("No se pudo obtener el catalogo");
        }

        if (!configResponse.ok) {
          throw new Error("No se pudo obtener la configuracion");
        }

        const menuData = await menuResponse.json();
        const configData = await configResponse.json();

        setMenu(menuData);
        setReserveTime(configData.reserveTimeSeconds ?? 60);
        setLoadError("");
      } catch (error) {
        setLoadError(error.message);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      let expiredCount = 0;

      setOrders((prevOrders) => {
        const updatedOrders = prevOrders.map((order) => {
          if (order.status !== "reserved") {
            return order;
          }

          const timeLeft = Math.max(0, Math.round((order.expiresAt - Date.now()) / 1000));
          if (timeLeft > 0) {
            return order;
          }

          expiredCount += 1;
          return { ...order, status: "completed" };
        });

        return updatedOrders;
      });

      if (expiredCount > 0) {
        setCompletedOrders((prev) => prev + expiredCount);
        showNotif(`Expiraron ${expiredCount} orden(es)`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (notifTimeoutRef.current) {
        clearTimeout(notifTimeoutRef.current);
      }
    };
  }, []);

  const showNotif = (message) => {
    setNotif(message);
    if (notifTimeoutRef.current) {
      clearTimeout(notifTimeoutRef.current);
    }
    notifTimeoutRef.current = setTimeout(() => setNotif(""), 2500);
  };

  const navigateTo = (view) => {
    window.location.hash = view === "ranking" ? "/ranking" : "/";
    setCurrentView(view);
  };

  const reloadMenu = async () => {
    const response = await fetch("/api/menu");
    if (!response.ok) {
      throw new Error("No se pudo actualizar el catalogo");
    }
    const menuData = await response.json();
    setMenu(menuData);
    return menuData;
  };

  const getFromCache = (id) => {
    if (cacheStore[id]) {
      setCacheHits((prev) => prev + 1);
      showNotif(`Cache HIT: ${cacheStore[id].name}`);
      return cacheStore[id];
    }

    const item = menuById[id];
    if (!item) {
      return null;
    }

    setCacheMisses((prev) => prev + 1);
    setCacheStore((prev) => ({ ...prev, [id]: item }));
    showNotif(`Cache MISS: ${item.name} - guardado en cache`);
    return item;
  };

  const changeQty = (id, delta) => {
    const item = getFromCache(id);
    if (!item) {
      return;
    }

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

  const cartItems = useMemo(() => {
    return Object.entries(cart).map(([id, qty]) => {
      const item = cacheStore[id] || menuById[id];
      return {
        id,
        name: item?.name ?? id,
        price: item?.price ?? 0,
        qty,
        subtotal: (item?.price ?? 0) * qty,
      };
    });
  }, [cart, cacheStore, menuById]);

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.subtotal, 0),
    [cartItems],
  );

  const ranking = useMemo(() => {
    const soldById = {};

    for (const order of orders) {
      for (const item of order.items) {
        soldById[item.id] = (soldById[item.id] || 0) + item.qty;
      }
    }

    const realRanking = Object.entries(soldById)
      .map(([id, sold]) => {
        const menuItem = menuById[id];
        return {
          id,
          name: menuItem?.name ?? id,
          sold,
          trend: sold >= 10 ? "+15%" : sold >= 5 ? "+7%" : "+3%",
          note: sold >= 10 ? "Alta rotacion en esta jornada" : "Rendimiento estable hoy",
        };
      })
      .sort((a, b) => b.sold - a.sold);

    if (realRanking.length > 0) {
      return realRanking.slice(0, 5);
    }

    return MOCK_RANKING.map((item, index) => {
      const menuItem = menu[index];
      return {
        ...item,
        name: menuItem?.name ?? `Producto ${index + 1}`,
      };
    });
  }, [menu, menuById, orders]);

  const totalUnitsSold = useMemo(
    () => ranking.reduce((sum, item) => sum + item.sold, 0),
    [ranking],
  );

  const topProductName = ranking[0]?.name ?? "Sin datos";

  const placeOrder = async () => {
    if (!username.trim()) {
      showNotif("Ingresa el nombre del cliente");
      return;
    }

    if (cartItems.length === 0) {
      showNotif("Selecciona al menos un producto");
      return;
    }

    setIsPlacingOrder(true);

    try {
      const payload = {
        user: username.trim(),
        items: cartItems.map((item) => ({ id: item.id, qty: item.qty })),
      };

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          const details = Array.isArray(data.insufficient)
            ? data.insufficient
              .map((item) => `${item.name}: disponible ${item.available}, pedido ${item.requested}`)
              .join(" | ")
            : "";
          showNotif(details || "Stock insuficiente");
          await reloadMenu();
          return;
        }

        throw new Error(data.message || "No se pudo crear la orden");
      }

      setOrders((prev) => [data.order, ...prev]);
      setTotalOrders((prev) => prev + 1);
      setCart({});
      setUsername("");

      if (Array.isArray(data.stockUpdates)) {
        const stockById = new Map(data.stockUpdates.map((item) => [item.id, item.stock]));
        setMenu((prevMenu) =>
          prevMenu.map((item) => {
            if (!stockById.has(item.id)) {
              return item;
            }
            const stock = stockById.get(item.id);
            return { ...item, stock, available: stock > 0 };
          }),
        );
        setCacheStore((prevCache) => {
          const next = { ...prevCache };
          for (const [id, stock] of stockById.entries()) {
            if (next[id]) {
              next[id] = { ...next[id], stock, available: stock > 0 };
            }
          }
          return next;
        });
      } else {
        await reloadMenu();
      }

      showNotif(`Orden #${data.order.id} agregada a la cola`);
    } catch (error) {
      showNotif(error.message || "Error creando la orden");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const processNext = () => {
    let processedId = null;

    setOrders((prev) => {
      const next = [...prev];
      for (let idx = next.length - 1; idx >= 0; idx -= 1) {
        if (next[idx].status === "reserved") {
          processedId = next[idx].id;
          next[idx] = { ...next[idx], status: "processing" };
          break;
        }
      }
      return next;
    });

    if (processedId === null) {
      showNotif("No hay ordenes reservadas");
      return;
    }

    showNotif(`Orden #${processedId} en procesamiento`);
  };

  const resolveNext = () => {
    let completedId = null;

    setOrders((prev) => {
      const next = [...prev];
      for (let idx = next.length - 1; idx >= 0; idx -= 1) {
        if (next[idx].status === "processing") {
          completedId = next[idx].id;
          next[idx] = { ...next[idx], status: "completed" };
          break;
        }
      }
      return next;
    });

    if (completedId === null) {
      showNotif("No hay ordenes procesando");
      return;
    }

    setCompletedOrders((prev) => prev + 1);
    showNotif(`Orden #${completedId} completada`);
  };

  const clearCompleted = () => {
    setOrders((prev) => prev.filter((order) => order.status !== "completed"));
  };

  const reservedOrders = orders.filter((order) => order.status === "reserved").length;
  const processingOrders = orders.filter((order) => order.status === "processing").length;
  const queueCount = orders.filter((order) => order.status !== "completed").length;

  if (loading) {
    return <div className="empty-state">Cargando catalogo...</div>;
  }

  if (loadError) {
    return <div className="empty-state">Error cargando datos: {loadError}</div>;
  }

  if (currentView === "ranking") {
    return (
      <>
        <ProductRankingView
          ranking={ranking}
          totalUnitsSold={totalUnitsSold}
          topProductName={topProductName}
          onBack={() => navigateTo("home")}
        />
        {notif && <div className="notif">{notif}</div>}
      </>
    );
  }

  return (
    <>
      <div className="app">
        <div className="header">
          <div className="logo">
            Brew<span>haus</span>
          </div>
          <div className="stats-row">
            <div className="stat-pill">
              Cache hits: <strong>{cacheHits}</strong>
            </div>
            <div className="stat-pill">
              Misses: <strong>{cacheMisses}</strong>
            </div>
            <div className="stat-pill">
              En cola: <strong>{queueCount}</strong>
            </div>
            <button className="btn btn-sm nav-link-btn" type="button" onClick={() => navigateTo("ranking")}>
              Ver ranking
            </button>
          </div>
        </div>

        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-label">Ordenes hoy</div>
            <div className="metric-value">{totalOrders}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Completadas</div>
            <div className="metric-value">{completedOrders}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">En reserva</div>
            <div className="metric-value">{reservedOrders}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Procesando</div>
            <div className="metric-value">{processingOrders}</div>
          </div>
        </div>

        <div className="layout">
          <div>
            <div className="section-title">Catalogo de productos</div>
            <div className="panel">
              <div className="catalog-grid">
                {menu.map((item) => {
                  const qty = cart[item.id] || 0;
                  return (
                    <div
                      key={item.id}
                      className={`product-card${qty > 0 ? " selected" : ""}`}
                    >
                      <div className="product-name">{item.name}</div>
                      <div className="product-price">{formatMoney(item.price)}</div>
                      <div className="product-stock">Stock: {item.stock}</div>
                      <div className="qty-controls">
                        <button
                          className="qty-btn"
                          type="button"
                          onClick={() => changeQty(item.id, -1)}
                        >
                          -
                        </button>
                        <span className="qty-num">{qty}</span>
                        <button
                          className="qty-btn"
                          type="button"
                          onClick={() => changeQty(item.id, 1)}
                        >
                          +
                        </button>
                      </div>
                      {qty > 0 && <div className="product-qty-label">{qty} en carrito</div>}
                    </div>
                  );
                })}
              </div>

              <div className="divider" />

              <div className="section-title" style={{ marginBottom: "0.5rem" }}>
                Nueva orden
              </div>
              <div className="user-row">
                <input
                  type="text"
                  placeholder="Nombre del cliente"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>

              <div className="cart-summary">
                {cartItems.length === 0 && (
                  <span style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>
                    Selecciona productos del catalogo
                  </span>
                )}

                {cartItems.map((item) => (
                  <div key={item.id} className="cart-item">
                    <span>
                      {item.name} x{item.qty}
                    </span>
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

          <div>
            <div className="section-title">Cola de ordenes</div>
            <div className="panel">
              <div className="queue-actions">
                <button className="btn btn-sm" type="button" onClick={processNext}>
                  Procesar siguiente
                </button>
                <button className="btn btn-sm" type="button" onClick={resolveNext}>
                  Resolver siguiente
                </button>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={clearCompleted}
                  style={{ marginLeft: "auto" }}
                >
                  Limpiar completadas
                </button>
              </div>

              <div className="queue-list">
                {orders.length === 0 && <div className="empty-state">No hay ordenes en cola</div>}

                {orders.map((order) => {
                  const timeLeft = Math.max(0, Math.round((order.expiresAt - Date.now()) / 1000));
                  const pct = order.status === "reserved"
                    ? Math.round((timeLeft / reserveTime) * 100)
                    : 100;
                  const fillClass = pct > 50 ? "" : pct > 20 ? " urgent" : " critical";
                  const itemsText = order.items.map((item) => `${item.name} x${item.qty}`).join(", ");

                  return (
                    <div key={order.id} className="order-card">
                      <div className="order-header">
                        <span className="order-user">
                          #{order.id} - {order.user}
                        </span>
                        <span className="order-time">
                          {new Date(order.createdAt).toLocaleTimeString("es-UY", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="order-items">{itemsText}</div>
                      <div className="order-footer">
                        <span className={`status-badge ${STATUS_CLASSES[order.status]}`}>
                          {STATUS_LABELS[order.status]}
                        </span>
                        <span style={{ fontSize: "13px", fontWeight: 500 }}>
                          {formatMoney(order.total)}
                        </span>
                      </div>

                      {order.status === "reserved" && (
                        <>
                          <div className="timer-bar">
                            <div
                              className={`timer-fill${fillClass}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="timer-label">Expira en {timeLeft}s</div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {notif && <div className="notif">{notif}</div>}
    </>
  );
}
