let isAdminLoggedIn = false;
let products = [];
let activeCategory = "Todos";
let activeType = "Todos";
let activeGender = "Todos";
let toastTimer;
const adminRoute = new URLSearchParams(location.search).get("admin") === "1" || location.hash === "#admin";
const PRODUCT_COLUMNS = "id,name,brand,category,size,price,stock,notes,description,currency,gender,product_type,image,tone1,tone2,active";
const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

function fail(error, fallback) {
  throw new Error(error?.message || fallback);
}

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));
const money = (value, currency = "NIO") => currency === "USD"
  ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0))
  : `C$ ${Number(value || 0).toLocaleString("es-NI", { maximumFractionDigits: 2 })}`;

async function listProducts() {
  const { data, error } = await db.from("products").select(PRODUCT_COLUMNS).order("created_at", { ascending: false });
  if (error) fail(error, "No se pudo cargar el catálogo.");
  return data;
}

function showView(which) {
  if (which === "admin" && !isAdminLoggedIn) {
    showLogin();
    return;
  }
  const shop = which === "shop";
  document.getElementById("shop-view").classList.toggle("hidden", !shop);
  document.getElementById("admin-view").classList.toggle("hidden", shop);
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("nav-shop").classList.toggle("active", shop);
  document.getElementById("nav-admin").classList.toggle("active", !shop);
  document.getElementById("nav-logout").classList.toggle("hidden", shop);
  if (!shop) loadAdmin().catch((error) => showToast(error.message));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showLogin() {
  document.getElementById("shop-view").classList.add("hidden");
  document.getElementById("admin-view").classList.add("hidden");
  document.getElementById("login-view").classList.remove("hidden");
  document.getElementById("nav-shop").classList.remove("active");
  document.getElementById("nav-admin").classList.add("active");
  document.getElementById("nav-logout").classList.add("hidden");
  document.getElementById("login-error").textContent = "";
  document.getElementById("login-pass").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function submitLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = String(new FormData(form).get("email") || "").trim();
  const password = new FormData(form).get("password");
  const error = document.getElementById("login-error");
  error.textContent = "";
  try {
    const { error: authError } = await db.auth.signInWithPassword({ email, password });
    if (authError) throw new Error("Correo o contraseña incorrectos.");
    isAdminLoggedIn = true;
    form.reset();
    showView("admin");
  } catch (requestError) {
    error.textContent = requestError.message;
    document.getElementById("login-pass").value = "";
    document.getElementById("login-pass").focus();
  }
}

async function logoutAdmin() {
  try {
    await db.auth.signOut();
    isAdminLoggedIn = false;
    if (adminRoute) {
      location.assign("./");
      return;
    }
    showView("shop");
  } catch (error) {
    showToast(error.message);
  }
}

function renderFilterGroup(containerId, options, active, onSelect) {
  const container = document.getElementById(containerId);
  container.innerHTML = options.map((option) =>
    `<button class="filter ${active === option ? "active" : ""}" data-value="${esc(option)}">${esc(option)}</button>`,
  ).join("");
  container.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => onSelect(button.dataset.value));
  });
}

function renderFilters() {
  const categories = ["Todos", ...new Set(products.map((product) => product.category).filter(Boolean))];
  renderFilterGroup("filters-type", ["Todos", "Perfume", "Decant"], activeType, (value) => {
    activeType = value;
    renderShop();
  });
  renderFilterGroup("filters-gender", ["Todos", "Hombre", "Mujer", "Unisex"], activeGender, (value) => {
    activeGender = value;
    renderShop();
  });
  renderFilterGroup("filters", categories, activeCategory, setCategory);
}

function setCategory(category) {
  activeCategory = category;
  renderShop();
}

