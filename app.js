const STORAGE_KEY = "quatro-estacoes-db";
const storeWhatsApp = "5543988503149";
const defaultDelivery = {
  storeAddress: "Avenida Saul Elkind, 330, Sala 2, Londrina PR",
  pricePerKm: 2.5,
};

const seed = {
  categories: ["Todos", "Sorvetes", "Milk-shakes", "Sundaes"],
  materials: [
    { id: 1, name: "Leite integral", unit: "L", pack: 1, price: 5.8, stock: 18, min: 8, category: "Laticinios" },
    { id: 2, name: "Chocolate 50%", unit: "kg", pack: 1, price: 42, stock: 4.2, min: 5, category: "Ingredientes" },
    { id: 3, name: "Morango", unit: "kg", pack: 1, price: 18.5, stock: 7, min: 4, category: "Frutas" },
    { id: 4, name: "Copo 500 ml", unit: "un", pack: 100, price: 48, stock: 84, min: 30, category: "Embalagens" },
  ],
  products: [
    { id: 1, name: "Pistache cremoso", category: "Sorvetes", description: "Pistache torrado, leve e surpreendente.", price: 18.9, cost: 5.72, tag: "Mais vendido", color: "pistachio", recipe: [{ material: 1, qty: 0.12 }, { material: 2, qty: 0.01 }] },
    { id: 2, name: "Milk-shake chocolate", category: "Milk-shakes", description: "Chocolate intenso, do jeitinho que abraca.", price: 16, cost: 5.91, tag: "Especial", color: "chocolate", recipe: [{ material: 1, qty: 0.15 }, { material: 2, qty: 0.03 }, { material: 4, qty: 1 }] },
    { id: 3, name: "Sundae morango", category: "Sundaes", description: "Morango fresco, calda e crocancia.", price: 15.5, cost: 4.1, tag: "Novidade", color: "strawberry", recipe: [{ material: 1, qty: 0.1 }, { material: 3, qty: 0.08 }, { material: 4, qty: 1 }] },
    { id: 4, name: "Manga com limao", category: "Sorvetes", description: "Frutado, solar e refrescante.", price: 14.9, cost: 3.2, tag: "Leve", color: "mango", recipe: [{ material: 3, qty: 0.06 }] },
  ],
};

let db = null;
let cart = [];
let deliveryQuote = null;
let storeCoords = null;

const money = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n) => `${Number(n || 0).toFixed(1).replace(".", ",")}%`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const deliveryCity = () => "Londrina PR Brasil";
const hasCity = (value) => /londrina|parana|paraná|\bpr\b/i.test(value || "");
const normalizeZip = (zip) => (zip || "").replace(/\D/g, "").slice(0, 8);
const formatZip = (zip) => {
  const value = normalizeZip(zip);
  return value.length > 5 ? `${value.slice(0, 5)}-${value.slice(5)}` : value;
};
const streetOnly = (value) => (value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\b(n|no|numero|sala|apto|apartamento|casa|fundos|bloco)\b/gi, " ")
  .replace(/\d+[a-zA-Z]?/g, " ")
  .replace(/[,-]+/g, " ")
  .replace(/\s{2,}/g, " ")
  .trim();

function normalizeDb() {
  db = db || clone(seed);
  db.categories = Array.isArray(db.categories) && db.categories.length ? db.categories : clone(seed.categories);
  db.materials = Array.isArray(db.materials) ? db.materials : [];
  db.products = Array.isArray(db.products) ? db.products : [];
  db.config = db.config || {};
  db.config.delivery = { ...defaultDelivery, ...(db.config.delivery || {}) };
}

function save() {
  normalizeDb();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

const deliveryConfig = () => ({ ...defaultDelivery, ...(db?.config?.delivery || {}) });
const mat = (id) => db.materials.find((m) => m.id === Number(id));
const margin = (p) => (p.price ? ((p.price - (p.cost || 0)) / p.price) * 100 : 0);

function toast(message) {
  const el = document.querySelector("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

function productPhoto(p) {
  return p.image
    ? `<div class="product-photo has-image"><img src="${p.image}" alt="${p.name}" loading="lazy" /></div>`
    : `<div class="product-photo photo-${p.color || "pistachio"}"><div class="scoop-mini"></div></div>`;
}

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file || !file.size) return resolve("");
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const max = 1100;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.84));
    };
    image.onerror = () => resolve(reader.result);
    image.src = reader.result;
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

function publicRender() {
  ensureOrderButton();
  const filters = document.querySelector("#category-filters");
  if (!filters) return;
  filters.innerHTML = db.categories.map((c) => `<button class="pill ${c === "Todos" ? "active" : ""}" data-filter="${c}">${c}</button>`).join("");
  renderProducts();
  document.querySelector("#catalog-search").oninput = renderProducts;
  filters.onclick = (e) => {
    if (!e.target.dataset.filter) return;
    filters.querySelectorAll(".pill").forEach((x) => x.classList.remove("active"));
    e.target.classList.add("active");
    renderProducts();
  };
}

