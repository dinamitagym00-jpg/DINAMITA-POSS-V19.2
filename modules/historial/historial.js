/* Historial - Dinamita POS v0
   - Lista ventas y servicios (membresías)
   - Filtro por fechas y buscador
   - Reimprimir ticket
   - Borrar venta con reversa de inventario y borrado de membresía ligada
*/
(function(){
  const $ = (id)=>document.getElementById(id);

  const hSearch = $("h-search");
  const hFrom = $("h-from");
  const hTo = $("h-to");
  const hClear = $("h-clear");

  const hStats = $("h-stats");
  const hList = $("h-list");
  const hEmpty = $("h-empty");

  const hTicketTitle = $("h-ticketTitle");
  const hTicketPreview = $("h-ticketPreview");
  const hPrint = $("h-print");

  let lastTicketHtml = "";
  let lastTicketTitle = "Ticket";

  function state(){ return dpGetState(); }
  function fmtMoney(n){ return dpFmtMoney ? dpFmtMoney(n) : ("$"+Number(n||0).toFixed(2)); }
  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;");
  }

  function getConfig(){
    const biz = (typeof dpGetBizInfo === "function") ? dpGetBizInfo() : { name:"DINÁMITA GYM", address:"", phone:"", email:"", social:"", logoDataUrl:"" };
    const tcfg = (typeof dpGetTicketCfg === "function") ? dpGetTicketCfg() : { message:"Gracias por tu compra en Dinamita Gym 💥" };
    return {
      logoDataUrl: biz.logoDataUrl || "",
      name: biz.name || "DINÁMITA GYM",
      address: biz.address || "",
      phone: biz.phone || "",
      email: biz.email || "",
      social: biz.social || "",
      message: tcfg.message || "Gracias por tu compra en Dinamita Gym 💥",
      ivaLabel: "IVA: 0%"
    };
  }



  function getClientName(clientId){
    const st = state();
    const c = (st.clients||[]).find(x=>x.id===clientId);
    if(c) return c.name;
    if(clientId === "GEN") return "Cliente General";
    return clientId || "Cliente";
  }

  function getProductName(pid){
    const st = state();
    const p = (st.products||[]).find(x=>x.id===pid);
    return p ? p.name : pid;
  }

  function openPrintWindow(html, title){
    const w = window.open("", "_blank", "width=420,height=700");
    if(!w){ alert("Tu navegador bloqueó la ventana emergente."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.document.title = title || "Ticket";
    w.focus();
    w.print();
  }

  function buildTicketHtmlFromSale(sale){
    const html = (typeof dpBuildTicketHtmlDocument === "function")
      ? dpBuildTicketHtmlDocument(sale, `Ticket ${sale.id}`)
      : `<!DOCTYPE html><html><body>Ticket</body></html>`;
    const markup = (typeof dpBuildTicketMarkupFromSale === "function")
      ? dpBuildTicketMarkupFromSale(sale)
      : `<div class="ticket">Ticket ${escapeHtml(sale?.id||"")}</div>`;
    return { pre: markup, html, title: sale.id };
  }

  function withinRange(atISO, from, to){
    if(!from && !to) return true;
    const d = (window.dpParseAtLocal ? window.dpParseAtLocal(atISO) : new Date(atISO));
    if(!d || isNaN(d.getTime())) return true;
    if(from){
      const f = window.dpParseYMDLocal ? window.dpParseYMDLocal(from) : new Date(from+"T00:00:00");
      if(f && d < f) return false;
    }
    if(to){
      const t = window.dpParseYMDLocal ? window.dpParseYMDLocal(to) : new Date(to+"T00:00:00");
      if(t){
      t.setHours(23,59,59,999);
      if(d > t) return false;
    }
    }
    return true;
  }

  function matchesQuery(sale, q){
    if(!q) return true;
    const st = state();
    const client = getClientName(sale.clientId).toLowerCase();
    const id = (sale.id||"").toLowerCase();
    const type = (sale.type||"").toLowerCase();
    const note = (sale.note||"").toLowerCase();
    const itemsText = (sale.items||[]).map(it => {
      const n = (sale.type==="venta") ? getProductName(it.productId) : (it.name||"");
      return String(n||"") + " " + String(it.productId||"");
    }).join(" ").toLowerCase();

    return id.includes(q) || client.includes(q) || type.includes(q) || note.includes(q) || itemsText.includes(q);
  }

  function renderStats(list){
    const total = list.reduce((a,b)=>a+Number(b.total||0),0);
    const ventas = list.filter(s=>s.type==="venta").length;
    const servicios = list.filter(s=>s.type!=="venta").length;
    hStats.innerHTML = `
      <div class="stat"><div class="k">Registros</div><div class="v">${list.length}</div></div>
      <div class="stat"><div class="k">Ventas</div><div class="v">${ventas}</div></div>
      <div class="stat"><div class="k">Servicios/Membresías</div><div class="v">${servicios}</div></div>
      <div class="stat"><div class="k">Total</div><div class="v">${fmtMoney(total)}</div></div>
    `;
  }

  function setTicketFromSale(sale){
    const t = buildTicketHtmlFromSale(sale);
    hTicketTitle.textContent = "Ticket " + sale.id;
    hTicketPreview.innerHTML = t.pre;
    lastTicketHtml = t.html;
    lastTicketTitle = t.title;
    hPrint.disabled = false;
  }

  function clearTicket(){
    hTicketTitle.textContent = "Ticket";
    hTicketPreview.innerHTML = "Selecciona una venta para ver el ticket.";
    lastTicketHtml = "";
    lastTicketTitle = "Ticket";
    hPrint.disabled = true;
  }

  function render(){
    const st = state();
    const q = (hSearch.value||"").trim().toLowerCase();
    const from = hFrom.value || "";
    const to = hTo.value || "";

    let list = (st.sales||[]).slice();

    list = list.filter(s => withinRange(s.at, from, to));
    list = list.filter(s => matchesQuery(s, q));

    renderStats(list);

    hList.innerHTML = "";
    if(!list.length){
      hEmpty.style.display = "block";
      clearTicket();
      return;
    }
    hEmpty.style.display = "none";

    list.slice(0, 500).forEach(sale=>{
      const div = document.createElement("div");
      div.className = "hcard";

      const badgeClass = sale.type==="venta" ? "blue" : "red";
      const titleType = sale.type==="venta" ? "Venta" : "Servicio";
      const client = getClientName(sale.clientId);
      const when = (sale.at||"").replace("T"," ").slice(0,19);

      // summary line
      const summary = sale.type==="venta"
        ? (sale.items||[]).slice(0,2).map(it=>`${getProductName(it.productId)} x${it.qty}`).join(" | ")
        : ((sale.items||[])[0]?.name || "Servicio");

      // membership extra
      let memExtra = "";
      if(sale.meta && sale.meta.kind==="membership"){
        const sd = sale.meta.startDate ? `Inicio: ${sale.meta.startDate}` : "";
        const ed = sale.meta.endDate ? `Fin: ${sale.meta.endDate}` : "";
        memExtra = [sd, ed].filter(Boolean).join(" | ");
      }

      div.innerHTML = `
        <div class="hleft">
          <div class="htitle">
            <span class="badge ${badgeClass}">${titleType}</span>
            <span>${sale.id}</span>
            <span class="badge">${fmtMoney(sale.total||0)}</span>
          </div>
          <div class="hsub">
            <span class="badge">Fecha: ${when}</span>
            <span class="badge">Cliente: ${escapeHtml(client)}</span>
            <span class="badge">${escapeHtml(summary)}</span>
            ${memExtra ? `<span class="badge">${escapeHtml(memExtra)}</span>` : ""}
          </div>
        </div>
        <div class="hactions"></div>
      `;

      const actions = div.querySelector(".hactions");

      const view = document.createElement("button");
      view.className = "btn btn--ghost";
      view.textContent = "Ver ticket";
      view.onclick = ()=> setTicketFromSale(sale);

      const print = document.createElement("button");
      print.className = "btn btn--ghost";
      print.textContent = "Imprimir ticket";
      print.onclick = ()=>{
        const t = buildTicketHtmlFromSale(sale);
        openPrintWindow(t.html, t.title);
      };

      const del = document.createElement("button");
      del.className = "btn";
      del.textContent = "Borrar";
      del.onclick = ()=>{
        const warn = sale.type==="venta"
          ? "Se borrará la venta y el inventario regresará las piezas."
          : (sale.meta && sale.meta.kind==="membership"
              ? "Se borrará el cobro y también la membresía ligada."
              : "Se borrará el registro.");
        if(!confirm(`${warn}\n\n¿Borrar ${sale.id}?`)) return;
        dpDeleteSale(sale.id);
        render();
      };

      actions.appendChild(view);
      actions.appendChild(print);
      actions.appendChild(del);

      hList.appendChild(div);
    });
  }

  // Events
  hSearch.addEventListener("input", render);
  hFrom.addEventListener("change", render);
  hTo.addEventListener("change", render);
  hClear.addEventListener("click", ()=>{
    hSearch.value = "";
    hFrom.value = "";
    hTo.value = "";
    render();
  });

  hPrint.addEventListener("click", ()=>{
    if(!lastTicketHtml) return;
    openPrintWindow(lastTicketHtml, lastTicketTitle);
  });

  // Init
  if(typeof dpEnsureSeedData === "function"){ try{ dpEnsureSeedData(); }catch(e){} }
  render();
})();
