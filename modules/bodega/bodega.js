/* Bodega - Dinamita POS v16
   - Stock real separado de Inventario
   - Vista de existencias en bodega
   - Exportación CSV e impresión/PDF
   - Borrado con reversa de traspasos relacionados
*/
(function(){
  const $ = (id)=>document.getElementById(id);

  const elForm = $("b-form");
  const elMode = $("b-mode");
  const elId = $("b-id");

  const elImageFile = $("b-imageFile");
  const elThumb = $("b-thumb");

  const elProductSearch = $("b-productSearch");
  const elPick = $("b-pick");
  const elProductId = $("b-productId");
  const elPickedLabel = $("b-pickedLabel");

  const elQty = $("b-qty");
  const elUnitCost = $("b-unitCost");
  const elSupplier = $("b-supplier");
  const elDate = $("b-date");
  const elNotes = $("b-notes");

  const elReset = $("b-reset");
  const elStatus = $("b-status");

  const elSearch = $("b-search");
  const elList = $("b-list");
  const elEmpty = $("b-empty");

  const elStockSearch = $("b-stockSearch");
  const elStockList = $("b-stockList");
  const elStockEmpty = $("b-stockEmpty");
  const elExportCsv = $("b-exportCsv");
  const elExportPdf = $("b-exportPdf");

  let currentImageDataUrl = "";

  function state(){ return dpGetState(); }

  function setThumb(dataUrl){
    currentImageDataUrl = dataUrl || "";
    elThumb.innerHTML = "";
    if(currentImageDataUrl){
      const img = document.createElement("img");
      img.src = currentImageDataUrl;
      elThumb.appendChild(img);
    }else{
      elThumb.textContent = "IMG";
    }
  }

  function resetForm(){
    elId.value = "";
    elMode.textContent = "Modo: Alta";
    elImageFile.value = "";
    setThumb("");

    elProductSearch.value = "";
    elProductId.value = "";
    elPick.style.display = "none";
    elPick.innerHTML = "";
    elPickedLabel.textContent = "";

    elQty.value = 1;
    elUnitCost.value = 0;
    elSupplier.value = "";
    elDate.value = (window.dpYMDLocal ? window.dpYMDLocal(new Date()) : new Date().toISOString().slice(0,10));
    elNotes.value = "";
    elStatus.textContent = "";
  }

  function showPicker(list){
    if(!list || list.length === 0){
      elPick.style.display = "none";
      elPick.innerHTML = "";
      return;
    }
    elPick.style.display = "block";
    elPick.innerHTML = "";
    list.slice(0, 8).forEach(p=>{
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = `
        <div><strong>${p.name}</strong></div>
        <div class="sub">
          <span>${p.sku || "—"}</span>
          <span>Inventario: ${p.stock ?? 0}</span>
          <span>Bodega: ${Number(state().warehouse?.stock?.[p.id] || 0)}</span>
          <span>${p.category || "sin categoría"}</span>
        </div>
      `;
      btn.onclick = ()=>pickProduct(p.id);
      elPick.appendChild(btn);
    });
  }

  function pickProduct(productId){
    const st = state();
    const p = (st.products||[]).find(x=>x.id===productId);
    if(!p) return;
    elProductId.value = p.id;
    elProductSearch.value = `${p.name} (${p.sku || p.id})`;
    elPickedLabel.textContent = `Seleccionado: ${p.name} | Piso: ${p.stock ?? 0} | Bodega: ${Number(st.warehouse?.stock?.[p.id] || 0)}`;
    elPick.style.display = "none";
    elPick.innerHTML = "";
  }

  function handleProductSearch(){
    const q = (elProductSearch.value||"").trim();
    elProductId.value = "";
    elPickedLabel.textContent = "";
    if(!q){ showPicker([]); return; }
    const st = state();
    showPicker(dpFindProductByQuery(st, q));
  }

  function saveEntry(){
    const productId = (elProductId.value||"").trim();
    if(!productId){
      elStatus.textContent = "Selecciona un producto de la lista (picker).";
      return;
    }
    const qty = Number(elQty.value||0);
    if(!Number.isFinite(qty) || qty <= 0){
      elStatus.textContent = "Cantidad inválida.";
      return;
    }

    const payload = {
      productId,
      qty,
      unitCost: Number(elUnitCost.value||0),
      supplier: (elSupplier.value||"").trim(),
      date: elDate.value || (window.dpYMDLocal ? window.dpYMDLocal(new Date()) : new Date().toISOString().slice(0,10)),
      notes: (elNotes.value||"").trim(),
      imageDataUrl: currentImageDataUrl || ""
    };

    const id = (elId.value||"").trim();
    const result = id ? dpUpdateWarehouseEntry(id, {
      qty: payload.qty,
      unitCost: payload.unitCost,
      supplier: payload.supplier,
      date: payload.date,
      notes: payload.notes,
      image: payload.imageDataUrl
    }) : dpCreateWarehouseEntry(payload);

    if(result && result.ok === false){
      elStatus.textContent = result.message || "No se pudo guardar.";
      return;
    }

    elStatus.textContent = id ? "Movimiento actualizado." : "Entrada registrada en bodega.";
    renderAll();
    resetForm();
  }

  function movementCard(mv){
    const st = state();
    const p = (st.products||[]).find(x=>x.id===mv.productId);
    const name = p?.name || mv.productId;
    const sku = p?.sku || "—";
    const imgUrl = mv.image || p?.image || "";
    const isTransfer = mv.type === "transfer";
    const relatedLabel = mv.sourceEntryId ? `Origen: ${mv.sourceEntryId}` : "";

    const div = document.createElement("div");
    div.className = "mcard";

    const img = document.createElement("div");
    img.className = "mimg";
    if(imgUrl){
      const im = document.createElement("img");
      im.src = imgUrl;
      img.appendChild(im);
    }else{
      img.textContent = "IMG";
    }

    const meta = document.createElement("div");
    meta.className = "mmeta";
    meta.innerHTML = `
      <div class="title">${name}</div>
      <div class="sub">
        <span>Folio: ${mv.id}</span>
        <span>${mv.date || ""}</span>
        <span>${isTransfer ? "→" : "+"}${Number(mv.qty||0)} pzs</span>
        <span>${isTransfer ? "Salida a inventario" : "Entrada a bodega"}</span>
      </div>
      <div class="sub">
        <span>${sku}</span>
        ${mv.supplier ? `<span>Prov: ${mv.supplier}</span>` : ""}
        ${Number(mv.unitCost||0) ? `<span>Cost: ${dpFmtMoney(mv.unitCost||0)}</span>` : ""}
        ${relatedLabel ? `<span>${relatedLabel}</span>` : ""}
      </div>
      ${mv.notes ? `<div class="sub"><span>Nota: ${mv.notes}</span></div>` : ""}
    `;

    const actions = document.createElement("div");
    actions.className = "mactions";

    if(!isTransfer){
      const edit = document.createElement("button");
      edit.className = "btn btn--ghost btn--mini";
      edit.textContent = "Editar";
      edit.onclick = ()=>{
        elId.value = mv.id;
        elMode.textContent = "Modo: Edición";
        elQty.value = Number(mv.qty||1);
        elUnitCost.value = Number(mv.unitCost||0);
        elSupplier.value = mv.supplier || "";
        elDate.value = mv.date || (window.dpYMDLocal ? window.dpYMDLocal(new Date()) : new Date().toISOString().slice(0,10));
        elNotes.value = mv.notes || "";
        setThumb(mv.image || "");

        const p2 = (st.products||[]).find(x=>x.id===mv.productId);
        if(p2){
          elProductId.value = p2.id;
          elProductSearch.value = `${p2.name} (${p2.sku || p2.id})`;
          elPickedLabel.textContent = `Seleccionado: ${p2.name} | Piso: ${p2.stock ?? 0} | Bodega: ${Number(st.warehouse?.stock?.[p2.id] || 0)}`;
        }else{
          elProductId.value = mv.productId;
          elProductSearch.value = mv.productId;
        }
        elPick.style.display = "none";
        elPick.innerHTML = "";
        window.scrollTo({top:0, behavior:"smooth"});
      };

      const add = document.createElement("button");
      add.className = "btn btn--ghost btn--mini";
      add.textContent = "Agregar";
      add.onclick = ()=>{
        const v = prompt("¿Cuánta mercancía agregar?", "1");
        if(v === null) return;
        const n = Number(v);
        if(!Number.isFinite(n) || n <= 0){ alert("Cantidad inválida"); return; }
        dpCreateWarehouseEntry({
          productId: mv.productId,
          qty: n,
          unitCost: Number(mv.unitCost||0),
          supplier: mv.supplier || "",
          date: (window.dpYMDLocal ? window.dpYMDLocal(new Date()) : new Date().toISOString().slice(0,10)),
          notes: "",
          imageDataUrl: mv.image || ""
        });
        renderAll();
      };

      const transfer = document.createElement("button");
      transfer.className = "btn btn--ghost btn--mini";
      transfer.textContent = "Enviar a Inventario";
      transfer.onclick = ()=>{
        const st2 = state();
        const available = Number(st2.warehouse?.stock?.[mv.productId] || 0);
        if(available <= 0){ alert("No hay stock en bodega para transferir."); return; }
        const v = prompt(`¿Cuántas piezas enviar a Inventario? (Disponible en bodega: ${available})`, String(Math.min(available, Number(mv.qty||1))));
        if(v === null) return;
        const n = Number(v);
        if(!Number.isFinite(n) || n <= 0){ alert("Cantidad inválida"); return; }
        if(n > available){ alert("No puedes transferir más de lo que hay en bodega."); return; }
        const res = dpTransferFromWarehouse({ productId: mv.productId, qty: n, notes: "", sourceEntryId: mv.id });
        if(res && res.ok === false){ alert(res.message || "No se pudo transferir."); return; }
        renderAll();
        alert("Traspaso realizado: Bodega → Inventario.");
      };

      const del = document.createElement("button");
      del.className = "btn btn--mini";
      del.textContent = "Borrar";
      del.onclick = ()=>{
        if(!confirm(`¿Borrar movimiento ${mv.id}? Si tiene piezas enviadas a inventario, también se intentarán revertir.`)) return;
        const res = dpDeleteWarehouseEntry(mv.id);
        if(res && res.ok === false){
          alert(res.message || "No se pudo borrar.");
          return;
        }
        renderAll();
        resetForm();
      };

      actions.appendChild(edit);
      actions.appendChild(add);
      actions.appendChild(transfer);
      actions.appendChild(del);
    }else{
      const delTransfer = document.createElement("button");
      delTransfer.className = "btn btn--mini";
      delTransfer.textContent = "Revertir";
      delTransfer.onclick = ()=>{
        if(!confirm(`¿Revertir traspaso ${mv.id}? Esto regresará piezas a bodega y las quitará de inventario.`)) return;
        const res = dpDeleteWarehouseTransfer(mv.id);
        if(res && res.ok === false){ alert(res.message || "No se pudo revertir."); return; }
        renderAll();
      };
      actions.appendChild(delTransfer);
    }

    div.appendChild(img);
    div.appendChild(meta);
    div.appendChild(actions);

    return div;
  }

  function buildWarehouseStockRows(){
    const st = state();
    const stockMap = st.warehouse?.stock || {};
    const movements = st.warehouse?.movements || [];
    const q = (elStockSearch?.value || "").trim().toLowerCase();

    const rows = (st.products||[])
      .map(p=>{
        const qty = Number(stockMap[p.id] || 0);
        const latest = movements.find(m=>m.productId === p.id);
        return {
          id: p.id,
          name: p.name || p.id,
          sku: p.sku || "—",
          category: p.category || "sin categoría",
          qty,
          cost: Number(p.cost||0),
          latestAt: latest?.date || latest?.at || "",
          search: `${p.name||""} ${p.sku||""} ${p.category||""}`.toLowerCase()
        };
      })
      .filter(r => r.qty > 0 || movements.some(m=>m.productId === r.id));

    if(q){
      return rows.filter(r => r.search.includes(q));
    }
    return rows;
  }

  function renderStockTable(){
    const rows = buildWarehouseStockRows();
    elStockList.innerHTML = "";
    if(!rows.length){
      elStockEmpty.style.display = "block";
      return;
    }
    elStockEmpty.style.display = "none";
    rows.sort((a,b)=>a.name.localeCompare(b.name, 'es-MX'));
    rows.forEach(r=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><div class="stockName">${r.name}</div></td>
        <td>${r.sku}</td>
        <td><span class="stockTag">${r.category}</span></td>
        <td class="stockQty">${r.qty}</td>
        <td>${dpFmtMoney(r.cost)}</td>
        <td>${r.latestAt || "—"}</td>
      `;
      elStockList.appendChild(tr);
    });
  }

  function renderMovements(){
    const st = state();
    const q = (elSearch.value||"").trim().toLowerCase();
    let list = st.warehouse?.movements || [];

    if(q){
      list = list.filter(mv=>{
        const p = (st.products||[]).find(x=>x.id===mv.productId);
        const name = (p?.name||"").toLowerCase();
        const sku = (p?.sku||"").toLowerCase();
        return (mv.id||"").toLowerCase().includes(q) ||
               (mv.supplier||"").toLowerCase().includes(q) ||
               name.includes(q) || sku.includes(q);
      });
    }

    elList.innerHTML = "";
    if(!list || list.length === 0){
      elEmpty.style.display = "block";
      return;
    }
    elEmpty.style.display = "none";
    list.slice(0, 200).forEach(mv=> elList.appendChild(movementCard(mv)));
  }

  function renderAll(){
    renderMovements();
    renderStockTable();
  }

  function download(filename, text, mime="text/plain;charset=utf-8"){
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportCsv(){
    const rows = buildWarehouseStockRows().sort((a,b)=>a.name.localeCompare(b.name, 'es-MX'));
    if(!rows.length){ alert("No hay existencias para exportar."); return; }
    const csv = [
      ["Producto","SKU","Categoria","Piezas en bodega","Costo","Ultimo movimiento","Conteo fisico","Diferencia"],
      ...rows.map(r=>[
        r.name,
        r.sku,
        r.category,
        r.qty,
        r.cost,
        r.latestAt || "",
        "",
        ""
      ])
    ].map(row => row.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const ymd = window.dpYMDLocal ? window.dpYMDLocal(new Date()) : new Date().toISOString().slice(0,10);
    download(`bodega-inventario-${ymd}.csv`, csv, "text/csv;charset=utf-8");
  }

  function exportPrintable(){
    const rows = buildWarehouseStockRows().sort((a,b)=>a.name.localeCompare(b.name, 'es-MX'));
    if(!rows.length){ alert("No hay existencias para imprimir."); return; }
    const ymd = window.dpYMDLocal ? window.dpYMDLocal(new Date()) : new Date().toISOString().slice(0,10);
    const business = state().meta?.business?.name || "Dinamita POS";
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Inventario Bodega</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;color:#111} h1{margin:0 0 6px} p{margin:0 0 14px;color:#555}
table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:8px;font-size:12px;text-align:left} th{background:#f3f3f3}
.small{font-size:11px;color:#666}
</style></head><body>
<h1>${business} - Inventario de Bodega</h1>
<p>Fecha de impresión: ${ymd}</p>
<table>
<thead><tr><th>Producto</th><th>SKU</th><th>Categoría</th><th>Sistema</th><th>Conteo físico</th><th>Diferencia</th><th>Último movimiento</th></tr></thead>
<tbody>
${rows.map(r=>`<tr><td>${r.name}</td><td>${r.sku}</td><td>${r.category}</td><td>${r.qty}</td><td></td><td></td><td>${r.latestAt||"—"}</td></tr>`).join("")}
</tbody>
</table>
<p class="small">Este formato sirve para imprimir o guardar como PDF.</p>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
    const w = window.open("", "_blank");
    if(!w){ alert("El navegador bloqueó la ventana de impresión."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  elImageFile.addEventListener("change", (e)=>{
    const file = e.target.files?.[0];
    if(!file){ setThumb(currentImageDataUrl); return; }
    if(!file.type.startsWith("image/")){
      alert("Archivo no es imagen.");
      elImageFile.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = ()=> setThumb(String(reader.result||""));
    reader.readAsDataURL(file);
  });

  elProductSearch.addEventListener("input", handleProductSearch);
  elForm.addEventListener("submit", (e)=>{ e.preventDefault(); saveEntry(); });
  elReset.addEventListener("click", resetForm);
  elSearch.addEventListener("input", renderMovements);
  elStockSearch?.addEventListener("input", renderStockTable);
  elExportCsv?.addEventListener("click", exportCsv);
  elExportPdf?.addEventListener("click", exportPrintable);

  resetForm();
  renderAll();
})();
