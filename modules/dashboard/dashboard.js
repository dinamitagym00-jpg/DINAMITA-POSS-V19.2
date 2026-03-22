/* Dashboard - Dinamita POS v0 */
(function(){
  const $ = (sel)=>document.querySelector(sel);

  const LS_RANGE_KEY = "dp_dash_range_v1";

  function money(n){
    const v = Number(n||0);
    return v.toLocaleString("es-MX",{ style:"currency", currency:"MXN" });
  }
  const PALETTE = [
    "rgba(185, 28, 28, 0.85)",
    "rgba(220, 38, 38, 0.75)",
    "rgba(244, 63, 94, 0.70)",
    "rgba(234, 88, 12, 0.70)",
    "rgba(245, 158, 11, 0.70)",
    "rgba(34, 197, 94, 0.70)",
    "rgba(59, 130, 246, 0.70)",
    "rgba(168, 85, 247, 0.70)",
  ];

  function ymd(d){
    if(window.dpYMDLocal) return window.dpYMDLocal(d);
    const pad=n=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function parseISODate(dateStr){
    // dateStr: YYYY-MM-DD or full ISO
    if(!dateStr) return null;
    if(dateStr.length>=10){
      const s = dateStr.slice(0,10);
      const [y,m,dd] = s.split("-").map(Number);
      return new Date(y, (m||1)-1, dd||1);
    }
    return null;
  }
  function daysBetween(a,b){
    const ms = 24*60*60*1000;
    return Math.floor((b - a)/ms);
  }

  function getStateSafe(){
    try{ return dpGetState(); }catch(e){ console.warn(e); return null; }
  }

  function rangeDays(n){
    const out=[];
    const now=new Date();
    for(let i=n-1;i>=0;i--){
      const d=new Date(now);
      d.setDate(d.getDate()-i);
      out.push(ymd(d));
    }
    return out;
  }

  function clampRangeDays(fromISO, toISO, maxDays=62){
    // evita rangos enormes que vuelvan lento el canvas
    try{
      const a = window.dpParseYMDLocal ? window.dpParseYMDLocal(fromISO) : new Date(fromISO+"T00:00:00");
      const b = window.dpParseYMDLocal ? window.dpParseYMDLocal(toISO) : new Date(toISO+"T00:00:00");
      if(!a || !b) return { fromISO, toISO };
      const days = Math.abs(daysBetween(a,b)) + 1;
      if(days <= maxDays) return { fromISO, toISO };
      const c = new Date(b);
      c.setDate(c.getDate()-(maxDays-1));
      return { fromISO: ymd(c), toISO };
    }catch(e){ return { fromISO, toISO }; }
  }

  function isoToday(){
    return window.dpYMDLocal ? window.dpYMDLocal(new Date()) : ymd(new Date());
  }

  function rangeList(fromISO, toISO){
    const from = window.dpParseYMDLocal ? window.dpParseYMDLocal(fromISO) : new Date(fromISO+"T00:00:00");
    const to0 = window.dpParseYMDLocal ? window.dpParseYMDLocal(toISO) : new Date(toISO+"T00:00:00");
    if(!from || !to0) return [];
    const out=[];
    const d = new Date(from);
    while(d <= to0){
      out.push(ymd(d));
      d.setDate(d.getDate()+1);
      if(out.length>100) break;
    }
    return out;
  }

  function summarizeSales(st, fromISO, toISO){
    const from = fromISO ? (window.dpParseYMDLocal ? window.dpParseYMDLocal(fromISO) : new Date(fromISO+"T00:00:00")) : null;
    const to = toISO ? (window.dpParseYMDLocal ? (()=>{const t=window.dpParseYMDLocal(toISO); if(t) t.setHours(23,59,59,999); return t;})() : new Date(toISO+"T23:59:59")) : null;
    const sales = (st.sales||[]).filter(s=>{
      const at = (window.dpParseAtLocal ? window.dpParseAtLocal(s.at) : new Date(s.at));
      if(from && at<from) return false;
      if(to && at>to) return false;
      return true;
    });

    const totalsByDay = {};
    const payTotals = {};
    const qtyByProduct = {};
    let productsTotal = 0;
    let servicesTotal = 0;

    for(const s of sales){
      const day = (s.at||"").slice(0,10);
      totalsByDay[day] = (totalsByDay[day]||0) + Number(s.total||0);

      const pm = (s.paymentMethod || "efectivo").toLowerCase();
      payTotals[pm] = (payTotals[pm]||0) + Number(s.total||0);

      // items can be product lines or service concept
      for(const it of (s.items||[])){
        const pid = it.productId || "SERV";
        const qty = Number(it.qty||0);
        qtyByProduct[pid] = (qtyByProduct[pid]||0) + qty;

        const lineTotal = Number(it.total ?? (Number(it.qty||0) * Number(it.price||0)) ) || 0;
        if(pid === "SERV") servicesTotal += lineTotal;
        else productsTotal += lineTotal;
      }
    }

    return { sales, totalsByDay, payTotals, qtyByProduct, productsTotal, servicesTotal };
  }

  function summarizeExpenses(st, fromISO, toISO){
    const from = fromISO ? (window.dpParseYMDLocal ? window.dpParseYMDLocal(fromISO) : new Date(fromISO+"T00:00:00")) : null;
    const to = toISO ? (window.dpParseYMDLocal ? (()=>{const t=window.dpParseYMDLocal(toISO); if(t) t.setHours(23,59,59,999); return t;})() : new Date(toISO+"T23:59:59")) : null;
    const rows = (st.expenses||[]).filter(e=>{
      const d = (e.date||"").slice(0,10);
      if(!d) return false;
      const at = window.dpParseYMDLocal ? window.dpParseYMDLocal(d) : new Date(d+"T00:00:00");
      if(from && at<from) return false;
      if(to && at>to) return false;
      return true;
    });
    const byCat = {};
    let total = 0;
    for(const e of rows){
      const cat = (e.category || "otros").toLowerCase();
      const amt = Number(e.amount||0);
      total += amt;
      byCat[cat] = (byCat[cat]||0) + amt;
    }
    return { rows, total, byCat };
  }

  function membershipStats(st){
    const today = new Date();
    const list = (st.memberships||[]).map(m=>{
      const end = parseISODate(m.end);
      const diff = end ? daysBetween(today, end) : 9999;
      let status="active";
      if(diff < 0) status="expired";
      else if(diff <= 5) status="soon";
      return { ...m, _diff: diff, _status: status };
    });

    const active = list.filter(x=>x._status==="active").length;
    const soon = list.filter(x=>x._status==="soon").length;
    const expired = list.filter(x=>x._status==="expired").length;

    const soonList = list
      .filter(x=>x._status!=="expired")
      .sort((a,b)=>a._diff-b._diff)
      .slice(0,8);

    return { active, soon, expired, soonList };
  }

  function lowStock(st, threshold=5){
    const th = Number(threshold||5);
    return (st.products||[]).filter(p => Number(p.stock||0) <= th);
  }

  /* --- Charts (Canvas, simple) --- */
  function clearCanvas(ctx, w, h){
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,w,h);
  }

  function drawBarChart(canvas, labels, values){
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth * devicePixelRatio;
    const h = canvas.height = canvas.getAttribute("height") ? Number(canvas.getAttribute("height")) * devicePixelRatio : 220*devicePixelRatio;
    clearCanvas(ctx,w,h);

    const pad = 28*devicePixelRatio;
    const maxV = Math.max(1, ...values);
    const chartW = w - pad*2;
    const chartH = h - pad*2;

    // axes
    ctx.strokeStyle = "rgba(0,0,0,.12)";
    ctx.lineWidth = 1*devicePixelRatio;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, pad+chartH);
    ctx.lineTo(pad+chartW, pad+chartH);
    ctx.stroke();

    const barW = chartW / values.length;
    for(let i=0;i<values.length;i++){
      const v = values[i];
      const bh = (v/maxV) * (chartH-10*devicePixelRatio);
      const x = pad + i*barW + barW*0.2;
      const y = pad + chartH - bh;
      const bw = barW*0.6;

      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fillRect(x,y,bw,bh);

      // labels (tiny)
      ctx.fillStyle = "rgba(0,0,0,.65)";
      ctx.font = `${11*devicePixelRatio}px ui-sans-serif`;
      const lab = labels[i].slice(5); // MM-DD
      ctx.fillText(lab, x, pad+chartH+16*devicePixelRatio);
    }
  }

  function drawDonut(canvas, entries){
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth * devicePixelRatio;
    const h = canvas.height = (canvas.getAttribute("height") ? Number(canvas.getAttribute("height")) : 220) * devicePixelRatio;
    clearCanvas(ctx,w,h);

    const total = entries.reduce((a,b)=>a+b.value,0) || 1;
    const cx = w/2, cy = h/2;
    const r = Math.min(w,h)*0.32;
    const r2 = r*0.62;

    let ang = -Math.PI/2;
    entries.forEach((e, idx)=>{
      const frac = e.value/total;
      const a2 = ang + frac*2*Math.PI;
      // simple palette using alpha only (no hard-coded different colors)
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.fillStyle = PALETTE[idx % PALETTE.length];
      ctx.arc(cx,cy,r,ang,a2);
      ctx.closePath();
      ctx.fill();
      ang = a2;
    });

    // hole
    ctx.beginPath();
    ctx.fillStyle = "#fff";
    ctx.arc(cx,cy,r2,0,2*Math.PI);
    ctx.fill();

    // total text
    ctx.fillStyle = "rgba(0,0,0,.80)";
    ctx.font = `${14*devicePixelRatio}px ui-sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Total", cx, cy-4*devicePixelRatio);
    ctx.font = `${16*devicePixelRatio}px ui-sans-serif`;
    ctx.fillText(money(total), cx, cy+18*devicePixelRatio);
    ctx.textAlign = "start";
  }

  function renderLegend(el, entries){
    el.innerHTML = "";
    entries.forEach((e, idx)=>{
      const div = document.createElement("div");
      div.className = "dp-legendItem";
      div.innerHTML = `<span class="dp-dot" style="background: rgba(185,28,28,${0.25 + (idx%5)*0.12})"></span>${e.label}: ${money(e.value)}`;
      el.appendChild(div);
    });
  }

  function setPressedPreset(preset){
    document.querySelectorAll('.dp-chip[data-preset]').forEach(b=>{
      const on = b.getAttribute('data-preset') === preset;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function saveRange(range){
    try{ localStorage.setItem(LS_RANGE_KEY, JSON.stringify(range)); }catch(e){}
  }

  function loadRange(){
    try{
      const raw = localStorage.getItem(LS_RANGE_KEY);
      if(!raw) return null;
      const o = JSON.parse(raw);
      if(o && o.from && o.to) return o;
      return null;
    }catch(e){ return null; }
  }

  function applyPreset(preset){
    const today = isoToday();
    const now = new Date();
    let from = today, to = today;
    if(preset === '7d'){
      const days = rangeDays(7);
      from = days[0];
      to = days[days.length-1];
    }else if(preset === '30d'){
      const days = rangeDays(30);
      from = days[0];
      to = days[days.length-1];
    }else if(preset === 'month'){
      const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthTo = new Date(now.getFullYear(), now.getMonth()+1, 0);
      from = ymd(monthFrom);
      to = ymd(monthTo);
    }

    const r = clampRangeDays(from, to);
    const elF = $('#dp-range-from');
    const elT = $('#dp-range-to');
    if(elF) elF.value = r.fromISO;
    if(elT) elT.value = r.toISO;
    setPressedPreset(preset);
    saveRange({ preset, from: r.fromISO, to: r.toISO });
    refresh();
  }

  function getRangeFromUI(){
    const today = isoToday();
    const elF = $('#dp-range-from');
    const elT = $('#dp-range-to');
    let from = (elF && elF.value) ? elF.value : '';
    let to = (elT && elT.value) ? elT.value : '';
    if(!from || !to){
      const saved = loadRange();
      if(saved){ from = saved.from; to = saved.to; setPressedPreset(saved.preset||''); }
    }
    if(!from || !to){
      const d = rangeDays(7);
      from = d[0];
      to = d[d.length-1];
      setPressedPreset('7d');
    }
    // si se invierten, corregimos
    if(from > to){ const tmp=from; from=to; to=tmp; }
    const r = clampRangeDays(from, to);
    if(elF) elF.value = r.fromISO;
    if(elT) elT.value = r.toISO;
    return { from: r.fromISO, to: r.toISO };
  }

  function renderRows(el, rows){
    el.innerHTML = "";
    if(!rows.length){
      el.innerHTML = `<div class="dp-row"><div class="dp-row__l"><div class="dp-row__t">Sin datos</div><div class="dp-row__s">—</div></div><div class="dp-row__r">—</div></div>`;
      return;
    }
    for(const r of rows){
      const row = document.createElement("div");
      row.className = "dp-row";
      row.innerHTML = `
        <div class="dp-row__l">
          <div class="dp-row__t">${r.title}</div>
          <div class="dp-row__s">${r.sub}</div>
        </div>
        <div class="dp-row__r">${r.right}</div>
      `;
      el.appendChild(row);
    }
  }

  function getClientName(st, id){
    const c = (st.clients||[]).find(x=>x.id===id);
    return c ? c.name : "Mostrador";
  }
  function getProductName(st, pid){
    const p = (st.products||[]).find(x=>x.id===pid);
    return p ? p.name : (pid==="SERV" ? "Servicio" : pid);
  }

  function refresh(){
    const st = getStateSafe();
    if(!st) return;

    const todayISO = isoToday();
    const days7 = rangeDays(7);
    const from7 = days7[0];
    const to7 = days7[days7.length-1];

    // month reference (solo referencia rápida)
    const now = new Date();
    const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTo = new Date(now.getFullYear(), now.getMonth()+1, 0);
    const fromM = ymd(monthFrom);
    const toM = ymd(monthTo);

    // rango seleccionado
    const r = getRangeFromUI();
    saveRange({ preset: loadRange()?.preset || '', from: r.from, to: r.to });

    const sumToday = summarizeSales(st, todayISO, todayISO);
    const sum7 = summarizeSales(st, from7, to7);
    const sumM = summarizeSales(st, fromM, toM);
    const sumR = summarizeSales(st, r.from, r.to);
    const expR = summarizeExpenses(st, r.from, r.to);

    // rango anterior (misma duración) para comparación visual
    const daysLen = Math.max(1, rangeList(r.from, r.to).length);
    const toPrev = (window.dpParseYMDLocal ? window.dpParseYMDLocal(r.from) : new Date(r.from+"T00:00:00"));
    if(toPrev) toPrev.setDate(toPrev.getDate()-1);
    const fromPrev = new Date(toPrev);
    fromPrev.setDate(fromPrev.getDate()-(daysLen-1));
    const prevFromISO = ymd(fromPrev);
    const prevToISO = ymd(toPrev);
    const sumPrev = summarizeSales(st, prevFromISO, prevToISO);

    // KPIs
    const totalToday = sumToday.sales.reduce((a,b)=>a+Number(b.total||0),0);
    const total7 = sum7.sales.reduce((a,b)=>a+Number(b.total||0),0);
    const totalM = sumM.sales.reduce((a,b)=>a+Number(b.total||0),0);
    const totalR = sumR.sales.reduce((a,b)=>a+Number(b.total||0),0);
    const net = totalR - Number(expR.total||0);
    const avg = sumR.sales.length ? (totalR / sumR.sales.length) : 0;

    // Estado (barra superior)
    const prevTotal = sumPrev.sales.reduce((a,b)=>a+Number(b.total||0),0);
    const pct = prevTotal ? ((totalR - prevTotal) / prevTotal) : (totalR ? 1 : 0);
    const sb = $("#dp-statusbar");
    const sbText = $("#dp-status-text");
    if(sb && sbText){
      sb.classList.remove("dp-statusbar--ok","dp-statusbar--warn","dp-statusbar--bad");
      if(!sumR.sales.length){
        sb.classList.add("dp-statusbar--warn");
        sbText.textContent = "⚠️ Sin ventas en este rango. Prueba con otro periodo.";
      }else if(net < 0){
        sb.classList.add("dp-statusbar--bad");
        sbText.textContent = `⚠️ Utilidad negativa (${money(net)}). Revisa gastos en el rango.`;
      }else if(pct >= 0.10){
        sb.classList.add("dp-statusbar--ok");
        sbText.textContent = `🔥 Buen ritmo. Ventas +${Math.round(pct*100)}% vs rango anterior.`;
      }else if(pct <= -0.10){
        sb.classList.add("dp-statusbar--warn");
        sbText.textContent = `⚠️ Ventas -${Math.abs(Math.round(pct*100))}% vs rango anterior. Ajusta estrategia.`;
      }else{
        sb.classList.add("dp-statusbar--ok");
        sbText.textContent = "✅ Estable. Mantén constancia y revisa el ticket promedio.";
      }
    }

    // rango label
    const rangeLabel = `${r.from} → ${r.to}`;
    const elRangeLabel = $("#dp-range-label");
    const elRangeHint = $("#dp-range-hint");
    if(elRangeLabel) elRangeLabel.textContent = rangeLabel;
    if(elRangeHint){
      const nDays = rangeList(r.from, r.to).length;
      elRangeHint.textContent = `${nDays} día(s) · ${sumR.sales.length} venta(s)`;
    }

    // KPIs principales
    const elSalesRange = $("#dp-kpi-sales-range");
    if(elSalesRange) elSalesRange.textContent = money(totalR);
    const elSalesRangeHint = $("#dp-kpi-sales-range-hint");
    if(elSalesRangeHint) elSalesRangeHint.textContent = `Rango: ${rangeLabel}`;

    const elExpRange = $("#dp-kpi-exp-range");
    if(elExpRange) elExpRange.textContent = money(expR.total||0);

    const elNet = $("#dp-kpi-net");
    if(elNet) elNet.textContent = money(net);
    const elNetHint = $("#dp-kpi-net-hint");
    if(elNetHint) elNetHint.textContent = net >= 0 ? "Ventas - Gastos" : "(Negativo) Ventas - Gastos";

    const elAvg = $("#dp-kpi-avg");
    if(elAvg) elAvg.textContent = money(avg);
    const elAvgHint = $("#dp-kpi-avg-hint");
    if(elAvgHint) elAvgHint.textContent = sumR.sales.length ? `${sumR.sales.length} ticket(s)` : "Sin ventas";

    const elSplit = $("#dp-kpi-split");
    const elSplitHint = $("#dp-kpi-split-hint");
    if(elSplit){
      elSplit.textContent = `${money(sumR.productsTotal)} / ${money(sumR.servicesTotal)}`;
    }
    if(elSplitHint){
      elSplitHint.textContent = "Productos / Servicios";
    }

    // referencia rápida
    $("#dp-kpi-sales-today").textContent = money(totalToday);
    $("#dp-kpi-sales-today-hint").textContent = `Fecha: ${todayISO}`;
    $("#dp-kpi-sales-7").textContent = money(total7);

    const low = lowStock(st, 5);
    $("#dp-kpi-lowstock").textContent = String(low.length);
    $("#dp-kpi-lowstock-th").textContent = "5";

    // KPI: gasto principal (categoría top)
    const topCat = Object.entries(expR.byCat||{})
      .map(([k,v])=>({ k: (k||'otros').toUpperCase(), v:Number(v||0) }))
      .sort((a,b)=>b.v-a.v)[0];
    const elTopExp = $("#dp-kpi-top-exp");
    const elTopExpLabel = $("#dp-kpi-top-exp-label");
    const elTopExpHint = $("#dp-kpi-top-exp-hint");
    if(elTopExp){ elTopExp.textContent = money(topCat?.v || 0); }
    if(elTopExpLabel){ elTopExpLabel.textContent = topCat ? topCat.k : "Gasto principal"; }
    if(elTopExpHint){
      elTopExpHint.textContent = topCat ? "Categoría top en el rango" : "Sin gastos en el rango";
    }

    // Chart por día (rango)
    const days = rangeList(r.from, r.to);
    const vals = days.map(d => Number(sumR.totalsByDay[d]||0));
    const chartSub = $("#dp-chart-7d-sub");
    if(chartSub) chartSub.textContent = `Total por día (${rangeLabel})`;
    drawBarChart($("#dp-chart-7d"), days, vals);

    // Payment donut + legend (rango)
    const pmEntries = Object.entries(sumR.payTotals)
      .map(([k,v])=>({ label: (k||"efectivo").toUpperCase(), value: Number(v||0) }))
      .sort((a,b)=>b.value-a.value);
    drawDonut($("#dp-chart-pay"), pmEntries.length?pmEntries:[{label:"EFECTIVO", value:0}]);
    renderLegend($("#dp-legend-pay"), pmEntries.length?pmEntries:[{label:"EFECTIVO", value:0}]);
    const paySub = $("#dp-chart-pay-sub");
    if(paySub) paySub.textContent = `Distribución (${rangeLabel})`;

    // Membership stats
    const ms = membershipStats(st);
    $("#dp-m-active").textContent = String(ms.active);
    $("#dp-m-soon").textContent = String(ms.soon);
    $("#dp-m-expired").textContent = String(ms.expired);

    const mRows = ms.soonList.map(m=>{
      const cn = getClientName(st, m.clientId);
      const right = `${m.end}`;
      const sub = `${m.planName || "Membresía"} · Inicia: ${m.start} · ${Math.max(0,m._diff)} día(s)`;
      return { title: cn, sub, right };
    });
    renderRows($("#dp-m-list"), mRows);

    // Top products by qty (exclude SERV)
    const top = Object.entries(sumR.qtyByProduct)
      .filter(([pid])=>pid!=="SERV")
      .map(([pid,qty])=>({ pid, qty:Number(qty||0) }))
      .sort((a,b)=>b.qty-a.qty)
      .slice(0,10);

    const topRows = top.map(t=>{
      const p = (st.products||[]).find(x=>x.id===t.pid);
      const cat = p?.category ? ` · ${p.category}` : "";
      return {
        title: getProductName(st, t.pid),
        sub: `Piezas: ${t.qty}${cat}`,
        right: ""
      };
    });
    renderRows($("#dp-top-products"), topRows);

    const topSub = $("#dp-top-products-sub");
    if(topSub) topSub.textContent = `Rango ${rangeLabel} (por piezas)`;

    // Últimas ventas
    const lastSales = [...(sumR.sales||[])].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).slice(0,8);
    const lsRows = lastSales.map(s=>{
      const cn = getClientName(st, s.clientId);
      const pm = (s.paymentMethod||'efectivo').toUpperCase();
      const itemsN = (s.items||[]).reduce((a,it)=>a+Number(it.qty||0),0);
      const sub = `${(s.at||'').slice(0,16)} · ${pm} · ${itemsN} pzs`;
      return { title: cn, sub, right: money(s.total||0) };
    });
    renderRows($("#dp-last-sales"), lsRows);
    const lsSub = $("#dp-last-sales-sub");
    if(lsSub) lsSub.textContent = `Rango ${rangeLabel}`;

    // Gastos por categoría (donut)
    const expEntries = Object.entries(expR.byCat||{})
      .map(([k,v])=>({ label: (k||'otros').toUpperCase(), value: Number(v||0) }))
      .sort((a,b)=>b.value-a.value);
    const expCanvas = $("#dp-chart-exp");
    const expLegend = $("#dp-legend-exp");
    if(expCanvas && expLegend){
      drawDonut(expCanvas, expEntries.length?expEntries:[{label:"OTROS", value:0}]);
      renderLegend(expLegend, expEntries.length?expEntries:[{label:"OTROS", value:0}]);
      const expSub = $("#dp-exp-cat-sub");
      if(expSub) expSub.textContent = `Rango ${rangeLabel}`;
    }
  }

  // init
  const btn = $("#dp-dash-refresh");
  if(btn) btn.addEventListener("click", refresh);

  const btnApply = $("#dp-range-apply");
  if(btnApply) btnApply.addEventListener('click', ()=>{
    const r = getRangeFromUI();
    saveRange({ preset: '', from: r.from, to: r.to });
    setPressedPreset('');
    refresh();
  });

  document.querySelectorAll('.dp-chip[data-preset]').forEach(b=>{
    b.addEventListener('click', ()=> applyPreset(b.getAttribute('data-preset')));
  });

  // Re-render charts on window resize (debounced to avoid loops)
  let _rz;
  window.addEventListener("resize", ()=>{
    clearTimeout(_rz);
    _rz = setTimeout(()=>{ try{ refresh(); }catch(e){ console.warn(e); } }, 120);
  });

  refresh();
})();