function renderProducts() {
  const search = (document.querySelector("#catalog-search")?.value || "").toLowerCase();
  const filter = document.querySelector(".pill.active")?.dataset.filter || "Todos";
  const items = db.products.filter((p) =>
    (filter === "Todos" || p.category === filter) &&
    (`${p.name} ${p.description}`.toLowerCase().includes(search))
  );
  document.querySelector("#product-grid").innerHTML = items.map((p) => `
    <article class="product-card">
      ${productPhoto(p)}
      <div class="product-info">
        <small>${String(p.category || "").toUpperCase()}</small>
        <h3>${p.name}</h3>
        <p>${p.description || "Sabor artesanal Quatro Estacoes."}</p>
        <div class="product-footer">
          <span class="product-price">${money(p.price)}</span>
          <span class="product-tag">${p.tag || "Novo"}</span>
        </div>
        <button class="button button-primary order-add" data-add-product="${p.id}">Adicionar ao pedido</button>
      </div>
    </article>
  `).join("") || "<p>Nenhum sabor encontrado.</p>";
}

function showAdmin() {
  document.querySelector("#public-view").classList.add("hidden");
  document.querySelector(".topbar").classList.add("hidden");
  document.querySelector("#floating-order")?.classList.add("hidden");
  document.querySelector("#admin-view").classList.remove("hidden");
  renderPanel("dashboard");
}

function closeAdmin() {
  document.querySelector("#admin-view").classList.add("hidden");
  document.querySelector(".topbar").classList.remove("hidden");
  document.querySelector("#public-view").classList.remove("hidden");
  updateCartButton();
}

function renderPanel(panel) {
  document.querySelectorAll("#admin-nav button").forEach((b) => b.classList.toggle("active", b.dataset.panel === panel));
  const titles = { dashboard: "Bom dia, Michael", products: "Produtos", materials: "Materias-primas", costs: "Inteligencia de custos", delivery: "Entrega" };
  document.querySelector("#panel-title").innerHTML = `${titles[panel] || "Painel"} <span>✦</span>`;
  ({ dashboard, products, materials, costs, delivery }[panel] || dashboard)();
}

