// App principal — Control de Ventas de Plataformas (Offline)
// Autor: Leonardo Díaz (con ayuda de ChatGPT)
// Almacenamiento: IndexedDB
// Cifrado de contraseñas: WebCrypto AES-GCM con clave derivada (PBKDF2).
// Exportaciones: CSV, Excel compatible (.xls vía SpreadsheetML), PDF (vista de impresión).

(function(){
  'use strict';

  // Utilidades de fecha
  const fmtDate = (d) => {
    if(!d) return '';
    const dt = (d instanceof Date) ? d : new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth()+1).padStart(2,'0');
    const da = String(dt.getDate()).padStart(2,'0');
    return `${y}-${m}-${da}`;
  };
  const todayStr = () => fmtDate(new Date());
  const addMonths = (date, months) => {
    const d = new Date(date);
    const day = d.getDate();
    d.setMonth(d.getMonth()+months);
    if(d.getDate() !== day) d.setDate(0); // ajuste fin de mes
    return d;
  };
  const addYears = (date, years) => {
    const d = new Date(date);
    d.setFullYear(d.getFullYear()+years);
    return d;
  };
  const daysBetween = (a,b) => Math.floor((new Date(b)-new Date(a))/(1000*60*60*24));

  // Estados por color
  function calcEstado(fechaFin){
    const hoy = todayStr();
    if(fmtDate(fechaFin) < hoy) return {k:'vencido', label:'Vencido', cls:'st-bad'};
    if(fmtDate(fechaFin) === hoy) return {k:'hoy', label:'Vence hoy', cls:'st-warn'};
    return {k:'activo', label:'Activo', cls:'st-ok'};
  }

  // IndexedDB wrapper sencillo
  const dbName = 'streamingCRM';
  const dbVersion = 1;
  let db;

  function openDB(){
    return new Promise((resolve,reject)=>{
      const req = indexedDB.open(dbName, dbVersion);
      req.onupgradeneeded = (e)=>{
        const d = e.target.result;
        if(!d.objectStoreNames.contains('clientes')){
          const store = d.createObjectStore('clientes', {keyPath:'id', autoIncrement:true});
          store.createIndex('by_name','nombre',{unique:false});
          store.createIndex('by_email','email',{unique:false});
        }
        if(!d.objectStoreNames.contains('movimientos')){
          d.createObjectStore('movimientos',{keyPath:'id', autoIncrement:true});
        }
        if(!d.objectStoreNames.contains('servicios')){
          d.createObjectStore('servicios',{keyPath:'id', autoIncrement:true});
        }
        if(!d.objectStoreNames.contains('settings')){
          d.createObjectStore('settings',{keyPath:'key'});
        }
      };
      req.onsuccess = ()=>{ db = req.result; resolve(db); };
      req.onerror = ()=>reject(req.error);
    });
  }

  function tx(store, mode='readonly'){ return db.transaction(store, mode).objectStore(store); }

  // Settings (clave maestra)
  async function setSetting(key, value){
    return new Promise((res,rej)=>{
      const r = tx('settings','readwrite').put({key,value});
      r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error);
    });
  }
  async function getSetting(key){
    return new Promise((res,rej)=>{
      const r = tx('settings').get(key);
      r.onsuccess=()=>res(r.result?.value); r.onerror=()=>rej(r.error);
    });
  }

  // Cifrado AES-GCM con PBKDF2
  async function deriveKey(password, salt){
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      {name:'PBKDF2', salt: enc.encode(salt), iterations: 120000, hash:'SHA-256'},
      baseKey,
      {name:'AES-GCM', length:256},
      false,
      ['encrypt','decrypt']
    );
  }
  async function encryptText(plain, password, salt='streamingCRM'){
    if(!plain) return '';
    const key = await deriveKey(password, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const cipher = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, enc.encode(plain));
    const buff = new Uint8Array(iv.byteLength + cipher.byteLength);
    buff.set(iv,0); buff.set(new Uint8Array(cipher), iv.byteLength);
    return btoa(String.fromCharCode(...buff));
  }
  async function decryptText(b64, password, salt='streamingCRM'){
    if(!b64) return '';
    const data = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    const iv = data.slice(0,12);
    const ct = data.slice(12);
    const key = await deriveKey(password, salt);
    const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct);
    return new TextDecoder().decode(plain);
  }

  // CRUD clientes
  async function saveCliente(obj){
    return new Promise((res,rej)=>{
      const r = tx('clientes','readwrite').put(obj);
      r.onsuccess=()=>res(r.result);
      r.onerror=()=>rej(r.error);
    });
  }
  async function delCliente(id){
    return new Promise((res,rej)=>{
      const r = tx('clientes','readwrite').delete(id);
      r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error);
    });
  }
  async function allClientes(){
    return new Promise((res,rej)=>{
      const r = tx('clientes').getAll();
      r.onsuccess=()=>res(r.result || []); r.onerror=()=>rej(r.error);
    });
  }

  // Movimientos
  async function addMov(mov){
    mov.fecha = mov.fecha || new Date().toISOString();
    return new Promise((res,rej)=>{
      const r = tx('movimientos','readwrite').add(mov);
      r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
    });
  }
  async function allMov(){
    return new Promise((res,rej)=>{
      const r = tx('movimientos').getAll();
      r.onsuccess=()=>res(r.result || []); r.onerror=()=>rej(r.error);
    });
  }

  // Servicios
  async function saveServicio(svc){
    return new Promise((res,rej)=>{
      const r = tx('servicios','readwrite').put(svc);
      r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
    });
  }
  async function delServicio(id){
    return new Promise((res,rej)=>{
      const r = tx('servicios','readwrite').delete(id);
      r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error);
    });
  }
  async function allServicios(){
    return new Promise((res,rej)=>{
      const r = tx('servicios').getAll();
      r.onsuccess=()=>res(r.result || []); r.onerror=()=>rej(r.error);
    });
  }

  // Datos iniciales de servicios
  const DEFAULT_SERVICES = [
    {id:1, nombre:'CANVA', grupo:'Software', mensual:0, anual:0, color:'#8ab4f8'},
    {id:2, nombre:'CAPCUT', grupo:'Software', mensual:0, anual:0, color:'#a1c181'},
    {id:3, nombre:'NETFLIX', grupo:'Streaming', mensual:0, anual:0, color:'#e50914'},
    {id:4, nombre:'YOUTUBE PREMIUM', grupo:'Streaming', mensual:0, anual:0, color:'#fbbc04'},
    {id:5, nombre:'DISNEY', grupo:'Streaming', mensual:0, anual:0, color:'#1e90ff'},
    {id:6, nombre:'MAX', grupo:'Streaming', mensual:0, anual:0, color:'#6a5acd'},
    {id:7, nombre:'CRUNCHYROLL', grupo:'Anime', mensual:0, anual:0, color:'#ff9933'},
    {id:8, nombre:'PARAMOUNT', grupo:'Streaming', mensual:0, anual:0, color:'#00a3ff'},
    {id:9, nombre:'APPLE TV', grupo:'Streaming', mensual:0, anual:0, color:'#a9a9a9'},
    {id:10,nombre:'VIX', grupo:'Streaming', mensual:0, anual:0, color:'#22b8cf'},
    {id:11,nombre:'PRIME', grupo:'Streaming', mensual:0, anual:0, color:'#00a8e1'},
    {id:12,nombre:'CHATGPT', grupo:'IA', mensual:0, anual:0, color:'#6ee7b7'},
    {id:13,nombre:'SPOTIFY', grupo:'Música', mensual:0, anual:0, color:'#1db954'}
  ];

  // UI refs
  const $ = (q)=>document.querySelector(q);
  const $$ = (q)=>[...document.querySelectorAll(q)];

  // Tabs
  $$('#tabs button').forEach(b=>b.addEventListener('click',()=>{
    $$('#tabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const tab = b.dataset.tab;
    $$('main section').forEach(s=>s.classList.remove('active'));
    $('#'+tab).classList.add('active');
    if(tab==='calendario') renderCalendario();
  }));

  // Cargar servicios a select
  async function refreshServiciosSelect(){
    const list = await allServicios();
    const sel = $('#servicio');
    sel.innerHTML = '';
    list.sort((a,b)=>a.nombre.localeCompare(b.nombre)).forEach(s=>{
      const opt = document.createElement('option');
      opt.value = s.nombre; opt.textContent = s.nombre; sel.appendChild(opt);
    });
  }

  // Render tabla clientes
  async function renderClientes(){
    const q = $('#buscar').value.trim().toLowerCase();
    const filtro = $('#filtroEstado').value;
    const periodo = $('#vistaPeriodo').value;
    const data = await allClientes();
    const tb = $('#tablaClientes tbody');
    tb.innerHTML = '';
    const hoy = todayStr();
    let filtered = data.filter(c=>{
      const okQ = !q || (c.nombre+' '+c.apellido+' '+c.email+' '+c.servicio).toLowerCase().includes(q);
      let okF = true;
      const est = calcEstado(c.fin).k;
      if(filtro==='activos') okF = (est==='activo');
      if(filtro==='vencidos') okF = (est==='vencido');
      if(filtro==='hoy') okF = (est==='hoy');
      return okQ && okF;
    });

    // Vista semanal: limitar a próximos 7 días o vencidos recientes
    if(periodo==='semanal'){
      const d0 = new Date(hoy);
      const d7 = new Date(hoy); d7.setDate(d7.getDate()+7);
      filtered = filtered.filter(c=>{
        const f = new Date(c.fin);
        return (f>=d0 && f<=d7) || fmtDate(f)===hoy || fmtDate(f)<hoy;
      });
    }

    filtered.sort((a,b)=> new Date(a.fin) - new Date(b.fin));

    for(const c of filtered){
      const est = calcEstado(c.fin);
      const tr = document.createElement('tr');
      const rango = `${fmtDate(c.inicio)} → ${fmtDate(c.fin)}`;
      tr.innerHTML = `
        <td><strong>${c.nombre} ${c.apellido}</strong><div class="small muted mono">${c.usuarioPlataforma||''}</div></td>
        <td>${c.email}</td>
        <td>${c.servicio} <span class="chip">${c.plan}</span></td>
        <td>${rango}</td>
        <td>$ ${Number(c.precio||0).toFixed(2)}</td>
        <td><span class="chip ${est.cls}">${est.label}</span></td>
      `;
      tr.addEventListener('click',()=> loadClienteToForm(c));
      tb.appendChild(tr);
    }
  }

  function loadClienteToForm(c){
    $('#clienteId').value = c.id || '';
    $('#nombre').value = c.nombre || '';
    $('#apellido').value = c.apellido || '';
    $('#email').value = c.email || '';
    $('#servicio').value = c.servicio || '';
    $('#plan').value = c.plan || 'mensual';
    $('#precio').value = c.precio || 0;
    $('#estado').value = c.estado || 'activo';
    $('#usuarioPlataforma').value = c.usuarioPlataforma || '';
    $('#inicio').value = fmtDate(c.inicio);
    $('#fin').value = fmtDate(c.fin);
    // contraseñas se descifran si hay clave
    showDecryptedPassword(c);
  }

  async function showDecryptedPassword(c){
    const master = await getSetting('master');
    if(c.passEnc && master){
      try{
        const plain = await decryptText(c.passEnc, master);
        $('#contrasena').value = plain;
      }catch(e){
        $('#contrasena').value='';
      }
    }else{
      $('#contrasena').value='';
    }
  }

  // Guardar cliente
  $('#formCliente').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const id = Number($('#clienteId').value) || undefined;
    const inicio = $('#inicio').value;
    const fin = $('#fin').value;
    const obj = {
      id,
      nombre: $('#nombre').value.trim(),
      apellido: $('#apellido').value.trim(),
      email: $('#email').value.trim(),
      servicio: $('#servicio').value,
      plan: $('#plan').value,
      precio: Number($('#precio').value||0),
      estado: $('#estado').value,
      usuarioPlataforma: $('#usuarioPlataforma').value.trim(),
      inicio, fin
    };
    const pass = $('#contrasena').value;
    const master = await getSetting('master');
    if(pass){
      obj.passEnc = master ? await encryptText(pass, master) : btoa(pass); // si no hay clave, se guarda en base64 (no seguro)
    }else{
      obj.passEnc = '';
    }
    const isNew = !id;
    const rid = await saveCliente(obj);
    await addMov({
      tipo: isNew? 'ALTA':'EDICIÓN',
      cliente: obj.nombre+' '+obj.apellido,
      servicio: obj.servicio,
      plan: obj.plan,
      monto: obj.precio,
      notas: isNew? 'Alta de cliente':'Edición de datos'
    });
    $('#clienteId').value = rid || id || '';
    await renderClientes();
    if($('#calendario').classList.contains('active')) renderCalendario();
    $('#contrasena').value=''; // no mantener visible
  });

  $('#btnNuevo').addEventListener('click',()=>{
    $('#formCliente').reset();
    $('#clienteId').value='';
    $('#inicio').value = todayStr();
    $('#fin').value = todayStr();
  });

  $('#btnEliminar').addEventListener('click', async ()=>{
    const id = Number($('#clienteId').value);
    if(!id) return;
    if(confirm('¿Eliminar este registro?')){
      await delCliente(id);
      await addMov({tipo:'BAJA', cliente:'', servicio:'', plan:'', monto:0, notas:`Eliminado ID ${id}`});
      $('#btnNuevo').click();
      await renderClientes();
      renderCalendario();
    }
  });

  // Renovar: extiende según plan
  $('#btnRenovar').addEventListener('click', async ()=>{
    const id = Number($('#clienteId').value);
    if(!id) return alert('Selecciona un cliente primero.');
    const data = await allClientes();
    const c = data.find(x=>x.id===id);
    if(!c) return;
    const desde = new Date(c.fin || c.inicio || new Date());
    const nuevoFin = (c.plan==='anual') ? addYears(desde,1) : addMonths(desde,1);
    c.inicio = fmtDate(addMonths(desde,0)); // conserva inicio
    c.fin = fmtDate(nuevoFin);
    await saveCliente(c);
    await addMov({tipo:'RENOVACIÓN', cliente:c.nombre+' '+c.apellido, servicio:c.servicio, plan:c.plan, monto:c.precio, notas:`Nuevo fin: ${c.fin}`});
    loadClienteToForm(c);
    await renderClientes(); renderCalendario();
  });

  // Búsqueda y filtros
  $('#buscar').addEventListener('input', renderClientes);
  $('#filtroEstado').addEventListener('change', renderClientes);
  $('#vistaPeriodo').addEventListener('change', renderClientes);

  // Exportadores
  function exportCSV(rows, filename){
    const header = Object.keys(rows[0]||{}).join(',');
    const body = rows.map(r=>Object.values(r).map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    const csv = header + '\n' + body;
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  function exportXLS(rows, filename){
    // Excel compatible via SpreadsheetML (XML 2003)
    const esc = (s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const keys = Object.keys(rows[0]||{});
    const cols = keys.map(k=>`<Cell><Data ss:Type="String">${esc(k)}</Data></Cell>`).join('');
    const xmlRows = rows.map(r=>{
      const cells = keys.map(k=>`<Cell><Data ss:Type="String">${esc(r[k] ?? '')}</Data></Cell>`).join('');
      return `<Row>${cells}</Row>`;
    }).join('');
    const xml = `<?xml version="1.0"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
      <Worksheet ss:Name="Datos">
        <Table>
          <Row>${cols}</Row>
          ${xmlRows}
        </Table>
      </Worksheet>
    </Workbook>`;
    const blob = new Blob([xml], {type:'application/vnd.ms-excel'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  function exportTableAsPDF(printHtml, filename){
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>${filename}</title>
      <style>
        body{font-family: Arial, sans-serif;}
        h1{font-size:18px}
        table{border-collapse:collapse; width:100%}
        th,td{border:1px solid #ddd; padding:6px; font-size:12px; text-align:left}
        th{background:#f3f3f3}
      </style>
      </head><body>
      ${printHtml}
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  // Export clientes
  $('#exportCSV').addEventListener('click', async ()=>{
    const data = await allClientes();
    const rows = data.map(c=>({
      id:c.id,
      nombre:c.nombre,
      apellido:c.apellido,
      email:c.email,
      servicio:c.servicio,
      plan:c.plan,
      precio:c.precio,
      inicio:fmtDate(c.inicio),
      fin:fmtDate(c.fin),
      estado: calcEstado(c.fin).label
    }));
    exportCSV(rows, 'clientes.csv');
  });
  $('#exportXLS').addEventListener('click', async ()=>{
    const data = await allClientes();
    const rows = data.map(c=>({
      id:c.id,
      nombre:c.nombre,
      apellido:c.apellido,
      email:c.email,
      servicio:c.servicio,
      plan:c.plan,
      precio:c.precio,
      inicio:fmtDate(c.inicio),
      fin:fmtDate(c.fin),
      estado: calcEstado(c.fin).label
    }));
    exportXLS(rows, 'clientes.xls');
  });
  $('#exportPDF').addEventListener('click', async ()=>{
    const data = await allClientes();
    let html = '<h1>Listado de clientes</h1><table><thead><tr><th>ID</th><th>Cliente</th><th>Email</th><th>Servicio</th><th>Plan</th><th>Precio</th><th>Inicio</th><th>Fin</th><th>Estado</th></tr></thead><tbody>';
    for(const c of data){
      html += `<tr><td>${c.id}</td><td>${c.nombre} ${c.apellido}</td><td>${c.email}</td><td>${c.servicio}</td><td>${c.plan}</td><td>${c.precio}</td><td>${fmtDate(c.inicio)}</td><td>${fmtDate(c.fin)}</td><td>${calcEstado(c.fin).label}</td></tr>`;
    }
    html += '</tbody></table>';
    exportTableAsPDF(html,'clientes.pdf');
  });

  // Export movimientos
  $('#exportMovCSV').addEventListener('click', async ()=>{
    const data = await allMov();
    const rows = data.map(m=>({
      fecha: m.fecha,
      tipo: m.tipo,
      cliente: m.cliente,
      servicio: m.servicio,
      plan: m.plan,
      monto: m.monto,
      notas: m.notas || ''
    }));
    exportCSV(rows, 'movimientos.csv');
  });
  $('#exportMovXLS').addEventListener('click', async ()=>{
    const data = await allMov();
    const rows = data.map(m=>({
      fecha: m.fecha,
      tipo: m.tipo,
      cliente: m.cliente,
      servicio: m.servicio,
      plan: m.plan,
      monto: m.monto,
      notas: m.notas || ''
    }));
    exportXLS(rows, 'movimientos.xls');
  });
  $('#exportMovPDF').addEventListener('click', async ()=>{
    const data = await allMov();
    let html = '<h1>Movimientos</h1><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Cliente</th><th>Servicio</th><th>Plan</th><th>Monto</th><th>Notas</th></tr></thead><tbody>';
    for(const m of data){
      html += `<tr><td>${m.fecha}</td><td>${m.tipo}</td><td>${m.cliente}</td><td>${m.servicio}</td><td>${m.plan}</td><td>${m.monto}</td><td>${m.notas||''}</td></tr>`;
    }
    html += '</tbody></table>';
    exportTableAsPDF(html,'movimientos.pdf');
  });

  // Calendario
  function startOfMonth(d){ const x=new Date(d); x.setDate(1); return x; }
  function endOfMonth(d){ const x=new Date(d); x.setMonth(x.getMonth()+1,0); return x; }
  function dowISO(d){ const day=(d.getDay()+6)%7; return day; } // 0 = lunes

  let calRef = new Date();
  function renderCalendario(){
    const grid = $('#gridCal');
    const titulo = $('#mesActual');
    grid.innerHTML='';
    const mes = calRef.getMonth();
    const anio = calRef.getFullYear();
    titulo.textContent = calRef.toLocaleDateString('es-AR',{month:'long', year:'numeric'});
    const ini = startOfMonth(calRef);
    const fin = endOfMonth(calRef);
    const startPad = dowISO(ini);
    for(let i=0;i<startPad;i++) grid.appendChild(document.createElement('div'));
    allClientes().then(list=>{
      list.forEach(c=>c._fin=new Date(c.fin));
      for(let day=1; day<=fin.getDate(); day++){
        const d = new Date(anio, mes, day);
        const box = document.createElement('div'); box.className='day';
        const n = document.createElement('div'); n.className='num'; n.textContent=day;
        box.appendChild(n);
        // clientes que vencen este día
        const esos = list.filter(c=> c._fin.getFullYear()===anio && c._fin.getMonth()===mes && c._fin.getDate()===day);
        esos.forEach(c=>{
          const tag = document.createElement('div'); tag.className='tag warn';
          if(fmtDate(c.fin) < todayStr()) tag.classList.add('bad');
          if(fmtDate(c.fin) > todayStr()) tag.className='tag up';
          tag.textContent = `${c.nombre} ${c.apellido} · ${c.servicio}`;
          tag.title = `Plan ${c.plan} · $${c.precio} · ${fmtDate(c.inicio)}→${fmtDate(c.fin)}`;
          tag.addEventListener('click',()=>{
            // ir a clientes y cargar
            $$('main section').forEach(s=>s.classList.remove('active'));
            $('#clientes').classList.add('active');
            $$('#tabs button').forEach(x=>x.classList.remove('active'));
            $$('#tabs button[data-tab="clientes"]')[0].classList.add('active');
            loadClienteToForm(c);
          });
          box.appendChild(tag);
        });
        grid.appendChild(box);
      }
    });
  }
  $('#prevMes').addEventListener('click',()=>{ calRef.setMonth(calRef.getMonth()-1); renderCalendario(); });
  $('#sigMes').addEventListener('click',()=>{ calRef.setMonth(calRef.getMonth()+1); renderCalendario(); });

  // Servicios UI
  async function renderServicios(){
    await ensureDefaultServices();
    await refreshServiciosSelect();
    const tb = $('#tablaSvc tbody');
    tb.innerHTML = '';
    const list = await allServicios();
    list.sort((a,b)=>a.nombre.localeCompare(b.nombre)).forEach(s=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${s.nombre}</strong></td><td>$ ${Number(s.mensual||0).toFixed(2)}</td><td>$ ${Number(s.anual||0).toFixed(2)}</td><td>${s.grupo||''}</td>`;
      tr.addEventListener('click',()=>{
        $('#servicioId').value = s.id;
        $('#svcNombre').value = s.nombre;
        $('#svcGrupo').value = s.grupo || '';
        $('#svcMensual').value = s.mensual || 0;
        $('#svcAnual').value = s.anual || 0;
        $('#svcColor').value = s.color || '#7cc6fe';
      });
      tb.appendChild(tr);
    });
  }

  async function ensureDefaultServices(){
    const current = await allServicios();
    if(current.length===0){
      for(const s of DEFAULT_SERVICES){ await saveServicio(s); }
    }
  }

  $('#formServicio').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const id = Number($('#servicioId').value) || undefined;
    const svc = {
      id,
      nombre: $('#svcNombre').value.trim().toUpperCase(),
      grupo: $('#svcGrupo').value.trim(),
      mensual: Number($('#svcMensual').value||0),
      anual: Number($('#svcAnual').value||0),
      color: $('#svcColor').value
    };
    await saveServicio(svc);
    await renderServicios();
    await refreshServiciosSelect();
    if(!$('#precio').value && svc.mensual && $('#plan').value==='mensual'){ $('#precio').value = svc.mensual; }
  });
  $('#svcNuevo').addEventListener('click',()=>{
    $('#formServicio').reset();
    $('#servicioId').value='';
  });
  $('#svcEliminar').addEventListener('click', async()=>{
    const id = Number($('#servicioId').value);
    if(!id) return;
    if(confirm('¿Eliminar este servicio?')){
      await delServicio(id);
      await renderServicios();
      await refreshServiciosSelect();
    }
  });

  // Respaldo
  $('#btnBackupJSON').addEventListener('click', async ()=>{
    const datos = {
      clientes: await allClientes(),
      servicios: await allServicios(),
      movimientos: await allMov(),
      settings: { master: await getSetting('master') ? true : false } // no exporta la clave
    };
    const blob = new Blob([JSON.stringify(datos,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'respaldo_streamingcrm.json';
    a.click();
  });

  $('#btnImportar').addEventListener('click', async ()=>{
    const file = $('#fileRestore').files[0];
    if(!file) return alert('Selecciona un archivo .json de respaldo');
    const text = await file.text();
    const data = JSON.parse(text);
    if(!confirm('Esto importará datos del respaldo y agregará a tu base local. ¿Continuar?')) return;
    // Importa por cada store
    if(Array.isArray(data.servicios)){
      for(const s of data.servicios){ await saveServicio(s); }
    }
    if(Array.isArray(data.clientes)){
      for(const c of data.clientes){ await saveCliente(c); }
    }
    if(Array.isArray(data.movimientos)){
      for(const m of data.movimientos){ await addMov(m); }
    }
    await renderServicios(); await renderClientes(); renderCalendario();
    alert('Respaldo importado.');
  });

  // Ajustes: clave maestra
  $('#btnSetMaster').addEventListener('click', async ()=>{
    const a = $('#masterNew').value.trim();
    const b = $('#masterConfirm').value.trim();
    if(!a || a!==b) return alert('Las claves no coinciden.');
    await setSetting('master', a);
    alert('Clave maestra guardada. A partir de ahora, las contraseñas se cifrarán en este dispositivo.');
    $('#masterNew').value=''; $('#masterConfirm').value='';
  });

  // Cargar precios sugeridos al cambiar servicio o plan
  $('#servicio').addEventListener('change', async ()=>{
    const list = await allServicios();
    const s = list.find(x=>x.nombre === $('#servicio').value);
    if(!s) return;
    const plan = $('#plan').value;
    if(plan==='mensual' && s.mensual){ $('#precio').value = s.mensual; }
    if(plan==='anual' && s.anual){ $('#precio').value = s.anual; }
  });
  $('#plan').addEventListener('change', ()=>$('#servicio').dispatchEvent(new Event('change')));

  // Inicialización
  (async function init(){
    await openDB();
    await ensureDefaultServices();
    // UI defaults
    $('#inicio').value = todayStr();
    $('#fin').value = todayStr();
    await renderServicios();
    await refreshServiciosSelect();
    await renderClientes();
    renderCalendario();
    // Registrar service worker (PWA)
    if('serviceWorker' in navigator){
      try{ await navigator.serviceWorker.register('./service-worker.js'); }catch{}
    }
  })();
})();