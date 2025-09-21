(function(){'use strict';
  const fmtDate=(d)=>{if(!d) return ''; const x=(d instanceof Date)? d : new Date(d); const y=x.getFullYear(), m=String(x.getMonth()+1).padStart(2,'0'), da=String(x.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`;};
  const todayStr=()=>fmtDate(new Date());
  const addMonths=(d,m)=>{const x=new Date(d); const day=x.getDate(); x.setMonth(x.getMonth()+m); if(x.getDate()!==day) x.setDate(0); return x;};
  const addYears=(d,y)=>{const x=new Date(d); x.setFullYear(x.getFullYear()+y); return x;};
  const daysBetween=(a,b)=>Math.floor((new Date(b)-new Date(a))/(1000*60*60*24));
  const calcEstado=(fin)=>{const h=todayStr(); if(fmtDate(fin)<h) return {k:'vencido',label:'Vencido',cls:'chip'}; if(fmtDate(fin)===h) return {k:'hoy',label:'Vence hoy',cls:'chip'}; return {k:'activo',label:'Activo',cls:'chip'};};

  let db; function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open('streamingCRM',1); r.onupgradeneeded=e=>{const d=e.target.result; if(!d.objectStoreNames.contains('clientes')) d.createObjectStore('clientes',{keyPath:'id',autoIncrement:true}); if(!d.objectStoreNames.contains('movimientos')) d.createObjectStore('movimientos',{keyPath:'id',autoIncrement:true}); if(!d.objectStoreNames.contains('servicios')) d.createObjectStore('servicios',{keyPath:'id',autoIncrement:true});}; r.onsuccess=()=>{db=r.result; res(db)}; r.onerror=()=>rej(r.error);});}
  const tx=(s,m='readonly')=>db.transaction(s,m).objectStore(s);
  const saveCliente=(o)=>new Promise((r,j)=>{const q=tx('clientes','readwrite').put(o); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error);});
  const delCliente=(id)=>new Promise((r,j)=>{const q=tx('clientes','readwrite').delete(id); q.onsuccess=()=>r(true); q.onerror=()=>j(q.error);});
  const allClientes=()=>new Promise((r,j)=>{const q=tx('clientes').getAll(); q.onsuccess=()=>r(q.result||[]); q.onerror=()=>j(q.error);});
  const addMov=(m)=>{m.fecha=m.fecha||new Date().toISOString(); return new Promise((r,j)=>{const q=tx('movimientos','readwrite').add(m); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error);});};
  const allMov=()=>new Promise((r,j)=>{const q=tx('movimientos').getAll(); q.onsuccess=()=>r(q.result||[]); q.onerror=()=>j(q.error);});
  const saveServicio=(s)=>new Promise((r,j)=>{const q=tx('servicios','readwrite').put(s); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error);});
  const allServicios=()=>new Promise((r,j)=>{const q=tx('servicios').getAll(); q.onsuccess=()=>r(q.result||[]); q.onerror=()=>j(q.error);});


async function ensureOneServiceOption(){
  try{
      const rid=await saveCliente(obj);
      try { await addMov({tipo:isNew?'ALTA':'EDICIÓN',cliente:(obj.nombre+' '+obj.apellido).trim(),servicio:obj.servicio,plan:obj.plan,monto:obj.precio, notas:isNew?'Alta de cliente':'Edición de datos'});} catch(mErr){ console.warn('mov add warn', mErr); }
      const idField = document.getElementById('clienteId'); if(idField) idField.value = rid || obj.id || '';
      if (typeof renderClientes==='function') await renderClientes();
      alert('✔ Registro guardado');
    }catch(err){
      console.error('saveCliente error', err);
      alert('❌ No se pudo guardar: ' + (err && err.message ? err.message : err));
    }
  });

  if(document.getElementById('btnNuevo')) document.getElementById('btnNuevo').addEventListener('click',()=>{ $('#formCliente').reset(); $('#clienteId').value=''; $('#inicio').value=todayStr(); $('#fin').value=todayStr(); });
  if(document.getElementById('btnEliminar')) document.getElementById('btnEliminar').addEventListener('click', async()=>{ const id=Number($('#clienteId').value); if(!id) return; if(confirm('¿Eliminar?')){ await delCliente(id); await addMov({tipo:'BAJA',cliente:'',servicio:'',plan:'',monto:0,notas:`Eliminado ID ${id}`}); await renderClientes(); }});
  if(document.getElementById('btnRenovar')) document.getElementById('btnRenovar').addEventListener('click', async()=>{ const id=Number($('#clienteId').value); if(!id) return alert('Selecciona un cliente'); const data=await allClientes(); const c=data.find(x=>x.id===id); if(!c) return; const base=new Date(c.fin||c.inicio||new Date()); const nf=(c.plan==='anual')? addYears(base,1) : addMonths(base,1); c.fin=fmtDate(nf); const np=prompt('Nuevo precio ARS (vacío para mantener):', c.precio!=null? String(c.precio):''); if(np!==null && np.trim()!==''){const n=Number(np); if(!Number.isNaN(n)) c.precio=n;} await saveCliente(c); await addMov({tipo:'RENOVACIÓN',cliente:c.nombre+' '+c.apellido,servicio:c.servicio,plan:c.plan,monto:c.precio,notas:`Nuevo fin: ${c.fin}`}); await renderClientes(); });

  function copyText(el){ if(!el) return; el.select(); el.setSelectionRange(0,99999); document.execCommand('copy'); }
  if(document.getElementById('copyUsuario')) document.getElementById('copyUsuario').addEventListener('click',()=>{ copyText(document.getElementById('usuarioPlataforma')); alert('Usuario copiado'); });
  if(document.getElementById('copyPassVisible')) document.getElementById('copyPassVisible').addEventListener('click',()=>{ copyText(document.getElementById('contrasenaVisible')); alert('Contraseña copiada'); });

  async function renderMovimientos(){ const tb=document.querySelector('#tablaMov tbody'); const data=await allMov(); tb.innerHTML=''; data.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)); for(const m of data){ const tr=document.createElement('tr'); tr.innerHTML=`<td>${m.fecha}</td><td>${m.tipo}</td><td>${m.cliente}</td><td>${m.servicio}</td><td>${m.plan}</td><td>${m.monto}</td><td>${m.notas||''}</td>`; tb.appendChild(tr);} }

  
async function clearDatabase(){
  try{
    const name = 'streamingCRM';
    const req = indexedDB.deleteDatabase(name);
    await new Promise((res,rej)=>{ req.onsuccess=()=>res(true); req.onerror=()=>rej(req.error); req.onblocked=()=>rej(new Error('DB bloqueada')); });
    alert('Base borrada correctamente. Recargá la página.');
  }catch(e){
    console.error('clearDatabase error', e);
    alert('No se pudo borrar la base: '+ (e&&e.message? e.message: e));
  }
}
document.addEventListener('click', (ev)=>{
  if(ev.target && ev.target.id==='btnClearDB'){ ev.preventDefault(); if(confirm('Esto borrará todos los datos locales. ¿Continuar?')) clearDatabase(); }
});


(async function init(){
  try{
    await openDB();
  }catch(e){
    console.error('DB open error', e);
    alert('Error inicializando base de datos. Intenta recargar la página.');
    return;
  }
  // Semillas y selects
  try{
    if (typeof ensureDefaultServices === 'function') await ensureDefaultServices();
    if (document.getElementById('inicio')) document.getElementById('inicio').value = (typeof todayStr==='function')? todayStr() : '';
    if (document.getElementById('fin')) document.getElementById('fin').value = (typeof todayStr==='function')? todayStr() : '';
    if (typeof refreshServiciosSelect === 'function') await refreshServiciosSelect();
  }catch(e){ console.warn('Init seeds warning', e); }
  try{
    if (typeof populateFiltroServicios === 'function') await populateFiltroServicios();
    if (typeof populateMovServicios === 'function') await populateMovServicios();
    if (typeof bindClienteFilters === 'function') bindClienteFilters();
    if (typeof bindMovFilters === 'function') bindMovFilters();
  }catch(e){ console.warn('Bind filters warning', e); }
  try{
    if (typeof renderClientes === 'function') await renderClientes();
    if (typeof renderMovimientos === 'function') await renderMovimientos();
    if (typeof renderCalendario === 'function') renderCalendario();
  }catch(e){ console.warn('First render warning', e); }
})();

})();