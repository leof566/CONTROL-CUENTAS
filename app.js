(function(){
'use strict';

/* ============================
   Utilidades
=============================*/
const fmtDate = (d) => {
  if (!d) return '';
  const x = (d instanceof Date) ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth()+1).padStart(2,'0');
  const da = String(x.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
};
const todayStr = () => fmtDate(new Date());
const addMonths = (d, m) => {
  const x = new Date(d || new Date());
  const day = x.getDate();
  x.setMonth(x.getMonth() + m);
  // Si el mes siguiente no tiene el mismo día, va al último día válido
  if (x.getDate() !== day) x.setDate(0);
  return x;
};
const addYears = (d, y) => {
  const x = new Date(d || new Date());
  x.setFullYear(x.getFullYear() + y);
  return x;
};
const daysBetween = (a,b) => Math.floor((new Date(b) - new Date(a)) / (1000*60*60*24));
const calcEstado = (fin) => {
  const h = todayStr();
  const f = fmtDate(fin);
  if (f < h) return { k:'vencido', label:'Vencido' };
  if (f === h) return { k:'hoy', label:'Vence hoy' };
  return { k:'activo', label:'Activo' };
};
const $  = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];

/* ============================
   IndexedDB
=============================*/
let db;
function openDB(){
  return new Promise((res, rej) => {
    const r = indexedDB.open('control-cuentas', 2);
    r.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('clientes'))   d.createObjectStore('clientes',   { keyPath:'id', autoIncrement:true });
      if (!d.objectStoreNames.contains('movimientos'))d.createObjectStore('movimientos',{ keyPath:'id', autoIncrement:true });
      if (!d.objectStoreNames.contains('servicios'))  d.createObjectStore('servicios',  { keyPath:'id', autoIncrement:true });
      if (!d.objectStoreNames.contains('settings'))   d.createObjectStore('settings'); // reservado
    };
    r.onsuccess = () => { db = r.result; res(db); };
    r.onerror   = () => rej(r.error);
  });
}
const tx = (store, mode='readonly') => db.transaction(store, mode).objectStore(store);

const saveCliente = (o) => new Promise((r,j) => {
  const q = tx('clientes','readwrite').put(o);
  q.onsuccess = () => r(q.result);
  q.onerror   = () => j(q.error);
});
const delCliente   = (id) => new Promise((r,j)=>{ const q=tx('clientes','readwrite').delete(id); q.onsuccess=()=>r(true); q.onerror=()=>j(q.error); });
const allClientes  = () => new Promise((r,j)=>{ const q=tx('clientes').getAll(); q.onsuccess=()=>r(q.result||[]); q.onerror=()=>j(q.error); });

const addMov = (m) => {
  m.fecha = m.fecha || new Date().toISOString();
  return new Promise((r,j) => {
    const q = tx('movimientos','readwrite').add(m);
    q.onsuccess = () => r(q.result);
    q.onerror   = () => j(q.error);
  });
};
const allMov = () => new Promise((r,j)=>{ const q=tx('movimientos').getAll(); q.onsuccess=()=>r(q.result||[]); q.onerror=()=>j(q.error); });