function dashboard() {
  const low = db.materials.filter((m) => Number(m.stock) <= Number(m.min));
  const avg = db.products.length ? db.products.reduce((a, p) => a + margin(p), 0) / db.products.length : 0;
  document.querySelector("#panel-content").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-top">Produtos ativos <span class="stat-icon">◈</span></div><div class="stat-value">${db.products.length}</div><div class="stat-meta">catalogo publicado</div></div>
      <div class="stat-card"><div class="stat-top">Materias-primas <span class="stat-icon">◌</span></div><div class="stat-value">${db.materials.length}</div><div class="stat-meta ${low.length ? "up" : ""}">${low.length} com estoque baixo</div></div>
      <div class="stat-card"><div class="stat-top">Margem media <span class="stat-icon">⌁</span></div><div class="stat-value">${pct(avg)}</div><div class="stat-meta">custo atualizado agora</div></div>
      <div class="stat-card"><div class="stat-top">Valor em estoque <span class="stat-icon">$</span></div><div class="stat-value">${money(db.materials.reduce((a, m) => a + Number(m.stock || 0) * Number(m.price || 0), 0))}</div><div class="stat-meta">baseado no preco atual</div></div>
    </div>
    <div class="dashboard-grid">
      <div class="admin-card">
        <div class="card-head"><div><h3>Impacto recente</h3><small>Materia-prima → preco → receita → custo → produto → margem</small></div><button class="text-link" data-panel-link="costs">Ver analise →</button></div>
        <div class="impact-list">${db.products.slice(0, 4).map((p) => `<div class="impact-row"><div class="impact-dot">⌁</div><div><b>${p.name}</b><small>Custo teorico recalculado</small></div><div class="impact-value ${margin(p) < 55 ? "up" : "down"}">${pct(margin(p))}<small>margem atual</small></div></div>`).join("")}</div>
      </div>
      <div class="admin-card">
        <div class="card-head"><div><h3>Alertas</h3><small>Requerem sua atencao</small></div></div>
        ${low.map((m) => `<div class="alert-box"><strong>ESTOQUE BAIXO</strong>${m.name} esta em ${m.stock} ${m.unit}. Minimo: ${m.min}.</div>`).join("") || `<div class="alert-box"><strong>TUDO CERTO</strong>Nao ha alertas criticos no momento.</div>`}
        <div class="alert-box"><strong>DADOS SALVOS</strong>Os cadastros ficam neste navegador. Use Exportar dados para guardar backup.</div>
      </div>
    </div>
  `;
  document.querySelectorAll("[data-panel-link]").forEach((x) => x.onclick = () => renderPanel(x.dataset.panelLink));
}

function products() {
  document.querySelector("#panel-content").innerHTML = `
    <div class="toolbar">
      <div><div class="eyebrow">CATALOGO E RENTABILIDADE</div><h2>Seus produtos</h2></div>
      <div class="toolbar-actions"><input id="admin-product-search" class="subtle-input" placeholder="Buscar produto" /><button class="button button-primary" data-action="new-product">+ Novo produto</button></div>
    </div>
    <div class="admin-card table-wrap">
      <table class="data-table"><thead><tr><th>Produto</th><th>Categoria</th><th>Preco de venda</th><th>Custo atual</th><th>Margem</th><th>Status</th><th>Acao</th></tr></thead>
      <tbody>${db.products.map((p) => `<tr><td>${p.image ? `<span class="mini-thumb"><img src="${p.image}" alt="" /></span>` : ""}${p.name}</td><td>${p.category}</td><td>${money(p.price)}</td><td>${money(p.cost)}</td><td>${pct(margin(p))}</td><td><span class="status ${margin(p) >= 65 ? "good" : margin(p) >= 55 ? "warn" : "bad"}">${margin(p) >= 65 ? "Excelente" : margin(p) >= 55 ? "Atencao" : "Critica"}</span></td><td><button class="text-link" data-edit-product="${p.id}">Editar</button></td></tr>`).join("")}</tbody></table>
    </div>
  `;
  document.querySelectorAll("[data-action='new-product']").forEach((x) => x.onclick = () => openProductModal());
  document.querySelectorAll("[data-edit-product]").forEach((x) => x.onclick = () => openProductModal(Number(x.dataset.editProduct)));
}

function materials() {
  document.querySelector("#panel-content").innerHTML = `
    <div class="toolbar"><div><div class="eyebrow">BASE DE CUSTOS</div><h2>Materias-primas</h2></div><div class="toolbar-actions"><button class="button button-primary" data-action="new-material">+ Cadastrar insumo</button></div></div>
    <div class="admin-card table-wrap"><table class="data-table"><thead><tr><th>Insumo</th><th>Unidade</th><th>Preco normalizado</th><th>Estoque</th><th>Atualizado</th><th>Acao</th></tr></thead>
    <tbody>${db.materials.map((m) => `<tr><td>${m.name}<small style="display:block;color:#8b9890;font-size:10px">${m.category || ""}</small></td><td>${m.unit}</td><td><b>${money(m.price)}/${m.unit}</b></td><td><span class="status ${Number(m.stock) <= Number(m.min) ? "bad" : "good"}">${m.stock} ${m.unit}</span></td><td>Hoje</td><td><button class="text-link" data-research="${m.id}">✦ Pesquisar preco</button></td></tr>`).join("")}</tbody></table></div>
  `;
  document.querySelector("[data-action='new-material']").onclick = openMaterialModal;
  document.querySelectorAll("[data-research]").forEach((x) => x.onclick = () => openResearchModal(Number(x.dataset.research)));
}

function costs() {
  const sorted = [...db.products].sort((a, b) => margin(b) - margin(a));
  document.querySelector("#panel-content").innerHTML = `
    <div class="toolbar"><div><div class="eyebrow">DECISOES BASEADAS EM DADOS</div><h2>Inteligencia de custos</h2></div><button class="button button-dark" data-action="simulate">⌁ Simular alteracao</button></div>
    <div class="cost-layout"><div class="admin-card"><div class="card-head"><div><h3>Rentabilidade por produto</h3><small>Custo → margem → decisao</small></div></div>
    <table class="data-table"><thead><tr><th>Produto</th><th>Custo</th><th>Venda</th><th>Margem</th></tr></thead><tbody>${sorted.map((p) => `<tr><td>${p.name}</td><td>${money(p.cost)}</td><td>${money(p.price)}</td><td><span class="status ${margin(p) >= 65 ? "good" : margin(p) >= 55 ? "warn" : "bad"}">${pct(margin(p))}</span></td></tr>`).join("")}</tbody></table></div>
    <div><div class="insight-card"><div class="eyebrow" style="color:#f2c56c">LEITURA DO NEGOCIO</div><h3>A margem mostra a decisao.</h3><p>Quando um insumo muda, produtos com receita vinculada mostram impacto no custo e na margem para apoiar preco e compra.</p><div class="kpi-line"><span>Produtos ativos</span><b>${db.products.length}</b></div><div class="kpi-line"><span>Margem media atual</span><b>${pct(db.products.length ? db.products.reduce((a, p) => a + margin(p), 0) / db.products.length : 0)}</b></div></div></div></div>
  `;
  document.querySelector("[data-action='simulate']").onclick = openSimulationModal;
}

function delivery() {
  const config = deliveryConfig();
  document.querySelector("#panel-content").innerHTML = `
    <div class="toolbar"><div><div class="eyebrow">REGRAS DE ENTREGA</div><h2>Frete por quilometro</h2></div></div>
    <div class="admin-card"><form id="delivery-form"><div class="form-grid">
      <div class="field full"><label>ENDERECO BASE DA LOJA</label><input name="storeAddress" value="${config.storeAddress}" required /></div>
      <div class="field"><label>VALOR DO FRETE POR KM</label><input name="pricePerKm" type="number" min="0" step=".01" value="${config.pricePerKm}" required /></div>
    </div><div class="alert-box" style="margin-top:18px"><strong>COMO O CLIENTE VE</strong>O cliente pode informar CEP ou rua. O sistema assume Londrina/PR, mostra mapa, estima km e soma o frete no total.</div><div class="modal-actions"><button class="button button-primary">Salvar configuracao</button></div></form></div>
  `;
  document.querySelector("#delivery-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    db.config.delivery = { storeAddress: f.get("storeAddress").trim(), pricePerKm: Number(f.get("pricePerKm")) };
    storeCoords = null;
    save();
    toast("Configuracao de entrega salva.");
    renderPanel("delivery");
  };
}

function modal(html) {
  document.querySelector("#modal-root").innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  document.querySelector(".modal-backdrop").onclick = (e) => {
    if (e.target.classList.contains("modal-backdrop")) closeModal();
  };
  document.querySelectorAll("[data-close]").forEach((x) => x.onclick = closeModal);
}

function closeModal() {
  document.querySelector("#modal-root").innerHTML = "";
}

function ensureOrderButton() {
  if (document.querySelector("#floating-order")) return;
  document.body.insertAdjacentHTML("beforeend", `<button id="floating-order" class="floating-order hidden" data-action="open-cart">Ver pedido <span id="cart-count">0</span></button>`);
}

function updateCartButton() {
  ensureOrderButton();
  const count = cart.reduce((a, i) => a + i.qty, 0);
  document.querySelector("#cart-count").textContent = count;
  document.querySelector("#floating-order").classList.toggle("hidden", count === 0);
}

function addToCart(id) {
  const product = db.products.find((p) => p.id === Number(id));
  if (!product) return;
  const item = cart.find((i) => i.id === product.id);
  if (item) item.qty += 1;
  else cart.push({ id: product.id, qty: 1 });
  updateCartButton();
  toast(`${product.name} adicionado ao pedido.`);
}

function cartSubtotal() {
  return cart.reduce((sum, item) => {
    const product = db.products.find((p) => p.id === item.id);
    return sum + (product ? product.price * item.qty : 0);
  }, 0);
}

function cartTotal() {
  return cartSubtotal() + (deliveryQuote?.fee || 0);
}

function openWhatsAppOrder(message) {
  const encoded = encodeURIComponent(message);
  const appUrl = `whatsapp://send?phone=${storeWhatsApp}&text=${encoded}`;
  const webUrl = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? `https://wa.me/${storeWhatsApp}?text=${encoded}`
    : `https://web.whatsapp.com/send?phone=${storeWhatsApp}&text=${encoded}`;
  let openedApp = false;
  const markOpened = () => { openedApp = true; };
  document.addEventListener("visibilitychange", markOpened, { once: true });
  window.location.href = appUrl;
  setTimeout(() => {
    document.removeEventListener("visibilitychange", markOpened);
    if (!openedApp) window.location.href = webUrl;
  }, 1200);
}