function renderShop(message = "") {
  renderFilters();
  const query = (document.getElementById("search").value || "").trim().toLowerCase();
  const list = products.filter((product) =>
    product.active
    && Number(product.stock) > 0
    && (activeCategory === "Todos" || product.category === activeCategory)
    && (activeType === "Todos" || product.product_type === activeType)
    && (activeGender === "Todos" || product.gender === activeGender)
    && `${product.name} ${product.brand} ${product.notes} ${product.category}`.toLowerCase().includes(query),
  );
  const root = document.getElementById("product-grid");
  if (message) {
    root.innerHTML = `<div class="empty">${esc(message)}</div>`;
    return;
  }
  if (!list.length) {
    root.innerHTML = '<div class="empty">No encontramos perfumes con esos filtros. Prueba otra búsqueda.</div>';
    return;
  }
  root.innerHTML = list.map((product) => `
    <article class="card">
      <div class="product-visual" style="--tone1:${esc(product.tone1 || "#c6b9a1")};--tone2:${esc(product.tone2 || "#e9dfcf")}">
        ${product.image ? `<img loading="lazy" src="${esc(product.image)}" alt="${esc(product.name)}" onerror="this.remove()">` : ""}
        <div class="visual-copy"><small>${esc(product.brand)}</small><strong>${esc(product.name)}</strong></div>
      </div>
      <div class="card-body">
        <div class="card-brand">${esc(product.product_type || "Perfume")} · ${esc(product.gender || "Unisex")} · ${esc(product.category)} · ${esc(product.size || "")}</div>
        <h3>${esc(product.name)}</h3>
        <div class="notes">${esc(product.notes || "Descubre sus notas aromáticas")}</div>
        <div class="card-bottom"><span class="price">${money(product.price, product.currency)}</span><button class="detail-link" onclick="showDetails('${esc(product.id)}')">Ver detalles →</button></div>
      </div>
    </article>
  `).join("");
}

async function loadAdmin() {
  products = await listProducts();
  renderShop();
  renderAdmin();
}

function renderAdmin() {
  const query = (document.getElementById("admin-search").value || "").trim().toLowerCase();
  const all = products;
  document.getElementById("stat-total").textContent = all.length;
  document.getElementById("stat-active").textContent = all.filter((product) => product.active).length;
  document.getElementById("stat-stock").textContent = all.reduce((total, product) => total + Number(product.stock || 0), 0);
  const rows = all.filter((product) => `${product.name} ${product.brand} ${product.category}`.toLowerCase().includes(query));
  document.getElementById("admin-rows").innerHTML = rows.length
    ? rows.map((product) => `
      <tr>
        <td><div class="product-name">${esc(product.name)}</div><div class="product-sub">${esc(product.brand)}</div></td>
        <td>${esc(product.product_type || "Perfume")} · ${esc(product.gender || "Unisex")}<div class="product-sub">${esc(product.category)}</div></td><td>${money(product.price, product.currency)}</td><td>${Number(product.stock || 0)}</td>
        <td><span class="status ${product.active ? "" : "off"}">${product.active ? "Visible" : "Oculto"}</span></td>
        <td><div class="row-actions"><button class="text-btn" onclick="openForm('${esc(product.id)}')">Editar</button><button class="text-btn delete" onclick="removeProduct('${esc(product.id)}')">Borrar</button></div></td>
      </tr>
    `).join("")
    : '<tr><td colspan="6" style="text-align:center;padding:28px;color:#77736b">No hay productos para mostrar.</td></tr>';
}

