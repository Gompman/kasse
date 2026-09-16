(function () {
  const state = {
    packs: [],
    pack: null,
    cart: Object.create(null),
    givenCents: 0,
    editing: false,
    dirty: false,
    dialogMode: "create",
    pollTimer: null,
  };

  const els = {
    productGrid: document.getElementById("product-grid"),
    packEmpty: document.getElementById("pack-empty"),
    cartList: document.getElementById("cart-list"),
    cartEmpty: document.getElementById("cart-empty"),
    cartCount: document.getElementById("cart-count"),
    totalSum: document.getElementById("total-sum"),
    givenAmount: document.getElementById("given-amount"),
    changeAmount: document.getElementById("change-amount"),
    cashButtons: document.getElementById("cash-buttons"),
    clearGiven: document.getElementById("clear-given"),
    nextCustomer: document.getElementById("next-customer"),
    menuToggle: document.getElementById("menu-toggle"),
    appMenu: document.getElementById("app-menu"),
    menuBackdrop: document.getElementById("menu-backdrop"),
    packTitle: document.getElementById("pack-title"),
    fullscreenToggle: document.getElementById("fullscreen-toggle"),
    packSelect: document.getElementById("pack-select"),
    editToggle: document.getElementById("edit-toggle"),
    editToolbar: document.getElementById("edit-toolbar"),
    addProduct: document.getElementById("add-product"),
    newPack: document.getElementById("new-pack"),
    copyPack: document.getElementById("copy-pack"),
    savePack: document.getElementById("save-pack"),
    editStatus: document.getElementById("edit-status"),
    packDialog: document.getElementById("pack-dialog"),
    packForm: document.getElementById("pack-form"),
    packDialogTitle: document.getElementById("pack-dialog-title"),
    packNameInput: document.getElementById("pack-name-input"),
    packDialogConfirm: document.getElementById("pack-dialog-confirm"),
  };

  function toCents(euros) {
    return Math.round(Number(euros) * 100);
  }

  function formatEuro(cents) {
    return (cents / 100).toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
    });
  }

  function parsePrice(value) {
    const normalized = String(value || "")
      .trim()
      .replace(/\s/g, "")
      .replace("€", "")
      .replace(",", ".");
    const price = Number(normalized);
    return Number.isFinite(price) ? Math.round(price * 100) / 100 : NaN;
  }

  function slugify(value) {
    const raw = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return raw || "artikel";
  }

  function uniqueProductId(name, existing) {
    const used = new Set(existing.map((product) => product.id));
    const base = slugify(name);
    if (!used.has(base)) {
      return base;
    }
    let n = 2;
    while (used.has(`${base}-${n}`)) {
      n += 1;
    }
    return `${base}-${n}`;
  }

  function packIdFromPath() {
    const match = window.location.pathname.match(/^\/p\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function products() {
    return state.pack && Array.isArray(state.pack.products) ? state.pack.products : [];
  }

  function getQty(id) {
    return state.cart[id] || 0;
  }

  function setQty(id, qty) {
    if (qty <= 0) {
      delete state.cart[id];
      return;
    }
    state.cart[id] = qty;
  }

  function clearCart() {
    state.cart = Object.create(null);
    state.givenCents = 0;
  }

  function setStatus(message, isError) {
    if (!message) {
      els.editStatus.hidden = true;
      els.editStatus.textContent = "";
      return;
    }
    els.editStatus.hidden = false;
    els.editStatus.textContent = message;
    els.editStatus.classList.toggle("is-error", Boolean(isError));
  }

  async function api(url, options) {
    const { headers, ...rest } = options || {};
    const response = await fetch(url, {
      ...rest,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...headers },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Fehler ${response.status}`);
    }
    return data;
  }

  function cartEntries() {
    return products()
      .filter((product) => getQty(product.id) > 0)
      .map((product) => ({
        product,
        qty: getQty(product.id),
        lineCents: getQty(product.id) * toCents(product.price),
      }));
  }

  function totals() {
    const entries = cartEntries();
    const qty = entries.reduce((sum, entry) => sum + entry.qty, 0);
    const sumCents = entries.reduce((sum, entry) => sum + entry.lineCents, 0);
    return { qty, sumCents };
  }

  function renderPackSelect() {
    const current = state.pack ? state.pack.id : packIdFromPath();
    els.packSelect.replaceChildren();
    if (state.packs.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Kein Paket";
      els.packSelect.append(option);
      return;
    }
    state.packs.forEach((pack) => {
      const option = document.createElement("option");
      option.value = pack.id;
      option.textContent = pack.name;
      option.selected = pack.id === current;
      els.packSelect.append(option);
    });
  }

  function renderProducts() {
    els.productGrid.replaceChildren();
    const list = products();
    els.packEmpty.classList.toggle("is-hidden", Boolean(state.pack));
    if (!state.pack) {
      els.packEmpty.textContent = "Kein Paket geladen. Lege eines unter Pflegen an.";
    }

    list.forEach((product) => {
      const qty = getQty(product.id);
      if (state.editing) {
        const tile = document.createElement("div");
        tile.className = "product-tile is-editing";
        tile.dataset.id = product.id;

        const nameInput = document.createElement("input");
        nameInput.className = "name-input";
        nameInput.value = product.name;
        nameInput.setAttribute("aria-label", "Artikelname");
        nameInput.addEventListener("input", () => {
          product.name = nameInput.value;
          state.dirty = true;
        });

        const row = document.createElement("div");
        row.className = "product-tile-edit-row";

        const priceInput = document.createElement("input");
        priceInput.className = "price-input";
        priceInput.inputMode = "decimal";
        priceInput.value = String(product.price).replace(".", ",");
        priceInput.setAttribute("aria-label", "Preis");
        priceInput.addEventListener("change", () => {
          const price = parsePrice(priceInput.value);
          if (Number.isFinite(price)) {
            product.price = price;
            priceInput.value = String(price).replace(".", ",");
            state.dirty = true;
            renderTotalsAndChange();
          }
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn-tiny";
        remove.setAttribute("aria-label", `${product.name} löschen`);
        remove.textContent = "×";
        remove.addEventListener("click", () => {
          state.pack.products = list.filter((item) => item.id !== product.id);
          delete state.cart[product.id];
          state.dirty = true;
          render();
        });

        row.append(priceInput, remove);
        tile.append(nameInput, row);
        els.productGrid.append(tile);
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "product-tile" + (qty ? " has-qty" : "");
      button.dataset.id = product.id;
      button.setAttribute(
        "aria-label",
        `${product.name} hinzufügen, ${formatEuro(toCents(product.price))}`
      );

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = product.name;

      const price = document.createElement("span");
      price.className = "price";
      price.textContent = formatEuro(toCents(product.price));

      const badge = document.createElement("span");
      badge.className = "qty-badge";
      badge.textContent = String(qty);

      button.append(name, price, badge);
      button.addEventListener("click", () => {
        setQty(product.id, qty + 1);
        render();
      });
      els.productGrid.append(button);
    });
  }

  function renderCart() {
    const entries = cartEntries();
    els.cartList.replaceChildren();
    els.cartEmpty.classList.toggle("is-hidden", entries.length > 0);

    entries.forEach(({ product, qty, lineCents }) => {
      const item = document.createElement("li");
      item.className = "cart-item";

      const meta = document.createElement("div");
      meta.className = "meta";

      const name = document.createElement("span");
      name.className = "line-name";
      name.textContent = product.name;

      const sub = document.createElement("span");
      sub.className = "line-sub";
      sub.textContent = `${qty} × ${formatEuro(toCents(product.price))} = ${formatEuro(lineCents)}`;

      meta.append(name, sub);

      const controls = document.createElement("div");
      controls.className = "qty-controls";

      const minus = document.createElement("button");
      minus.type = "button";
      minus.setAttribute("aria-label", `${product.name} minus eins`);
      minus.textContent = "−";
      minus.addEventListener("click", () => {
        setQty(product.id, qty - 1);
        render();
      });

      const qtyLabel = document.createElement("span");
      qtyLabel.className = "qty";
      qtyLabel.textContent = String(qty);

      const plus = document.createElement("button");
      plus.type = "button";
      plus.setAttribute("aria-label", `${product.name} plus eins`);
      plus.textContent = "+";
      plus.addEventListener("click", () => {
        setQty(product.id, qty + 1);
        render();
      });

      controls.append(minus, qtyLabel, plus);
      item.append(meta, controls);
      els.cartList.append(item);
    });

    const { qty } = totals();
    if (qty > 0) {
      els.cartCount.hidden = false;
      els.cartCount.classList.remove("is-hidden");
      els.cartCount.textContent = qty === 1 ? "1 Artikel" : `${qty} Artikel`;
    } else {
      els.cartCount.hidden = true;
      els.cartCount.classList.add("is-hidden");
      els.cartCount.textContent = "";
    }
  }

  function renderTotalsAndChange() {
    const { sumCents } = totals();
    els.totalSum.textContent = formatEuro(sumCents);
    els.givenAmount.textContent = formatEuro(state.givenCents);

    els.changeAmount.classList.remove("is-ok", "is-warn");

    if (state.givenCents === 0) {
      els.changeAmount.textContent = "—";
      return;
    }

    if (sumCents === 0) {
      els.changeAmount.textContent = formatEuro(state.givenCents);
      els.changeAmount.classList.add("is-ok");
      return;
    }

    const diff = state.givenCents - sumCents;
    if (diff < 0) {
      const prefix = document.createElement("span");
      prefix.className = "change-prefix";
      prefix.textContent = "Noch";
      const value = document.createElement("span");
      value.className = "change-value";
      value.textContent = formatEuro(-diff);
      els.changeAmount.replaceChildren(prefix, value);
      els.changeAmount.classList.add("is-warn");
      return;
    }

    els.changeAmount.textContent = formatEuro(diff);
    els.changeAmount.classList.add("is-ok");
  }

  function setMenuOpen(open) {
    document.body.classList.toggle("menu-open", open);
    els.appMenu.hidden = !open;
    els.appMenu.classList.toggle("is-hidden", !open);
    els.menuBackdrop.classList.toggle("is-hidden", !open);
    els.menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    els.menuToggle.setAttribute("aria-label", open ? "Menü schließen" : "Menü");
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  function renderChrome() {
    document.body.classList.toggle("is-editing", state.editing);
    els.editToolbar.classList.toggle("is-hidden", !state.editing);
    els.editToggle.textContent = state.editing ? "Kasse" : "Pflegen";
    els.nextCustomer.hidden = state.editing;
    els.packTitle.textContent = state.pack ? state.pack.name : "Kasse";
    document.title = state.pack ? `Kasse · ${state.pack.name}` : "Kasse";
  }

  function render() {
    renderChrome();
    renderPackSelect();
    renderProducts();
    renderCart();
    renderTotalsAndChange();
  }

  function addGiven(cents) {
    state.givenCents += cents;
    renderTotalsAndChange();
  }

  function setPackUrl(id, replace) {
    const url = id ? `/p/${encodeURIComponent(id)}` : "/";
    if (replace) {
      history.replaceState({ packId: id }, "", url);
    } else {
      history.pushState({ packId: id }, "", url);
    }
  }

  async function loadPacks() {
    const data = await api("/api/packs");
    state.packs = data.packs || [];
  }

  async function loadPack(id, options) {
    const replace = options && options.replace;
    if (!id) {
      state.pack = null;
      clearCart();
      render();
      return;
    }
    const pack = await api(`/api/packs/${encodeURIComponent(id)}`);
    const samePack = state.pack && state.pack.id === pack.id;
    state.pack = pack;
    if (!samePack) {
      clearCart();
    } else {
      Object.keys(state.cart).forEach((productId) => {
        if (!pack.products.some((product) => product.id === productId)) {
          delete state.cart[productId];
        }
      });
    }
    setPackUrl(pack.id, replace || packIdFromPath() === pack.id);
    render();
  }

  async function selectPack(id) {
    if (state.editing && state.dirty) {
      const ok = window.confirm("Ungespeicherte Änderungen verwerfen?");
      if (!ok) {
        renderPackSelect();
        return;
      }
      state.dirty = false;
    }
    setStatus("");
    await loadPack(id);
  }

  function openDialog(mode) {
    state.dialogMode = mode;
    els.packDialogTitle.textContent = mode === "copy" ? "Paket duplizieren" : "Neues Paket";
    els.packDialogConfirm.textContent = mode === "copy" ? "Duplizieren" : "Anlegen";
    const base = state.pack ? state.pack.name : "";
    els.packNameInput.value = mode === "copy" && base ? `${base} Kopie` : "";
    els.packDialog.showModal();
    els.packNameInput.focus();
  }

  async function bootstrap() {
    await loadPacks();
    const requested = packIdFromPath();
    const fallback = state.packs[0] && state.packs[0].id;
    const id = requested || fallback;
    if (requested && !state.packs.some((pack) => pack.id === requested)) {
      state.pack = null;
      els.packEmpty.classList.remove("is-hidden");
      els.packEmpty.textContent = `Paket „${requested}“ nicht gefunden.`;
      render();
      return;
    }
    if (id) {
      await loadPack(id, { replace: true });
    } else {
      render();
    }
  }

  els.cashButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cents]");
    if (!button) {
      return;
    }
    addGiven(Number(button.dataset.cents));
  });

  els.clearGiven.addEventListener("click", () => {
    state.givenCents = 0;
    renderTotalsAndChange();
  });

  els.nextCustomer.addEventListener("click", () => {
    clearCart();
    render();
  });

  els.menuToggle.addEventListener("click", () => {
    setMenuOpen(els.appMenu.hidden);
  });

  els.menuBackdrop.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  els.packSelect.addEventListener("change", () => {
    closeMenu();
    selectPack(els.packSelect.value).catch((error) => setStatus(error.message, true));
  });

  els.editToggle.addEventListener("click", () => {
    closeMenu();
    if (state.editing && state.dirty) {
      const ok = window.confirm("Ungespeicherte Änderungen verwerfen?");
      if (!ok) {
        return;
      }
      state.dirty = false;
      if (state.pack) {
        loadPack(state.pack.id).catch((error) => setStatus(error.message, true));
      }
    }
    state.editing = !state.editing;
    setStatus("");
    render();
  });

  els.addProduct.addEventListener("click", () => {
    if (!state.pack) {
      setStatus("Zuerst ein Paket anlegen.", true);
      return;
    }
    const id = uniqueProductId("artikel", state.pack.products);
    state.pack.products.push({ id, name: "Artikel", price: 0 });
    state.dirty = true;
    render();
  });

  els.newPack.addEventListener("click", () => openDialog("create"));
  els.copyPack.addEventListener("click", () => {
    if (!state.pack) {
      setStatus("Kein Paket zum Duplizieren.", true);
      return;
    }
    openDialog("copy");
  });

  els.packForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    if (submitter && submitter.value === "cancel") {
      els.packDialog.close();
      return;
    }
    const name = els.packNameInput.value.trim();
    if (!name) {
      return;
    }
    try {
      let pack;
      if (state.dialogMode === "copy" && state.pack) {
        pack = await api(`/api/packs/${encodeURIComponent(state.pack.id)}/copy`, {
          method: "POST",
          body: JSON.stringify({ name }),
        });
      } else {
        pack = await api("/api/packs", {
          method: "POST",
          body: JSON.stringify({ name, products: [] }),
        });
      }
      els.packDialog.close();
      state.editing = true;
      state.dirty = false;
      await loadPacks();
      await loadPack(pack.id);
      setStatus("Paket angelegt.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  els.savePack.addEventListener("click", async () => {
    if (!state.pack) {
      return;
    }
    try {
      const saved = await api(`/api/packs/${encodeURIComponent(state.pack.id)}`, {
        method: "PUT",
        body: JSON.stringify(state.pack),
      });
      state.pack = saved;
      state.dirty = false;
      await loadPacks();
      setStatus("Gespeichert.");
      render();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  window.addEventListener("popstate", () => {
    const id = packIdFromPath();
    if (id) {
      loadPack(id, { replace: true }).catch((error) => setStatus(error.message, true));
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  let wakeLock = null;
  let wakeVideo = null;

  function startWakeVideo() {
    if (wakeVideo) {
      return wakeVideo.play().catch(() => {});
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 1, 1);
    wakeVideo = document.createElement("video");
    wakeVideo.setAttribute("playsinline", "");
    wakeVideo.muted = true;
    wakeVideo.loop = true;
    wakeVideo.playsInline = true;
    if (canvas.captureStream) {
      wakeVideo.srcObject = canvas.captureStream(1);
    }
    wakeVideo.setAttribute("aria-hidden", "true");
    wakeVideo.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.append(wakeVideo);
    return wakeVideo.play().catch(() => {});
  }

  function stopWakeVideo() {
    if (!wakeVideo) {
      return;
    }
    wakeVideo.pause();
    wakeVideo.remove();
    wakeVideo = null;
  }

  async function keepScreenAwake() {
    try {
      if (navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
          wakeLock = null;
        });
      }
    } catch (_error) {
      wakeLock = null;
    }
    startWakeVideo();
  }

  async function allowScreenSleep() {
    try {
      if (wakeLock) {
        await wakeLock.release();
      }
    } catch (_error) {
      /* ignore */
    }
    wakeLock = null;
    stopWakeVideo();
  }

  function updateFullscreenButton() {
    if (!els.fullscreenToggle) {
      return;
    }
    const active = Boolean(fullscreenElement());
    els.fullscreenToggle.classList.toggle("is-active", active);
    els.fullscreenToggle.setAttribute("aria-label", active ? "Vollbild beenden" : "Vollbild");
    const fsLabel = document.getElementById("fullscreen-label");
    if (fsLabel) {
      fsLabel.textContent = active ? "Vollbild beenden" : "Vollbild";
    }
    if (active) {
      keepScreenAwake();
    } else {
      allowScreenSleep();
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && fullscreenElement()) {
      keepScreenAwake();
    }
  });

  if (els.fullscreenToggle) {
    const canFullscreen =
      document.documentElement.requestFullscreen ||
      document.documentElement.webkitRequestFullscreen;
    if (!canFullscreen) {
      els.fullscreenToggle.hidden = true;
    } else {
      els.fullscreenToggle.addEventListener("click", () => {
        if (fullscreenElement()) {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
          return;
        }
        const root = document.documentElement;
        if (root.requestFullscreen) {
          root.requestFullscreen();
        } else if (root.webkitRequestFullscreen) {
          root.webkitRequestFullscreen();
        }
      });
      document.addEventListener("fullscreenchange", updateFullscreenButton);
      document.addEventListener("webkitfullscreenchange", updateFullscreenButton);
    }
  }

  async function poll() {
    if (state.editing || state.dirty || !state.pack) {
      return;
    }
    try {
      const [packs, pack] = await Promise.all([
        api("/api/packs"),
        api(`/api/packs/${encodeURIComponent(state.pack.id)}`),
      ]);
      state.packs = packs.packs || state.packs;
      const before = JSON.stringify(state.pack);
      const after = JSON.stringify(pack);
      if (before !== after) {
        await loadPack(pack.id, { replace: true });
      } else {
        renderPackSelect();
      }
    } catch (_error) {
      /* offline am Stand: still usable from last load */
    }
  }

  state.pollTimer = window.setInterval(poll, 20000);

  bootstrap().catch((error) => {
    setStatus(error.message, true);
    render();
  });
})();
