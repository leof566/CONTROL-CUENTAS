(function(){
  'use strict';

  // Helpers fecha
  const fmtDate = (d)=>{ if(!d) return ''; const dt = (d instanceof Date)? d : new Date(d); const y=dt.getFullYear(); const m=String(dt.getMonth()+1).padStart(2,'0'); const da=String(dt.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; };
  const todayStr = ()=> fmtDate(new Date());
  const addMonths = (date, m)=>{ const d=new Date(date); const day=d.getDate(); d.setMonth(d.getMonth()+m); if(d.getDate()!==day) d.setDate(0); return d; };
  const addYears = (date, y)=>{ const d=new Date(date); d.setFullYear(d.getFullYear()+y); return d; };
  const daysBetween = (a,b)=> Math.floor((new Date(b)-new Date(a))/(1000*60*60*24));

  function calcEstado(fin){
    const hoy = todayStr();
    if(fmtDate(fin) < hoy) return {k:'vencido', label:'Vencido', cls:'st-bad'};
    if(fmtDate(fin) === hoy) return {k:'hoy', label:'Vence hoy', cls:'st-warn'};
    return {k:'activo', label:'Activo', cls:'st-ok'};
  }

  // IndexedDB
  const dbName='streamingCRM', dbVersion=1; let db;
  function openDB(){
    return new Promise((res,rej)=>{
      const rq = indexedDB.open(dbName, dbVersion);
      rq.onupgradeneeded = (e)=>{
        const d=e.target.result;
        if(!d.objectStoreNames.contains('clientes')){
          const s = d.createObjectStore('clientes',{keyPath:'id', autoIncrement:true});
          s.createIndex('by_name','nombre',{unique:false});
          s.createIndex('by_email','email',{unique:false});
        }
        if(!d.objectStoreNames.contains('movimientos')) d.createObjectStore('movimientos',{keyPath:'id',autoIncrement:true});
        if(!d.objectStoreNames.contains('servicios')) d.createObjectStore('servicios',{keyPath:'id',autoIncrement:true});
        if(!d.objectStoreNames.contains('settings')) d.createObjectStore('settings',{keyPath:'key'});
      };
      rq.onsuccess=()=>{ db=rq.result; res(db); };
      rq.onerror=()=>rej(rq.error);
    });
  }
  const tx=(store,mode='readonly')=> db.transaction(store,mode).objectStore(store);
  const setSetting=(key,value)=> new Promise((r,j)=>{ const q=tx('settings','readwrite').put({key,value}); q.onsuccess=()=>r(true); q.onerror=()=>j(q.error); });
  const getSetting=(key)=> new Promise((r,j)=>{ const q=tx('settings').get(key); q.onsuccess=()=>r(q.result?.value); q.onerror=()=>j(q.error); });

  // Crypto (clave maestra)
  async function deriveKey(password, salt){
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2', salt: enc.encode(salt), iterations:120000, hash:'SHA-256'}, baseKey, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
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
    const iv = data.slice(0,12), ct = data.slice(12);
    const key = await deriveKey(password, salt);
    const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct);
    return new TextDecoder().decode(plain);
  }

  // Stores helpers
  const saveCliente=(o)=> new Promise((r,j)=>{ const q=tx('clientes','readwrite').put(o); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
  const delCliente=(id)=> new Promise((r,j)=>{ const q=tx('clientes','readwrite').delete(id); q.onsuccess=()=>r(true); q.onerror=()=>j(q.error); });
  const allClientes=()=> new Promise((r,j)=>{ const q=tx('clientes').getAll(); q.onsuccess=()=>r(q.result||[]); q.onerror=()=>j(q.error); });
  const addMov=(m)=>{ m.fecha=m.fecha||new Date().toISOString(); return new Promise((r,j)=>{ const q=tx('movimientos','readwrite').add(m); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); }); };
  const allMov=()=> new Promise((r,j)=>{ const q=tx('movimientos').getAll(); q.onsuccess=()=>r(q.result||[]); q.onerror=()=>j(q.error); });
  const saveServicio=(s)=> new Promise((r,j)=>{ const q=tx('servicios','readwrite').put(s); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
  const delServicio=(id)=> new Promise((r,j)=>{ const q=tx('servicios','readwrite').delete(id); q.onsuccess=()=>r(true); q.onerror=()=>j(q.error); });
  const allServicios=()=> new Promise((r,j)=>{ const q=tx('servicios').getAll(); q.onsuccess=()=>r(q.result||[]); q.onerror=()=>j(q.error); });

  const DEFAULT_SERVICES=[
    {id:1,nombre:'CANVA',grupo:'Software',mensual:0,anual:0,color:'#8ab4f8'},
    {id:2,nombre:'CAPCUT',grupo:'Software',mensual:0,anual:0,color:'#a1c181'},
    {id:3,nombre:'NETFLIX',grupo:'Streaming',mensual:0,anual:0,color:'#e50914'},
    {id:4,nombre:'YOUTUBE PREMIUM',grupo:'Streaming',mensual:0,anual:0,color:'#fbbc04'},
    {id:5,nombre:'DISNEY',grupo:'Streaming',mensual:0,anual:0,color:'#1e90ff'},
    {id:6,nombre:'MAX',grupo:'Streaming',mensual:0,anual:0,color:'#6a5acd'},
    {id:7,nombre:'CRUNCHYROLL',grupo:'Anime',mensual:0,anual:0,color:'#ff9933'},
    {id:8,nombre:'PARAMOUNT',grupo:'Streaming',mensual:0,anual:0,color:'#00a3ff'},
    {id:9,nombre:'APPLE TV',grupo:'Streaming',mensual:0,anual:0,color:'#a9a9a9'},
    {id:10,nombre:'VIX',grupo:'Streaming',mensual:0,anual:0,color:'#22b8cf'},
    {id:11,nombre:'PRIME',grupo:'Streaming',mensual:0,anual:0,color:'#00a8e1'},
    {id:12,nombre:'CHATGPT',grupo:'IA',mensual:0,anual:0,color:'#6ee7b7'},
    {id:13,nombre:'SPOTIFY',grupo:'Música',mensual:0,anual:0,color:'#1db954'}
  ];

  const $=(q)=>document.querySelector(q); const $$=(q)=>[...document.querySelectorAll(q)];

  // Tabs
  $$('#tabs button').forEach(b=>b.addEventListener('click',()=>{
    $$('#tabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const tab=b.dataset.tab;
    $$('main section').forEach(s=>s.classList.remove('active'));
    $('#'+tab).classList.add('active');
    if(tab==='calendario') renderCalendario();
    if(tab==='movimientos') renderMovimientos();
  }));

  // Servicios select
  async function refreshServiciosSelect(){
    const list=await allServicios();
    const sel=$('#servicio'); sel.innerHTML='';
    list.sort((a,b)=>a.nombre.localeCompare(b.nombre)).forEach(s=>{ const o=document.createElement('option'); o.value=s.nombre; o.textContent=s.nombre; sel.appendChild(o); });
  }

  // Poblar filtro servicios
  async function populateFiltroServicios(){
    const sel = $('#filtroServicio'); if(!sel) return;
    const list = await allServicios();
    const current = sel.value || 'todos';
    sel.innerHTML = '<option value="todos">Todos los servicios</option>';
    list.sort((a,b)=>a.nombre.localeCompare(b.nombre)).forEach(s=>{
      const o=document.createElement('option'); o.value=s.nombre; o.textContent=s.nombre; sel.appendChild(o);
    });
    sel.value=current;
  }

  // Render clientes
  async function renderClientes(){
    const q = filtros.clientes.q;
    const filtro = filtros.clientes.est;
    const periodo = filtros.clientes.periodo;
    const filtroNom = filtros.clientes.nom;
    const filtroSvc = filtros.clientes.svc;

    const data=await allClientes();
    const tb=$('#tablaClientes tbody'); tb.innerHTML='';
    const hoy=todayStr();

    let filtered=data.filter(c=>{
      const texto=(c.nombre+' '+c.apellido+' '+c.email+' '+c.servicio).toLowerCase();
      const okQ=!q || texto.includes(q);
      const okNom=!filtroNom || ( (c.nombre+' '+c.apellido).toLowerCase().includes(filtroNom) );
      const est=calcEstado(c.fin).k; let okF=true;
      if(filtro==='activos') okF=(est==='activo');
      if(filtro==='vencidos') okF=(est==='vencido');
      if(filtro==='hoy') okF=(est==='hoy');
      const okSvc=(filtroSvc==='todos') || (c.servicio===filtroSvc);
      return okQ && okNom && okF && okSvc;
    });

    if(periodo==='semanal'){
      const d0=new Date(hoy); const d7=new Date(hoy); d7.setDate(d7.getDate()+7);
      filtered = filtered.filter(c=>{ const f=new Date(c.fin); return (f>=d0 && f<=d7) || fmtDate(f)===hoy || fmtDate(f)<hoy; });
    }

    filtered.sort((a,b)=> new Date(a.fin)-new Date(b.fin));

    for(const c of filtered){
      const est=calcEstado(c.fin);
      const dias = daysBetween(new Date(), new Date(c.fin));
      const diasStr = (fmtDate(c.fin)===hoy) ? '0' : (dias>0? dias : `-${Math.abs(dias)}`);
      const tr=document.createElement('tr');
      const rango=`${fmtDate(c.inicio)} → ${fmtDate(c.fin)}`;
      tr.innerHTML=`
        <td><strong>${c.nombre} ${c.apellido}</strong><div class="small muted mono">${c.usuarioPlataforma||''}</div><div class="small muted">${c.notas?('📝 '+c.notas):''}</div></td>
        <td>${c.email}</td>
        <td>${c.servicio} <span class="chip">${c.plan}</span></td>
        <td>${rango}</td>
        <td class="mono">${diasStr}</td>
        <td>$ ${Number(c.precio||0).toFixed(2)}</td>
        <td><span class="chip ${est.cls}">${est.label}</span></td>`;
      tr.addEventListener('click',()=> loadClienteToForm(c));
      tb.appendChild(tr);
    }
  }

  function loadClienteToForm(c){
    $('#clienteId').value=c.id||'';
    $('#nombre').value=c.nombre||'';
    $('#apellido').value=c.apellido||'';
    $('#email').value=c.email||'';
    $('#servicio').value=c.servicio||'';
    $('#plan').value=c.plan||'mensual';
    $('#precio').value=c.precio||0;
    $('#estado').value=c.estado||'activo';
    $('#usuarioPlataforma').value=c.usuarioPlataforma||'';
    $('#inicio').value=fmtDate(c.inicio);
    $('#fin').value=fmtDate(c.fin);
    $('#contrasenaVisible').value=c.passPlain||'';
    $('#notas').value=c.notas||'';
    showDecryptedPassword(c);
  }

  async function showDecryptedPassword(c){
    const master=await getSetting('master');
    if(c.passEnc && master){
      try{ const plain=await decryptText(c.passEnc, master); $('#contrasena').value=plain; }catch{ $('#contrasena').value=''; }
    } else { $('#contrasena').value=''; }
  }

  // Guardar cliente
  $('#formCliente').addEventListener('submit', async (e)=>{
    // Validaciones y guardado con feedback
    e.preventDefault();
    const id=Number($('#clienteId').value)||undefined;
    const inicio=$('#inicio').value, fin=$('#fin').value;
    // completar servicio si vacío
    if(!$('#servicio').value){ const sel=$('#servicio'); if(sel.options.length>0) sel.value=sel.options[0].value; }
    const obj={
      id,
      nombre:$('#nombre').value.trim(),
      apellido:$('#apellido').value.trim(),
      email:$('#email').value.trim(),
      servicio:$('#servicio').value,
      plan:$('#plan').value,
      precio:Number($('#precio').value||0),
      estado:$('#estado').value,
      usuarioPlataforma:$('#usuarioPlataforma').value.trim(),
      notas:$('#notas').value.trim(),
      inicio, fin
    };
    const pass=$('#contrasena').value;
    const master=await getSetting('master');
    if(pass){ obj.passEnc = master ? await encryptText(pass, master) : btoa(pass); } else { obj.passEnc=''; }
    obj.passPlain = $('#contrasenaVisible').value.trim();

    const isNew = !id;
    try{
      const rid = await saveCliente(obj);
      await addMov({tipo:isNew?'ALTA':'EDICIÓN', cliente:obj.nombre+' '+obj.apellido, servicio:obj.servicio, plan:obj.plan, monto:obj.precio, notas:isNew?'Alta de cliente':'Edición de datos'});
      $('#clienteId').value = rid || id || '';
      await renderClientes(); if($('#calendario').classList.contains('active')) renderCalendario();
      alert('✔ Registro guardado correctamente');
    }catch(err){
      console.error(err); alert('❌ No se pudo guardar. Revisa los campos obligatorios.');
    }
    $('#contrasena').value='';
  });

  $('#btnNuevo').addEventListener('click',()=>{ $('#formCliente').reset(); $('#clienteId').value=''; $('#inicio').value=todayStr(); $('#fin').value=todayStr(); });

  $('#btnEliminar').addEventListener('click', async()=>{
    const id=Number($('#clienteId').value); if(!id) return;
    if(confirm('¿Eliminar este registro?')){ await delCliente(id); await addMov({tipo:'BAJA', cliente:'', servicio:'', plan:'', monto:0, notas:`Eliminado ID ${id}`}); $('#btnNuevo').click(); await renderClientes(); renderCalendario(); }
  });

  $('#btnRenovar').addEventListener('click', async()=>{
    const id=Number($('#clienteId').value); if(!id) return alert('Selecciona un cliente primero.');
    const data=await allClientes(); const c=data.find(x=>x.id===id); if(!c) return;
    const desde=new Date(c.fin || c.inicio || new Date());
    const nuevoFin=(c.plan==='anual') ? addYears(desde,1) : addMonths(desde,1);
    c.fin = fmtDate(nuevoFin);
    const nuevoPrecio = prompt('Nuevo precio ARS (dejar vacío para mantener):', c.precio!=null? String(c.precio):'');
    if(nuevoPrecio!==null && nuevoPrecio.trim()!==''){ const n=Number(nuevoPrecio); if(!Number.isNaN(n)) c.precio=n; }
    await saveCliente(c);
    await addMov({tipo:'RENOVACIÓN', cliente:c.nombre+' '+c.apellido, servicio:c.servicio, plan:c.plan, monto:c.precio, notas:`Nuevo fin: ${c.fin}`});
    loadClienteToForm(c); await renderClientes(); renderCalendario();
  });

  // Filtros / búsqueda






  
  // Estado de filtros global
  const filtros = {
    clientes: { q:'', nom:'', svc:'todos', est:'todos', periodo:'mensual' },
    movs: { q:'', tipo:'todos', svc:'todos', desde:'', hasta:'' }
  };

  // Enlazar filtros Clientes
  const bindClienteFilters = ()=>{
    $('#buscar').addEventListener('input', ()=>{ filtros.clientes.q = $('#buscar').value.trim().toLowerCase(); renderClientes(); });
    $('#filtroNombre').addEventListener('input', ()=>{ filtros.clientes.nom = $('#filtroNombre').value.trim().toLowerCase(); renderClientes(); });
    $('#filtroServicio').addEventListener('change', ()=>{ filtros.clientes.svc = $('#filtroServicio').value; renderClientes(); });
    $('#filtroEstado').addEventListener('change', ()=>{ filtros.clientes.est = $('#filtroEstado').value; renderClientes(); });
    $('#vistaPeriodo').addEventListener('change', ()=>{ filtros.clientes.periodo = $('#vistaPeriodo').value; renderClientes(); });
  };

  // Enlazar filtros Movimientos
  const bindMovFilters = ()=>{
    const el = (id)=> document.getElementById(id);
    el('movBuscar').addEventListener('input', ()=>{ filtros.movs.q = el('movBuscar').value.trim().toLowerCase(); renderMovimientos(); });
    el('movTipo').addEventListener('change', ()=>{ filtros.movs.tipo = el('movTipo').value; renderMovimientos(); });
    el('movDesde').addEventListener('change', ()=>{ filtros.movs.desde = el('movDesde').value; renderMovimientos(); });
    el('movHasta').addEventListener('change', ()=>{ filtros.movs.hasta = el('movHasta').value; renderMovimientos(); });
    el('movServicio').addEventListener('change', ()=>{ filtros.movs.svc = el('movServicio').value; renderMovimientos(); });
  };

  async function populateMovServicios(){
    const sel = document.getElementById('movServicio'); if(!sel) return;
    const list = await allServicios();
    const current = sel.value || 'todos';
    sel.innerHTML = '<option value="todos">Todos los servicios</option>';
    list.sort((a,b)=>a.nombre.localeCompare(b.nombre)).forEach(s=>{
      const o=document.createElement('option'); o.value=s.nombre; o.textContent=s.nombre; sel.appendChild(o);
    });
    sel.value=current;
  }

  // Export helpers
  function exportCSV(rows, filename){
    if(!rows.length){ alert('No hay datos para exportar'); return; }
    const header=Object.keys(rows[0]).join(',');
    const body=rows.map(r=>Object.values(r).map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    const blob=new Blob([header+'\n'+body],{type:'text/csv;charset=utf-8;'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
  }
  function exportXLS(rows, filename){
    if(!rows.length){ alert('No hay datos para exportar'); return; }
    const esc=(s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const keys=Object.keys(rows[0]);
    const cols=keys.map(k=>`<Cell><Data ss:Type="String">${esc(k)}</Data></Cell>`).join('');
    const xmlRows=rows.map(r=>{ const cells=keys.map(k=>`<Cell><Data ss:Type="String">${esc(r[k]??'')}</Data></Cell>`).join(''); return `<Row>${cells}</Row>`; }).join('');
    const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Datos"><Table><Row>${cols}</Row>${xmlRows}</Table></Worksheet></Workbook>`;
    const blob=new Blob([xml],{type:'application/vnd.ms-excel'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
  }
  function exportTableAsPDF(printHtml, filename){
    const w=window.open('','_blank');
    w.document.write(`<html><head><title>${filename}</title><style>body{font-family:Arial}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px;font-size:12px;text-align:left}th{background:#f3f3f3}</style></head><body>${printHtml}</body></html>`);
    w.document.close(); w.focus(); w.print();
  }

  // Export clientes
  // Copiar usuario y contraseña visible
  function copyText(el){ if(!el) return; el.select(); el.setSelectionRange(0, 99999); document.execCommand('copy'); }
  const btnU = document.getElementById('copyUsuario'); if(btnU) btnU.addEventListener('click', ()=>{ copyText(document.getElementById('usuarioPlataforma')); alert('Usuario copiado'); });
  const btnP = document.getElementById('copyPassVisible'); if(btnP) btnP.addEventListener('click', ()=>{ copyText(document.getElementById('contrasenaVisible')); alert('Contraseña visible copiada'); });

  $('#exportCSV').addEventListener('click', async()=>{
    const data=await allClientes();
    const rows=data.map(c=>({
      id:c.id, nombre:c.nombre, apellido:c.apellido, email:c.email, servicio:c.servicio, plan:c.plan, precio:c.precio,
      inicio:fmtDate(c.inicio), fin:fmtDate(c.fin), dias:daysBetween(new Date(), new Date(c.fin)), estado:calcEstado(c.fin).label, notas:c.notas||''
    }));
    exportCSV(rows,'clientes.csv');
  });
  $('#exportXLS').addEventListener('click', async()=>{
    const data=await allClientes();
    const rows=data.map(c=>({
      id:c.id, nombre:c.nombre, apellido:c.apellido, email:c.email, servicio:c.servicio, plan:c.plan, precio:c.precio,
      inicio:fmtDate(c.inicio), fin:fmtDate(c.fin), dias:daysBetween(new Date(), new Date(c.fin)), estado:calcEstado(c.fin).label, notas:c.notas||''
    }));
    exportXLS(rows,'clientes.xls');
  });
  $('#exportPDF').addEventListener('click', async()=>{
    const data=await allClientes();
    let html='<h1>Listado de clientes</h1><table><thead><tr><th>ID</th><th>Cliente</th><th>Email</th><th>Servicio</th><th>Plan</th><th>Precio</th><th>Inicio</th><th>Fin</th><th>Días</th><th>Estado</th><th>Notas</th></tr></thead><tbody>';
    for(const c of data){
      html+=`<tr><td>${c.id}</td><td>${c.nombre} ${c.apellido}</td><td>${c.email}</td><td>${c.servicio}</td><td>${c.plan}</td><td>${c.precio}</td><td>${fmtDate(c.inicio)}</td><td>${fmtDate(c.fin)}</td><td>${daysBetween(new Date(), new Date(c.fin))}</td><td>${calcEstado(c.fin).label}</td><td>${(c.notas||'').replace(/</g,'&lt;')}</td></tr>`;
    }
    html+='</tbody></table>'; exportTableAsPDF(html,'clientes.pdf');
  });

  // Export movimientos
  $('#exportMovCSV').addEventListener('click', async()=>{
    const data=await allMov(); const rows=data.map(m=>({fecha:m.fecha,tipo:m.tipo,cliente:m.cliente,servicio:m.servicio,plan:m.plan,monto:m.monto,notas:m.notas||''}));
    exportCSV(rows,'movimientos.csv');
  });
  $('#exportMovXLS').addEventListener('click', async()=>{
    const data=await allMov(); const rows=data.map(m=>({fecha:m.fecha,tipo:m.tipo,cliente:m.cliente,servicio:m.servicio,plan:m.plan,monto:m.monto,notas:m.notas||''}));
    exportXLS(rows,'movimientos.xls');
  });
  $('#exportMovPDF').addEventListener('click', async()=>{
    const data=await allMov(); let html='<h1>Movimientos</h1><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Cliente</th><th>Servicio</th><th>Plan</th><th>Monto</th><th>Notas</th></tr></thead><tbody>';
    for(const m of data){ html+=`<tr><td>${m.fecha}</td><td>${m.tipo}</td><td>${m.cliente}</td><td>${m.servicio}</td><td>${m.plan}</td><td>${m.monto}</td><td>${(m.notas||'').replace(/</g,'&lt;')}</td></tr>`; }
    html+='</tbody></table>'; exportTableAsPDF(html,'movimientos.pdf');
  });


  async function renderMovimientos(){
    const tb = document.querySelector('#tablaMov tbody'); if(!tb) return;
    const data = await allMov();
    const q = filtros.movs.q;
    const tipo = filtros.movs.tipo;
    const svc = filtros.movs.svc;
    const desde = filtros.movs.desde ? new Date(filtros.movs.desde) : null;
    const hasta = filtros.movs.hasta ? new Date(filtros.movs.hasta) : null;

    let rows = data.filter(m=>{
      const text = (m.cliente+' '+m.servicio+' '+(m.notas||'')).toLowerCase();
      let ok = !q || text.includes(q);
      if(tipo!=='todos') ok = ok && (m.tipo===tipo);
      if(svc!=='todos') ok = ok && (m.servicio===svc);
      if(desde) ok = ok && (new Date(m.fecha) >= desde);
      if(hasta){ const h = new Date(hasta); h.setHours(23,59,59,999); ok = ok && (new Date(m.fecha) <= h); }
      return ok;
    });

    rows.sort((a,b)=> new Date(b.fecha) - new Date(a.fecha));

    tb.innerHTML = '';
    for(const m of rows){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${m.fecha}</td><td>${m.tipo}</td><td>${m.cliente}</td><td>${m.servicio}</td><td>${m.plan}</td><td>${m.monto}</td><td>${(m.notas||'').replace(/</g,'&lt;')}</td>`;
      tb.appendChild(tr);
    }
  }

  // Calendario
  function startOfMonth(d){ const x=new Date(d); x.setDate(1); return x; }
  function endOfMonth(d){ const x=new Date(d); x.setMonth(x.getMonth()+1,0); return x; }
  function dowISO(d){ return (d.getDay()+6)%7; }
  let calRef=new Date();
  function renderCalendario(){
    const grid=$('#gridCal'); const titulo=$('#mesActual'); grid.innerHTML='';
    const mes=calRef.getMonth(); const anio=calRef.getFullYear();
    titulo.textContent=calRef.toLocaleDateString('es-AR',{month:'long',year:'numeric'});
    const ini=startOfMonth(calRef); const fin=endOfMonth(calRef); const startPad=dowISO(ini);
    for(let i=0;i<startPad;i++) grid.appendChild(document.createElement('div'));
    allClientes().then(list=>{
      list.forEach(c=>c._fin=new Date(c.fin));

      for(let day=1; day<=fin.getDate(); day++){
        const d=new Date(anio,mes,day); const box=document.createElement('div'); box.className='day';
        const n=document.createElement('div'); n.className='num'; n.textContent=day; box.appendChild(n);
        const esos=list.filter(c=> c._fin.getFullYear()===anio && c._fin.getMonth()===mes && c._fin.getDate()===day);
        if(esos.length){ const badge=document.createElement('div'); badge.className='chip'; badge.textContent=esos.length+' venc.'; box.appendChild(badge); }
        esos.forEach(c=>{

          const tag=document.createElement('div'); tag.className='tag';
          const estado=calcEstado(c.fin).k;
          if(estado==='hoy') tag.classList.add('st-warn'); else if(estado==='vencido') tag.classList.add('st-bad'); else tag.classList.add('st-ok');
          tag.textContent=`${c.nombre} ${c.apellido} · ${c.servicio}`;
          tag.title=`Plan ${c.plan} · $${c.precio} · ${fmtDate(c.inicio)}→${fmtDate(c.fin)}`;
          tag.addEventListener('click',()=>{
            $$('main section').forEach(s=>s.classList.remove('active')); $('#clientes').classList.add('active');
            $$('#tabs button').forEach(x=>x.classList.remove('active')); $$('#tabs button[data-tab="clientes"]')[0].classList.add('active');
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
    const tb=$('#tablaSvc tbody'); tb.innerHTML='';
    const list=await allServicios();
    list.sort((a,b)=>a.nombre.localeCompare(b.nombre)).forEach(s=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><strong>${s.nombre}</strong></td><td>$ ${Number(s.mensual||0).toFixed(2)}</td><td>$ ${Number(s.anual||0).toFixed(2)}</td><td>${s.grupo||''}</td>`;
      tr.addEventListener('click',()=>{
        $('#servicioId').value=s.id; $('#svcNombre').value=s.nombre; $('#svcGrupo').value=s.grupo||''; $('#svcMensual').value=s.mensual||0; $('#svcAnual').value=s.anual||0; $('#svcColor').value=s.color||'#7cc6fe';
      });
      tb.appendChild(tr);
    });
  }
  async function ensureDefaultServices(){ const current=await allServicios(); if(current.length===0){ for(const s of DEFAULT_SERVICES){ await saveServicio(s); } } }

  $('#formServicio').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const id=Number($('#servicioId').value)||undefined;
    const svc={ id, nombre:$('#svcNombre').value.trim().toUpperCase(), grupo:$('#svcGrupo').value.trim(), mensual:Number($('#svcMensual').value||0), anual:Number($('#svcAnual').value||0), color:$('#svcColor').value };
    await saveServicio(svc); await renderServicios(); await refreshServiciosSelect(); await populateFiltroServicios();
    if(!$('#precio').value && svc.mensual && $('#plan').value==='mensual'){ $('#precio').value=svc.mensual; }
  });
  $('#svcNuevo').addEventListener('click',()=>{ $('#formServicio').reset(); $('#servicioId').value=''; });
  $('#svcEliminar').addEventListener('click', async()=>{ const id=Number($('#servicioId').value); if(!id) return; if(confirm('¿Eliminar este servicio?')){ await delServicio(id); await renderServicios(); await refreshServiciosSelect(); await populateFiltroServicios(); } });

  // Respaldo
  $('#btnBackupJSON').addEventListener('click', async()=>{
    const datos={ clientes:await allClientes(), servicios:await allServicios(), movimientos:await allMov(), settings:{master: await getSetting('master')?true:false} };
    const blob=new Blob([JSON.stringify(datos,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='respaldo_streamingcrm.json'; a.click();
  });
  $('#btnImportar').addEventListener('click', async()=>{
    const f=$('#fileRestore').files[0]; if(!f) return alert('Selecciona un archivo .json');
    const text=await f.text(); const data=JSON.parse(text);
    if(!confirm('Esto importará datos y agregará a tu base local. ¿Continuar?')) return;
    if(Array.isArray(data.servicios)) for(const s of data.servicios) await saveServicio(s);
    if(Array.isArray(data.clientes)) for(const c of data.clientes) await saveCliente(c);
    if(Array.isArray(data.movimientos)) for(const m of data.movimientos) await addMov(m);
    await renderServicios(); await refreshServiciosSelect(); await populateFiltroServicios(); await populateMovServicios(); bindClienteFilters(); bindMovFilters(); await renderClientes(); await renderMovimientos(); renderCalendario();
    alert('Respaldo importado.');
  });

  // Ajustes
  $('#btnSetMaster').addEventListener('click', async()=>{
    const a=$('#masterNew').value.trim(), b=$('#masterConfirm').value.trim();
    if(!a || a!==b) return alert('Las claves no coinciden.');
    await setSetting('master', a); alert('Clave maestra guardada.');
    $('#masterNew').value=''; $('#masterConfirm').value='';
  });

  // Cambios servicio/plan → sugerir precio
  $('#servicio').addEventListener('change', async()=>{
    const list=await allServicios(); const s=list.find(x=>x.nombre===$('#servicio').value); if(!s) return; const plan=$('#plan').value;
    if(plan==='mensual' && s.mensual){ $('#precio').value = s.mensual; }
    if(plan==='anual' && s.anual){ $('#precio').value = s.anual; }
  });
  $('#plan').addEventListener('change', ()=>$('#servicio').dispatchEvent(new Event('change')));

  (async function init(){
    await openDB();
    await ensureDefaultServices();
    $('#inicio').value=todayStr(); $('#fin').value=todayStr();
    await renderServicios(); await refreshServiciosSelect(); await populateFiltroServicios(); await populateMovServicios(); bindClienteFilters(); bindMovFilters(); await renderClientes(); await renderMovimientos(); renderCalendario();
    if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('./service-worker.js'); }catch{} }
  })();
})();