function openForm(id = "") {
  const product = products.find((item) => item.id === id) || {
    name: "",
    brand: "",
    category: "Floral",
    notes: "",
    price: "",
    currency: "NIO",
    gender: "Unisex",
    product_type: "Perfume",
    size: "50 ml",
    stock: 0,
    active: true,
    description: "",
    tone1: "#2b2b2b",
    tone2: "#707070",
    image: "",
  };
  const editing = Boolean(id);
  document.getElementById("modal-root").innerHTML = `
    <div class="modal-backdrop" role="presentation" onclick="if(event.target===this)closeModal()">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="form-title">
        <div class="modal-head"><h2 id="form-title">${editing ? "Editar perfume" : "Agregar perfume"}</h2><button class="close" onclick="closeModal()" aria-label="Cerrar">×</button></div>
        <form id="product-form" onsubmit="submitProduct(event,'${esc(id)}')">
          <div class="form-grid">
            <div class="field"><label for="f-name">Nombre *</label><input id="f-name" name="name" required value="${esc(product.name)}"></div>
            <div class="field"><label for="f-brand">Marca *</label><input id="f-brand" name="brand" required value="${esc(product.brand)}"></div>
            <div class="field"><label for="f-type">Tipo</label><select id="f-type" name="product_type">${["Perfume", "Decant"].map((option) => `<option value="${option}" ${product.product_type === option ? "selected" : ""}>${option === "Perfume" ? "Perfume completo" : "Decant"}</option>`).join("")}</select></div>
            <div class="field"><label for="f-gender">Para</label><select id="f-gender" name="gender">${["Hombre", "Mujer", "Unisex"].map((option) => `<option ${product.gender === option ? "selected" : ""}>${option}</option>`).join("")}</select></div>
            <div class="field"><label for="f-category">Familia olfativa</label><select id="f-category" name="category">${["Floral", "Amaderado", "Cítrico", "Oriental", "Fresco", "Otro"].map((category) => `<option ${product.category === category ? "selected" : ""}>${category}</option>`).join("")}</select></div>
            <div class="field"><label for="f-size">Tamaño</label><input id="f-size" name="size" value="${esc(product.size)}" placeholder="100 ml"></div>
            <div class="field"><label for="f-price">Precio *</label><input id="f-price" name="price" type="number" min="0" step="0.01" required value="${esc(product.price)}"></div>
            <div class="field"><label for="f-currency">Moneda</label><select id="f-currency" name="currency"><option value="NIO" ${product.currency !== "USD" ? "selected" : ""}>Córdobas (C$)</option><option value="USD" ${product.currency === "USD" ? "selected" : ""}>Dólares (USD)</option></select></div>
            <div class="field"><label for="f-stock">Existencias</label><input id="f-stock" name="stock" type="number" min="0" step="1" value="${esc(product.stock)}"></div>
            <div class="field full"><label for="f-notes">Notas aromáticas</label><input id="f-notes" name="notes" value="${esc(product.notes)}" placeholder="Ej. jazmín · vainilla · almizcle"></div>
            <div class="field full"><label for="f-desc">Descripción</label><textarea id="f-desc" name="description">${esc(product.description)}</textarea></div>
            <div class="field full"><label for="f-image">URL de la foto (opcional)</label><input id="f-image" name="image" type="text" inputmode="url" value="${esc(product.image)}" placeholder="https://…"></div>
            <div class="field full"><label for="f-image-file">Subir foto desde este dispositivo</label><input id="f-image-file" name="imageFile" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG o WebP; máximo 4 MB. Si seleccionas un archivo, reemplaza la URL.</small></div>
            <div class="field"><label for="f-tone1">Color de fondo</label><input id="f-tone1" name="tone1" type="color" value="${esc(product.tone1)}"></div>
            <div class="field"><label for="f-tone2">Color secundario</label><input id="f-tone2" name="tone2" type="color" value="${esc(product.tone2)}"></div>
            <div class="field full"><label>Mostrar en catálogo</label><div class="checkline"><input id="f-active" name="active" type="checkbox" ${product.active ? "checked" : ""}><label for="f-active">Producto visible para clientes</label></div></div>
          </div>
          <div class="form-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" type="submit">Guardar perfume</button></div>
        </form>
      </section>
    </div>`;
}