const saveServicio = (s) => new Promise((r,j)=>{ const q=tx('servicios','readwrite').put(s); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
const allServicios = () => new Promise((r,j)=>{ const q=tx('servicios').getAll(); q.onsuccess=()=>r(q.result||[]); q.onerror=()=>j(q.error); });

/* ============================
   Persistencia (evitar borrado)
=============================*/
async function ensurePersistentStorage(){
  if (navigator.storage && navigator.storage.persist) {
    try { await navigator.storage.persist(); } catch(e) {}
  }
}

/* ============================
   Respaldo automático (opcional)
   Requiere Chrome/Edge escritorio
=============================*/
let backupHandle = null;

async function writeBackupFile(){
  if (!backupHandle) return;
  try{
    const datos = {
      clientes:   await allClientes(),
      servicios:  await allServicios(),
      movimientos:await allMov()
    };
    const writable = await backupHandle.createWritable();
    await writable.write(new Blob([JSON.stringify(datos,null,2)],{type:'application/json'}));
    await writable.close();
    console.log('Auto-backup actualizado');
  }catch(err){
    console.warn('Auto-backup falló:', err);
  }
}
async function configureAutoBackup(){
  if (!window.showSaveFilePicker) {
    alert('Tu navegador no soporta respaldo automático. Usá "Exportar respaldo (.json)".');
    return;
  }
  try{
    backupHandle = await window.showSaveFilePicker({
      suggestedName: 'respaldo_control_cuentas.json',
      types: [{ description:'JSON', accept:{ 'application/json':['.json'] } }]
    });
    await writeBackupFile();
    alert('Listo: cada cambio se guardará automáticamente en ese archivo.');
  }catch(e){
    // Usuario canceló
  }
}

/* ============================
   Tabs
=============================*/
$$('#tabs button').forEach(b=>{
  b.addEventListener('click',()=>{
    $$('#tabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const t = b.dataset.tab;
    $$('main section').forEach(s=>s.classList.remove('active'));
    document.getElementById(t).classList.add('active');
    if (t==='clientes')   renderClientes();
    if (t==='movimientos')renderMovimientos();
    if (t==='calendario') renderCalendario();
  });
});

/* ============================
   Servicios
=============================*/
const DEFAULT_SERVICES = [
  'CANVA','CAPCUT','NETFLIX','YOUTUBE PREMIUM','DISNEY','MAX','CRUNCHYROLL',
  'PARAMOUNT','APPLE TV','VIX','PRIME','CHATGPT','SPOTIFY'
];

async function ensureDefaultServices(){
  const list = await allServicios();
  if (list.length === 0) {
    for (const n of DEFAULT_SERVICES){
      await saveServicio({ nombre:n, grupo:'', mensual:0, anual:0 });
    }
  }
}

async function refreshServiciosSelect(){
  const list = await allServicios();
  const sel = $('#servicio');
  if (!sel) return;
  const prevVal = sel.value;
  sel.innerHTML = '';
  list.sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''))
      .forEach(s=>{
        const o = document.createElement('option');
        o.value = s.nombre;
        o.textContent = s.nombre;
        sel.appendChild(o);
      });
  if (sel.options.length===0){
    const o=document.createElement('option');
    o.value='SIN ASIGNAR'; o.textContent='SIN ASIGNAR';
    sel.appendChild(o);
  }
  if (prevVal && [...sel.options].some(op=>op.value===prevVal)) {
    sel.value = prevVal;
  }
}

/* ============================
   Listado de Clientes (tabla)
=============================*/
async function renderClientes(){
  const data = await allClientes();
  const tb = $('#tablaClientes tbody');
  if (!tb) return;
  tb.innerHTML = '';

  const hoy = todayStr();
  // Ordenar por fecha de fin (más próximo primero)
  data.sort((a,b)=> new Date(a.fin) - new Date(b.fin));

  for (const c of data){
    const est  = calcEstado(c.fin);
    const dias = daysBetween(new Date(), new Date(c.fin));
    const diasStr = (fmtDate(c.fin)===hoy)?'0':(dias>0?dias:(`-${Math.abs(dias)}`));

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="c-name">${c.nombre||''} ${c.apellido||''}</div>
        <div class="c-sub">${c.email||''}</div>
        ${c.usuarioPlataforma?`<div class="c-sub mono">${c.usuarioPlataforma}</div>`:''}
        ${c.notas?`<div class="c-sub">📝 ${c.notas}</div>`:''}
      </td>
      <td>${c.servicio||''}<div class="c-sub">${c.plan||''}</div></td>
      <td class="nowrap">
        <div>${fmtDate(c.inicio)}</div>
        <div>→ ${fmtDate(c.fin)}</div>
        <div class="c-sub">Días: ${diasStr}</div>
      </td>
      <td class="num">$ ${Number(c.precio||0).toFixed(2)}</td>
      <td><span class="status ${est.k}">${est.label}</span></td>
    `;
    tr.addEventListener('click',()=>loadClienteToForm(c));
    tb.appendChild(tr);
  }
}

function loadClienteToForm(c){
  $('#clienteId').value        = (c && typeof c.id==='number' && c.id>0) ? String(c.id) : '';
  $('#nombre').value           = c?.nombre || '';
  $('#apellido').value         = c?.apellido || '';
  $('#email').value            = c?.email || '';
  const sel = $('#servicio');
  const val = c?.servicio || 'SIN ASIGNAR';
  if (sel && ![...sel.options].some(op=>op.value===val)){
    const o = document.createElement('option');
    o.value = val; o.textContent = val;
    sel.appendChild(o);
  }
  $('#servicio').value         = val;
  $('#plan').value             = c?.plan || 'mensual';
  $('#precio').value           = c?.precio || 0;
  $('#estado').value           = c?.estado || 'activo';
  $('#usuarioPlataforma').value= c?.usuarioPlataforma || '';
  $('#contrasenaVisible').value= c?.passPlain || '';
  $('#notas').value            = c?.notas || '';
  $('#inicio').value           = fmtDate(c?.inicio) || todayStr();
  $('#fin').value              = fmtDate(c?.fin)    || fmtDate(addMonths(new Date(),1));
}

/* ============================
   Formulario Clientes
=============================*/
(function attachFormHandlers(){
  const f = $('#formCliente');
  if (!f) return;

  // Guardar con Enter (excepto textarea)
  f.addEventListener('keydown',(e)=>{
    if (e.key==='Enter' && e.target && e.target.tagName!=='TEXTAREA'){
      e.preventDefault();
      f.requestSubmit();
    }
  });

  // Recalcular fin cuando cambia plan o inicio
  function recalcFin(){
    const ini  = $('#inicio').value || todayStr();
    const plan = $('#plan').value   || 'mensual';
    const fin  = (plan==='anual') ? addYears(ini,1) : addMonths(ini,1);
    $('#fin').value = fmtDate(fin);
  }
  $('#plan')  ?.addEventListener('change', recalcFin);
  $('#inicio')?.addEventListener('change', recalcFin);

  // Guardar
  f.addEventListener('submit', async (e)=>{
    e.preventDefault();
    await ensureDefaultServices(); // NO refrescar aquí el select para no perder la selección

    const rawId     = ($('#clienteId').value||'').trim();
    const parsedId  = parseInt(rawId,10);
    const hasValidId= Number.isFinite(parsedId) && parsedId>0;

    const obj = {
      nombre:  ($('#nombre').value||'').trim(),
      apellido:($('#apellido').value||'').trim(),
      email:   ($('#email').value||'').trim(),
      servicio:$('#servicio').value || 'SIN ASIGNAR',
      plan:    $('#plan').value     || 'mensual',
      precio:  Number($('#precio').value||0) || 0,
      estado:  $('#estado').value   || 'activo',
      usuarioPlataforma: ($('#usuarioPlataforma').value||'').trim(),
      passPlain:         ($('#contrasenaVisible').value||'').trim(),
      notas:   ($('#notas').value||'').trim(),
      inicio:  $('#inicio').value   || todayStr(),
      fin:     $('#fin').value      || fmtDate(addMonths(new Date(),1))
    };
    if (hasValidId) obj.id = parsedId; // IMPORTANTE: solo si es entero > 0

    const isNew = !hasValidId;
    try{
      await saveCliente(obj);
      await addMov({
        tipo: isNew ? 'ALTA' : 'EDICIÓN',
        cliente: (obj.nombre+' '+obj.apellido).trim(),
        servicio: obj.servicio,
        plan: obj.plan,
        monto: obj.precio,
        notas: isNew ? 'Alta de cliente' : 'Edición de datos'
      });
      await renderClientes();
      await renderMovimientos();
      await renderCalendario();
      await writeBackupFile();

      // Limpiar para siguiente alta
      f.reset();
      $('#clienteId').value = '';
      $('#plan').value = 'mensual';
      $('#estado').value = 'activo';
      const h = todayStr();
      $('#inicio').value = h;
      $('#fin').value = fmtDate(addMonths(h,1));
    }catch(err){
      console.error('saveCliente error', err);
      alert('❌ No se pudo guardar: ' + (err?.message || err));
    }
  });

  // Nuevo
  $('#btnNuevo')?.addEventListener('click',()=>{
    f.reset();
    $('#clienteId').value = '';
    $('#plan').value = 'mensual';
    $('#estado').value = 'activo';
    const h = todayStr();
    $('#inicio').value = h;
    $('#fin').value = fmtDate(addMonths(h,1));
  });

  // Eliminar
  $('#btnEliminar')?.addEventListener('click', async ()=>{
    const rawId = ($('#clienteId').value||'').trim();
    const id    = parseInt(rawId,10);
    if (!Number.isFinite(id) || id<=0) return alert('Seleccioná un cliente');

    await delCliente(id);
    await addMov({ tipo:'BAJA', cliente:'', servicio:'', plan:'', monto:0, notas:`Eliminado ID ${id}` });
    await renderClientes();
    await renderMovimientos();
    await renderCalendario();
    await writeBackupFile();
    alert('Eliminado');
    $('#btnNuevo')?.click();
  });

  // Renovar
  $('#btnRenovar')?.addEventListener('click', async ()=>{
    const id = parseInt(($('#clienteId').value||'').trim(),10);
    if (!Number.isFinite(id) || id<=0) return alert('Seleccioná un cliente');
    const data = await allClientes();
    const c = data.find(x=>x.id===id);
    if (!c) return;

    const base = new Date(c.fin || c.inicio || new Date());
    c.fin = fmtDate((c.plan==='anual') ? addYears(base,1) : addMonths(base,1));
    const np = prompt('Nuevo precio ARS (vacío = mantener):', String(c.precio ?? ''));
    if (np!==null && np.trim()!==''){
      const n = Number(np);
      if (Number.isFinite(n)) c.precio = n;
    }
    await saveCliente(c);
    await addMov({ tipo:'RENOVACIÓN', cliente:`${c.nombre||''} ${c.apellido||''}`, servicio:c.servicio, plan:c.plan, monto:c.precio, notas:'Renovación' });
    await renderClientes();
    await renderMovimientos();
    await renderCalendario();
    await writeBackupFile();
  });
})();

/* ============================
   Exportaciones (opcional)
=============================*/
function exportCSV(rows, filename){
  if (!rows.length){ alert('Sin datos'); return; }
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const body = rows.map(r=> keys.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([header+'\n'+body], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

$('#exportCSV')?.addEventListener('click', async ()=>{
  const d = await allClientes();
  const rows = d.map(c=>({
    id:c.id,
    cliente:`${c.nombre||''} ${c.apellido||''}`,
    email:c.email,
    servicio:c.servicio,
    plan:c.plan,
    precio:c.precio,
    inicio:fmtDate(c.inicio),
    fin:fmtDate(c.fin),
    dias:daysBetween(new Date(), new Date(c.fin)),
    estado:calcEstado(c.fin).label,
    notas:c.notas||''
  }));
  exportCSV(rows,'clientes.csv');
});

/* ============================
   Movimientos (UI)
=============================*/
async function renderMovimientos(){
  const data = await allMov();
  const tb = $('#tablaMov tbody');
  if (!tb) return;
  tb.innerHTML = '';
  data.sort((a,b)=> new Date(b.fecha) - new Date(a.fecha));
  for (const m of data){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(m.fecha).toLocaleString()}</td>
      <td>${m.tipo}</td>
      <td>${m.cliente||''}</td>
      <td>${m.servicio||''}</td>
      <td>${m.plan||''}</td>
      <td>${m.monto||0}</td>
      <td>${m.notas||''}</td>
    `;
    tb.appendChild(tr);
  }
}

/* ============================
   Calendario
=============================*/
let calRef = new Date();

function monthMatrix(date){
  const y = date.getFullYear(), m = date.getMonth();
  const first = new Date(y,m,1);
  const start = (first.getDay() + 6) % 7; // lunes=0
  const days = new Date(y,m+1,0).getDate();
  const mat = [];
  let row = [];
  for (let i=0;i<start;i++) row.push(null);
  for (let d=1; d<=days; d++){
    row.push(new Date(y,m,d));
    if (row.length===7){ mat.push(row); row=[]; }
  }
  while (row.length<7) row.push(null);
  mat.push(row);
  return mat;
}

async function renderCalendario(){
  const grid  = $('#calGrid');
  const title = $('#calTitulo');
  if (!grid || !title) return;

  grid.innerHTML = '';
  title.textContent = calRef.toLocaleString('es-AR',{month:'long',year:'numeric'});

  const clientes = await allClientes();
  const dueMap = new Map(); // 'YYYY-MM-DD' -> [nombres]
  for (const c of clientes){
    const k = fmtDate(c.fin);
    if (!dueMap.has(k)) dueMap.set(k, []);
    dueMap.get(k).push(`${c.nombre||''} ${c.apellido||''}`.trim());
  }
  const today = fmtDate(new Date());
  for (const wk of monthMatrix(calRef)){
    for (const d of wk){
      const cell = document.createElement('div');
      cell.className = 'calCell';
      if (!d){ grid.appendChild(cell); continue; }
      const ds = fmtDate(d);
      if (dueMap.has(ds)) cell.classList.add('calDue');   // Amarillo
      if (ds === today) cell.classList.add('calToday');   // Borde celeste
      const items = (dueMap.get(ds)||[]).map(n=>`<span class="calTag">${n}</span>`).join('');
      cell.innerHTML = `<div class="calDay">${d.getDate()}</div>${items}`;
      grid.appendChild(cell);
    }
  }
}

$('#prevMes')?.addEventListener('click', ()=>{ calRef = new Date(calRef.getFullYear(), calRef.getMonth()-1, 1); renderCalendario(); });
$('#nextMes')?.addEventListener('click', ()=>{ calRef = new Date(calRef.getFullYear(), calRef.getMonth()+1, 1); renderCalendario(); });

/* ============================
   Respaldo manual / Import / Limpiar DB
=============================*/
$('#btnBackupJSON')?.addEventListener('click', async ()=>{
  const datos = { clientes:await allClientes(), servicios:await allServicios(), movimientos:await allMov() };
  const blob = new Blob([JSON.stringify(datos,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'respaldo_control_cuentas.json';
  a.click();
});

$('#btnImportar')?.addEventListener('click', async ()=>{
  const f = $('#fileRestore')?.files?.[0];
  if (!f) return alert('Seleccioná un .json');
  const text = await f.text();
  const data = JSON.parse(text);
  if (!confirm('Importar respaldo? Esto agregará/actualizará datos.')) return;

  if (Array.isArray(data.servicios))  for (const s of data.servicios)  await saveServicio(s);
  if (Array.isArray(data.clientes))   for (const c of data.clientes)   await saveCliente(c);
  if (Array.isArray(data.movimientos))for (const m of data.movimientos)await addMov(m);

  await refreshServiciosSelect();
  await renderClientes();
  await renderMovimientos();
  await renderCalendario();
  await writeBackupFile();
  alert('Respaldo importado.');
});

$('#btnClearDB')?.addEventListener('click', ()=>{
  indexedDB.deleteDatabase('control-cuentas');
  alert('Base borrada. Recargá la página.');
});

$('#btnConfigAutoBackup')?.addEventListener('click', configureAutoBackup);

/* ============================
   Init
=============================*/
(async function init(){
  try{ await openDB(); }
  catch(e){ console.error('DB open error',e); alert('Error inicializando base'); return; }

  await ensurePersistentStorage();
  await ensureDefaultServices();
  await refreshServiciosSelect();

  // Defaults de formulario
  if ($('#plan'))   $('#plan').value   = 'mensual';
  if ($('#inicio')) $('#inicio').value = todayStr();
  if ($('#fin'))    $('#fin').value    = fmtDate(addMonths(new Date(),1));

  // Primera carga
  await renderClientes();
  await renderMovimientos();
  await renderCalendario();

  // Backup periódico (además del automático por evento)
  setInterval(writeBackupFile, 60000);
})();
})();