async function geocodeAddress(address) {
  const city = deliveryCity();
  const street = streetOnly(address);
  const mainStreet = streetOnly(String(address || "").split(",")[0]);
  const cityAddress = hasCity(address) ? address : `${address}, ${city}`;
  const cityStreet = `${street}, ${city}`;
  const queries = [cityAddress, `${mainStreet}, ${city}`, cityStreet, `${mainStreet}, Londrina, Parana, Brasil`, `${street}, Londrina, Parana, Brasil`, address].filter((q, i, arr) => q && arr.indexOf(q) === i);
  for (const query of queries) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
    const data = await fetch(url, { headers: { Accept: "application/json" } }).then((r) => r.json()).catch(() => []);
    if (data?.length) return { lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name, query };
  }
  throw new Error("Endereco nao encontrado");
}

async function routeDistanceKm(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
    const data = await fetch(url).then((r) => r.json());
    if (data.routes?.[0]?.distance) return data.routes[0].distance / 1000;
  } catch (error) {}
  const rad = (x) => x * Math.PI / 180;
  const earth = 6371;
  const dLat = rad(to.lat - from.lat);
  const dLon = rad(to.lon - from.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateOrderTotals() {
  const subtotal = cartSubtotal();
  const freight = deliveryQuote?.fee || 0;
  document.querySelector("#checkout-subtotal") && (document.querySelector("#checkout-subtotal").textContent = money(subtotal));
  document.querySelector("#checkout-freight") && (document.querySelector("#checkout-freight").textContent = deliveryQuote ? money(freight) : "Informe o endereco");
  document.querySelector("#checkout-total") && (document.querySelector("#checkout-total").textContent = money(subtotal + freight));
}

async function calculateDelivery(address) {
  const preview = document.querySelector("#delivery-preview");
  const config = deliveryConfig();
  if (!preview || !address.trim()) return;
  preview.innerHTML = `<div class="delivery-card"><div><b>Calculando entrega...</b><small>Buscando endereco em Londrina. Se nao encontrar o numero, usaremos o nome da rua.</small></div></div>`;
  try {
    const customer = await geocodeAddress(address);
    if (!storeCoords) storeCoords = await geocodeAddress(config.storeAddress);
    const km = await routeDistanceKm(storeCoords, customer);
    const fee = Number((km * Number(config.pricePerKm || 0)).toFixed(2));
    const usedStreet = streetOnly(customer.query || "") !== streetOnly(address);
    const destination = usedStreet ? customer.query : `${address}, Londrina PR`;
    deliveryQuote = {
      km,
      fee,
      address,
      label: customer.label,
      maps: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(config.storeAddress)}&destination=${encodeURIComponent(destination)}`,
    };
    preview.innerHTML = `<div class="delivery-card"><div><b>Entrega calculada em Londrina</b><small>${km.toFixed(1).replace(".", ",")} km x ${money(config.pricePerKm)} por km${usedStreet ? " · calculo feito pela rua informada" : ""}</small></div><strong>${money(fee)}</strong></div><div class="client-map"><iframe title="Mapa do endereco de entrega" loading="lazy" src="https://www.google.com/maps?q=${encodeURIComponent(destination)}&output=embed"></iframe></div>`;
    updateOrderTotals();
  } catch (error) {
    deliveryQuote = null;
    preview.innerHTML = `<div class="delivery-card warn-delivery"><div><b>Nao foi possivel calcular automaticamente</b><small>Digite pelo menos o nome da rua em Londrina. Bairro ou ponto de referencia ajudam a melhorar a precisao.</small></div></div><div class="client-map"><iframe title="Mapa do endereco de entrega" loading="lazy" src="https://www.google.com/maps?q=${encodeURIComponent(`${address}, Londrina PR`)}&output=embed"></iframe></div>`;
    updateOrderTotals();
  }
}

async function fillAddressByZip(zipInput, addressInput) {
  const zip = normalizeZip(zipInput.value);
  if (zip.length !== 8 || zipInput.dataset.loading === "1") return;
  zipInput.dataset.loading = "1";
  zipInput.value = formatZip(zip);
  toast("Buscando endereco pelo CEP...");
  try {
    const data = await fetch(`https://viacep.com.br/ws/${zip}/json/`).then((r) => r.json());
    if (data.erro) throw new Error("CEP nao encontrado");
    const cityOk = /londrina/i.test(data.localidade || "") && /pr/i.test(data.uf || "");
    const parts = [data.logradouro, data.bairro, `${data.localidade || "Londrina"} ${data.uf || "PR"}`].filter(Boolean);
    addressInput.value = parts.join(", ");
    toast(cityOk ? "Endereco preenchido pelo CEP." : "CEP fora de Londrina; confira antes de enviar.");
    await calculateDelivery(addressInput.value);
  } catch (error) {
    toast("Nao consegui preencher pelo CEP. Digite a rua manualmente.");
  } finally {
    zipInput.dataset.loading = "0";
  }
}

function openOrderModal() {
  if (!cart.length) return toast("Adicione um produto ao pedido primeiro.");
  deliveryQuote = null;
  const rows = cart.map((item) => {
    const p = db.products.find((product) => product.id === item.id);
    return p ? `<div class="cart-row"><div><b>${p.name}</b><small>${money(p.price)} cada</small></div><div class="qty-control"><button type="button" data-cart-dec="${p.id}">−</button><span>${item.qty}</span><button type="button" data-cart-inc="${p.id}">+</button></div><strong>${money(p.price * item.qty)}</strong><button type="button" class="remove-item" data-cart-remove="${p.id}">×</button></div>` : "";
  }).join("");
  modal(`
    <div class="modal-head"><div><div class="eyebrow">PEDIDO PARA ENTREGA</div><h2>Finalizar pedido</h2></div><button class="close" data-close>×</button></div>
    <div class="cart-list">${rows}</div>
    <div class="checkout-summary"><div><span>Subtotal</span><b id="checkout-subtotal">${money(cartSubtotal())}</b></div><div><span>Frete</span><b id="checkout-freight">Informe o endereco</b></div><div class="summary-total"><span>Total</span><b id="checkout-total">${money(cartSubtotal())}</b></div></div>
    <form id="checkout-form">
      <div class="form-grid">
        <div class="field"><label>NOME</label><input name="customer" required placeholder="Seu nome" /></div>
        <div class="field"><label>TELEFONE</label><input name="phone" required placeholder="Seu WhatsApp" /></div>
        <div class="field"><label>CEP</label><input name="zipcode" inputmode="numeric" maxlength="9" autocomplete="postal-code" placeholder="Digite o CEP" /></div>
        <div class="field full"><label>ENDERECO COMPLETO PARA ENTREGA</label><input name="address" required placeholder="Rua, bairro - Londrina PR" /></div>
        <div class="field"><label>COMPLEMENTO / NUMERO</label><input name="complement" placeholder="Numero, casa, apto, referencia" /></div>
        <div class="field"><label>FORMA DE PAGAMENTO</label><select name="payment"><option>Pix</option><option>Dinheiro</option><option>Cartao na entrega</option></select></div>
        <div class="field full"><label>OBSERVACAO</label><input name="notes" placeholder="Ex.: sem cobertura, troco, ponto de referencia" /></div>
      </div>
      <div id="delivery-preview" class="delivery-preview"></div>
      <div class="modal-actions"><button type="button" class="button" data-close>Continuar comprando</button><button class="button button-primary">Finalizar pedido no WhatsApp</button></div>
    </form>
  `);
  document.querySelectorAll("[data-cart-inc]").forEach((b) => b.onclick = () => { cart.find((i) => i.id === Number(b.dataset.cartInc)).qty += 1; openOrderModal(); updateCartButton(); });
  document.querySelectorAll("[data-cart-dec]").forEach((b) => b.onclick = () => { const item = cart.find((i) => i.id === Number(b.dataset.cartDec)); if (item) item.qty -= 1; cart = cart.filter((i) => i.qty > 0); updateCartButton(); cart.length ? openOrderModal() : closeModal(); });
  document.querySelectorAll("[data-cart-remove]").forEach((b) => b.onclick = () => { cart = cart.filter((i) => i.id !== Number(b.dataset.cartRemove)); updateCartButton(); cart.length ? openOrderModal() : closeModal(); });
  const zipInput = document.querySelector("input[name='zipcode']");
  const addressInput = document.querySelector("input[name='address']");
  zipInput.oninput = () => { zipInput.value = formatZip(zipInput.value); };
  zipInput.onblur = () => fillAddressByZip(zipInput, addressInput);
  addressInput.onblur = () => calculateDelivery(addressInput.value);
  document.querySelector("#checkout-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const address = f.get("address").trim();
    const complement = f.get("complement").trim();
    const maps = deliveryQuote?.maps || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${address}, Londrina PR`)}`;
    const items = cart.map((item) => {
      const p = db.products.find((product) => product.id === item.id);
      return p ? `• ${item.qty}x ${p.name} - ${money(p.price * item.qty)}` : "";
    }).filter(Boolean).join("\n");
    const freight = deliveryQuote ? `${money(deliveryQuote.fee)} (${deliveryQuote.km.toFixed(1).replace(".", ",")} km)` : "A confirmar";
    const message = `*Pedido Quatro Estacoes*\n\n${items}\n\n*Subtotal:* ${money(cartSubtotal())}\n*Frete:* ${freight}\n*Total:* ${money(cartTotal())}\n\n*Cliente:* ${f.get("customer")}\n*Telefone:* ${f.get("phone")}\n*CEP:* ${formatZip(f.get("zipcode")) || "Nao informado"}\n*Endereco:* ${address}\n*Complemento/numero:* ${complement || "Nao informado"}\n*Pagamento:* ${f.get("payment")}\n*Observacao:* ${f.get("notes") || "Nenhuma"}\n\n*Link da entrega no Maps:*\n${maps}`;
    cart = [];
    deliveryQuote = null;
    updateCartButton();
    closeModal();
    toast("Pedido pronto no WhatsApp. Carrinho esvaziado.");
    openWhatsAppOrder(message);
  };
}

function openProductModal(id) {
  const editing = db.products.find((p) => p.id === id);
  const current = editing || {};
  let selectedImage = current.image || "";
  modal(`
    <div class="modal-head"><div><div class="eyebrow">${editing ? "EDITAR REGISTRO" : "NOVO REGISTRO"}</div><h2>${editing ? "Editar produto" : "Cadastrar produto"}</h2></div><button class="close" data-close>×</button></div>
    <form id="product-form"><div class="form-grid">
      <div class="field"><label>NOME DO PRODUTO</label><input name="name" required placeholder="Ex.: Milk-shake de baunilha" value="${current.name || ""}" /></div>
      <div class="field"><label>CATEGORIA</label><select name="category">${db.categories.filter((x) => x !== "Todos").map((x) => `<option ${x === current.category ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div class="field"><label>PRECO DE VENDA</label><input name="price" type="number" step=".01" required placeholder="16.90" value="${current.price || ""}" /></div>
      <div class="field"><label>TAG</label><input name="tag" placeholder="Novidade" value="${current.tag || ""}" /></div>
      <div class="field full"><label>IMAGEM DO PRODUTO</label><label class="image-picker"><input name="image" type="file" accept="image/*" /><span id="image-preview">${selectedImage ? `<img src="${selectedImage}" alt="Imagem atual do produto" /><b>Trocar imagem</b>` : "Selecionar imagem do computador"}</span></label><div class="image-search-row"><button type="button" class="button button-dark" id="search-product-image">Pesquisar</button><input id="image-url" class="subtle-input" placeholder="Cole aqui o endereco da imagem escolhida" /><button type="button" class="button button-light" id="add-image-url">Adicionar imagem</button></div></div>
      <div class="field full"><label>DESCRICAO CURTA</label><input name="description" placeholder="Uma frase sobre o sabor" value="${current.description || ""}" /></div>
    </div><div class="modal-actions"><button type="button" class="button" data-close>Cancelar</button><button class="button button-primary">${editing ? "Salvar alteracoes" : "Salvar produto"}</button></div></form>
  `);
  const preview = document.querySelector("#image-preview");
  const fileInput = document.querySelector("input[name='image']");
  const nameInput = document.querySelector("input[name='name']");
  const urlInput = document.querySelector("#image-url");
  const setPreview = (image) => {
    selectedImage = image;
    preview.innerHTML = image ? `<img src="${image}" alt="Previa da imagem selecionada" /><b>Trocar imagem</b>` : "Selecionar imagem do computador";
  };
  fileInput.onchange = async () => setPreview(await fileToDataUrl(fileInput.files[0]));
  document.querySelector("#search-product-image").onclick = () => {
    const query = encodeURIComponent(`${nameInput.value || current.name || "sorvete artesanal"} produto sorveteria`);
    window.open(`https://www.google.com/search?tbm=isch&q=${query}`, "_blank", "noopener");
  };
  document.querySelector("#add-image-url").onclick = () => {
    const url = urlInput.value.trim();
    if (!url) return toast("Cole o endereco da imagem antes de adicionar.");
    setPreview(url);
    toast("Imagem adicionada ao produto.");
  };
  document.querySelector("#product-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const uploaded = await fileToDataUrl(f.get("image"));
    const payload = {
      name: f.get("name"),
      category: f.get("category"),
      description: f.get("description") || "Sabor artesanal Quatro Estacoes.",
      price: Number(f.get("price")),
      tag: f.get("tag") || "Novo",
      image: uploaded || selectedImage,
    };
    if (editing) Object.assign(editing, payload);
    else db.products.push({ id: Date.now(), ...payload, cost: 0, color: ["pistachio", "chocolate", "strawberry", "mango"][db.products.length % 4], recipe: [] });
    save();
    closeModal();
    renderPanel("products");
    publicRender();
    toast(editing ? "Produto atualizado na vitrine." : "Produto cadastrado e publicado na vitrine.");
  };
}

function openMaterialModal() {
  modal(`<div class="modal-head"><div><div class="eyebrow">NOVA MATERIA-PRIMA</div><h2>Cadastrar insumo</h2></div><button class="close" data-close>×</button></div><form id="material-form"><div class="form-grid"><div class="field"><label>NOME</label><input name="name" required placeholder="Ex.: Calda de caramelo" /></div><div class="field"><label>UNIDADE DE USO</label><select name="unit"><option>kg</option><option>g</option><option>L</option><option>ml</option><option>un</option></select></div><div class="field"><label>PRECO UNITARIO</label><input name="price" type="number" step=".01" required placeholder="12.50" /></div><div class="field"><label>ESTOQUE ATUAL</label><input name="stock" type="number" step=".01" value="0" /></div><div class="field"><label>ESTOQUE MINIMO</label><input name="min" type="number" step=".01" value="1" /></div><div class="field"><label>CATEGORIA</label><input name="category" value="Ingredientes" /></div></div><div class="modal-actions"><button type="button" class="button" data-close>Cancelar</button><button class="button button-primary">Salvar insumo</button></div></form>`);
  document.querySelector("#material-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    db.materials.push({ id: Date.now(), name: f.get("name"), unit: f.get("unit"), pack: 1, price: Number(f.get("price")), stock: Number(f.get("stock")), min: Number(f.get("min")), category: f.get("category") });
    save();
    closeModal();
    renderPanel("materials");
    toast("Materia-prima adicionada a base de custos.");
  };
}

function openResearchModal(id) {
  const m = mat(id);
  const results = [{ store: "Assai", price: m.price * 0.91, confidence: "Alta" }, { store: "Carrefour", price: m.price * 1.08, confidence: "Media" }, { store: "Atacadao", price: m.price * 0.97, confidence: "Alta" }];
  modal(`<div class="modal-head"><div><div class="eyebrow">PESQUISA SOB DEMANDA · ${m.name.toUpperCase()}</div><h2>Sugestoes de preco</h2></div><button class="close" data-close>×</button></div><p style="color:#71817a;font-size:13px;line-height:1.5">Resultados demonstrativos para o fluxo de aprovacao. Em producao, conecte um provedor de busca no backend; nenhum preco e aplicado sem sua confirmacao.</p><div class="admin-card" style="padding:0;overflow:auto"><table class="data-table"><thead><tr><th>Loja</th><th>Preco normalizado</th><th>vs. atual</th><th></th></tr></thead><tbody>${results.map((r) => `<tr><td><b>${r.store}</b><small style="display:block;color:#849189">Confianca ${r.confidence}</small></td><td><b>${money(r.price)}/${m.unit}</b></td><td class="${r.price < m.price ? "down" : "up"}">${r.price < m.price ? "↓" : "↑"} ${pct(Math.abs((r.price / m.price - 1) * 100))}</td><td><button class="text-link" data-use-price="${r.price}">Usar este preco</button></td></tr>`).join("")}</tbody></table></div>`);
  document.querySelectorAll("[data-use-price]").forEach((b) => b.onclick = () => {
    const old = m.price;
    m.price = Number(b.dataset.usePrice);
    db.products.forEach((p) => {
      const qty = (p.recipe || []).filter((r) => r.material === m.id).reduce((a, r) => a + Number(r.qty || 0), 0);
      if (qty) p.cost = Number(((p.cost || 0) + (m.price - old) * qty).toFixed(2));
    });
    save();
    closeModal();
    renderPanel("materials");
    toast(`${m.name} atualizado. Produtos impactados foram recalculados.`);
  });
}

function openSimulationModal() {
  const m = db.materials[1] || db.materials[0];
  if (!m) return toast("Cadastre uma materia-prima primeiro.");
  const original = Number(m.price || 0);
  modal(`<div class="modal-head"><div><div class="eyebrow">CENARIO SEM SALVAR</div><h2>Simular alteracao de custos</h2></div><button class="close" data-close>×</button></div><div class="field"><label>NOVO PRECO DO ${m.name.toUpperCase()} (${m.unit})</label><input id="sim-price" type="number" value="${original.toFixed(2)}" step=".01" /></div><div id="sim-results" style="margin-top:20px"></div><div class="modal-actions"><button class="button" data-close>Fechar simulacao</button></div>`);
  const render = () => {
    const next = Number(document.querySelector("#sim-price").value || 0);
    const impacted = db.products.filter((p) => (p.recipe || []).some((r) => r.material === m.id));
    document.querySelector("#sim-results").innerHTML = `<div class="alert-box"><strong>IMPACTO ESTIMADO</strong>${impacted.length} produtos serao recalculados. Nada foi alterado.</div><table class="data-table"><thead><tr><th>Produto</th><th>Custo simulado</th><th>Margem simulada</th></tr></thead><tbody>${impacted.map((p) => { const qty = (p.recipe || []).filter((r) => r.material === m.id).reduce((a, r) => a + Number(r.qty || 0), 0); const c = Number(p.cost || 0) + (next - original) * qty; return `<tr><td>${p.name}</td><td>${money(c)}</td><td>${pct((p.price - c) / p.price * 100)}</td></tr>`; }).join("")}</tbody></table>`;
  };
  document.querySelector("#sim-price").oninput = render;
  render();
}

function exportData() {
  save();
  const payload = { version: 1, exportedAt: new Date().toISOString(), db };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `quatro-estacoes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  toast("Backup exportado com produtos, imagens e configuracoes.");
}

function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const next = parsed.db || parsed;
      if (!next || !Array.isArray(next.products) || !Array.isArray(next.materials)) throw new Error("Arquivo invalido");
      db = next;
      normalizeDb();
      save();
      publicRender();
      const active = document.querySelector("#admin-nav button.active")?.dataset.panel || "dashboard";
      renderPanel(active);
      toast("Dados importados e salvos neste navegador.");
    } catch (error) {
      toast("Nao consegui importar esse arquivo de dados.");
    }
  };
  input.click();
}

document.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add-product]");
  if (add) addToCart(add.dataset.addProduct);
  const action = e.target.closest("[data-action]");
  if (action) {
    if (action.dataset.action === "open-admin") showAdmin();
    if (action.dataset.action === "close-admin") closeAdmin();
    if (action.dataset.action === "toggle-sidebar") document.querySelector(".sidebar").classList.toggle("open");
    if (action.dataset.action === "new-product") openProductModal();
    if (action.dataset.action === "open-cart") openOrderModal();
    if (action.dataset.action === "export-data") exportData();
    if (action.dataset.action === "import-data") importData();
  }
  const panel = e.target.closest("[data-panel]");
  if (panel) renderPanel(panel.dataset.panel);
});

async function bootstrap() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    db = stored ? JSON.parse(stored) : await fetch("data.json").then((response) => {
      if (!response.ok) throw new Error("data.json nao encontrado");
      return response.json();
    });
  } catch (error) {
    console.warn("Nao foi possivel carregar data.json. Usando dados locais.", error);
    db = clone(seed);
  }
  normalizeDb();
  save();
  publicRender();
}

bootstrap();