async function submitProduct(event, id) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const submitButton = formElement.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  const product = {
    name: form.get("name").trim(),
    brand: form.get("brand").trim(),
    category: form.get("category"),
    size: form.get("size").trim(),
    price: Number(form.get("price")),
    currency: form.get("currency"),
    gender: form.get("gender"),
    product_type: form.get("product_type"),
    stock: Number(form.get("stock") || 0),
    notes: form.get("notes").trim(),
    description: form.get("description").trim(),
    image: form.get("image").trim(),
    tone1: form.get("tone1"),
    tone2: form.get("tone2"),
    active: form.has("active"),
  };
  try {
    const imageFile = form.get("imageFile");
    if (imageFile?.size) product.image = await uploadImage(imageFile);
    const table = db.from("products");
    const { error } = id
      ? await table.update({ ...product, updated_at: new Date().toISOString() }).eq("id", id)
      : await table.insert(product);
    if (error) fail(error, "No se pudo guardar el producto.");
    closeModal();
    await loadAdmin();
    showToast(id ? "Cambios guardados." : "Perfume agregado.");
  } catch (error) {
    showToast(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function uploadImage(file) {
  const types = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const extension = types[file.type];
  if (!extension) throw new Error("La imagen debe ser JPG, PNG o WebP.");
  if (file.size > 4 * 1024 * 1024) throw new Error("La imagen no puede superar 4 MB.");
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage.from("product-images").upload(path, file, { contentType: file.type });
  if (error) fail(error, "No se pudo subir la imagen.");
  return db.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

async function removeProduct(id) {
  const product = products.find((item) => item.id === id);
  if (!product || !confirm(`¿Borrar “${product.name}” del catálogo? Esta acción no se puede deshacer.`)) return;
  try {
    const { error } = await db.from("products").delete().eq("id", id);
    if (error) fail(error, "No se pudo borrar el producto.");
    await loadAdmin();
    showToast("Producto borrado.");
  } catch (error) {
    showToast(error.message);
  }
}

function closeModal() {
  document.getElementById("modal-root").innerHTML = "";
}

function showDetails(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;
  document.getElementById("modal-root").innerHTML = `
    <div class="modal-backdrop" role="presentation" onclick="if(event.target===this)closeModal()">
      <section class="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div class="modal-head"><span class="eyebrow">${esc(product.product_type || "Perfume")} · ${esc(product.gender || "Unisex")} · ${esc(product.category)}</span><button class="close" onclick="closeModal()" aria-label="Cerrar">×</button></div>
        <div class="detail-layout">
          <div class="detail-visual" style="background:linear-gradient(145deg,${esc(product.tone1)},${esc(product.tone2)})">${product.image ? `<img src="${esc(product.image)}" alt="${esc(product.name)}" onerror="this.remove()">` : ""}</div>
          <div class="detail-copy"><div class="card-brand">${esc(product.brand)}</div><h2 id="detail-title">${esc(product.name)}</h2><div class="size">${esc(product.size)}</div><p>${esc(product.description)}</p><div class="detail-notes"><strong>Notas:</strong> ${esc(product.notes || "Consulta los detalles con la tienda.")}</div><div class="price">${money(product.price, product.currency)}</div><p class="size">Disponibilidad: ${Number(product.stock)} unidad(es)</p></div>
        </div>
      </section>
    </div>`;
}

function showToast(message) {
  const root = document.getElementById("toast-root");
  root.innerHTML = `<div class="toast">${esc(message)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { root.innerHTML = ""; }, 2800);
}

async function initialize() {
  document.getElementById("year").textContent = new Date().getFullYear();
  document.getElementById("nav-shop").onclick = () => {
    if (adminRoute) location.assign("./");
    else showView("shop");
  };
  document.getElementById("product-grid").innerHTML = '<div class="empty">Cargando catálogo…</div>';
  const adminMode = adminRoute || new URLSearchParams(location.search).get("admin") === "1";
  if (adminRoute) showLogin();
  if (adminMode) document.getElementById("nav-admin").classList.remove("hidden");

  try {
    products = await listProducts();
    renderShop();
  } catch (error) {
    renderShop(error.message);
  }

  if (adminMode) {
    try {
      const { data } = await db.auth.getSession();
      if (data.session) {
        isAdminLoggedIn = true;
        showView("admin");
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin();
      document.getElementById("login-error").textContent = error.message;
    }
  }
}

initialize();
