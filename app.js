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

  const DEFAULT_SERVICES=[{id:1,nombre:'CANVA'},{id:2,nombre:'NETFLIX'},{id:3,nombre:'SPOTIFY'}];
  const $=(q)=>document.querySelector(q), $$=(q)=>[...document.querySelectorAll(q)];

  $$('#tabs button').forEach(b=>b.addEventListener('click',()=>{$$('#tabs button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); const t=b.dataset.tab; $$('main section').forEach(s=>s.style.display='none'); $('#'+t).style.display='block'; if(t==='movimientos') renderMovimientos();}));

  async function ensureDefaultServices(){const cur=await allServicios(); if(cur.length===0){for(const s of DEFAULT_SERVICES) await saveServicio(s);}}
  async function refreshServiciosSelect(){const list=await allServicios(); const sel=$('#servicio'); sel.innerHTML=''; list.forEach(s=>{const o=document.createElement('option'); o.value=s.nombre; o.textContent=s.nombre; sel.appendChild(o);});}

  async function renderClientes(){
    const data=await allClientes(); const tb=$('#tablaClientes tbody'); tb.innerHTML=''; const hoy=todayStr();
    data.sort((a,b)=>new Date(a.fin)-new Date(b.fin));
    for(const c of data){
      const est=calcEstado(c.fin); const dias=daysBetween(new Date(), new Date(c.fin)); const dstr=(fmtDate(c.fin)===hoy)?'0':(dias>0?dias:`-${Math.abs(dias)}`);
      const tr=document.createElement('tr'); const rango=`${fmtDate(c.inicio)} → ${fmtDate(c.fin)}`;
      tr.innerHTML=`<td><strong>${c.nombre||''} ${c.apellido||''}</strong><div class="chip">${c.usuarioPlataforma||''}</div></td><td>${c.email||''}</td><td>${c.servicio||''} <span class="chip">${c.plan||''}</span></td><td>${rango}</td><td>${dstr}</td><td>$ ${Number(c.precio||0).toFixed(2)}</td><td><span class="${est.cls}">${est.label}</span></td>`;
      tr.addEventListener('click',()=>loadClienteToForm(c)); tb.appendChild(tr);
    }
  }

  function loadClienteToForm(c){ $('#clienteId').value=c.id||''; $('#nombre').value=c.nombre||''; $('#apellido').value=c.apellido||''; $('#email').value=c.email||''; $('#servicio').value=c.servicio||''; $('#plan').value=c.plan||'mensual'; $('#precio').value=c.precio||0; $('#estado').value=c.estado||'activo'; $('#usuarioPlataforma').value=c.usuarioPlataforma||''; $('#contrasenaVisible').value=c.passPlain||''; $('#notas').value=c.notas||''; $('#inicio').value=fmtDate(c.inicio)||todayStr(); $('#fin').value=fmtDate(c.fin)||todayStr(); }

  document.getElementById('formCliente').addEventListener('submit', async (e)=>{
    e.preventDefault();
    // Defaults
    if(!$('#servicio').value){const sel=$('#servicio'); if(sel && sel.options.length>0) sel.value=sel.options[0].value;}
    if(!$('#plan').value) $('#plan').value='mensual';
    if(!$('#estado').value) $('#estado').value='activo';
    if(!$('#precio').value) $('#precio').value=0;
    if(!$('#inicio').value) $('#inicio').value=todayStr();
    if(!$('#fin').value) $('#fin').value=todayStr();
    const obj={
      id:Number($('#clienteId').value)||undefined,
      nombre:$('#nombre').value||'',
      apellido:$('#apellido').value||'',
      email:$('#email').value||'',
      servicio:$('#servicio').value||'',
      plan:$('#plan').value||'mensual',
      precio:Number($('#precio').value||0),
      estado:$('#estado').value||'activo',
      usuarioPlataforma:$('#usuarioPlataforma').value||'',
      passPlain:$('#contrasenaVisible').value||'',
      notas:$('#notas').value||'',
      inicio:$('#inicio').value||todayStr(),
      fin:$('#fin').value||todayStr()
    };
    const isNew=!obj.id;
    try{ const rid=await saveCliente(obj); await addMov({tipo:isNew?'ALTA':'EDICIÓN',cliente:(obj.nombre+' '+obj.apellido).trim(),servicio:obj.servicio,plan:obj.plan,monto:obj.precio, notas:isNew?'Alta de cliente':'Edición de datos'}); $('#clienteId').value=rid||obj.id||''; await renderClientes(); alert('✔ Registro guardado'); }catch(e){ console.error(e); alert('❌ No se pudo guardar'); }
  });

  document.getElementById('btnNuevo').addEventListener('click',()=>{ $('#formCliente').reset(); $('#clienteId').value=''; $('#inicio').value=todayStr(); $('#fin').value=todayStr(); });
  document.getElementById('btnEliminar').addEventListener('click', async()=>{ const id=Number($('#clienteId').value); if(!id) return; if(confirm('¿Eliminar?')){ await delCliente(id); await addMov({tipo:'BAJA',cliente:'',servicio:'',plan:'',monto:0,notas:`Eliminado ID ${id}`}); await renderClientes(); }});
  document.getElementById('btnRenovar').addEventListener('click', async()=>{ const id=Number($('#clienteId').value); if(!id) return alert('Selecciona un cliente'); const data=await allClientes(); const c=data.find(x=>x.id===id); if(!c) return; const base=new Date(c.fin||c.inicio||new Date()); const nf=(c.plan==='anual')? addYears(base,1) : addMonths(base,1); c.fin=fmtDate(nf); const np=prompt('Nuevo precio ARS (vacío para mantener):', c.precio!=null? String(c.precio):''); if(np!==null && np.trim()!==''){const n=Number(np); if(!Number.isNaN(n)) c.precio=n;} await saveCliente(c); await addMov({tipo:'RENOVACIÓN',cliente:c.nombre+' '+c.apellido,servicio:c.servicio,plan:c.plan,monto:c.precio,notas:`Nuevo fin: ${c.fin}`}); await renderClientes(); });

  function copyText(el){ if(!el) return; el.select(); el.setSelectionRange(0,99999); document.execCommand('copy'); }
  document.getElementById('copyUsuario').addEventListener('click',()=>{ copyText(document.getElementById('usuarioPlataforma')); alert('Usuario copiado'); });
  document.getElementById('copyPassVisible').addEventListener('click',()=>{ copyText(document.getElementById('contrasenaVisible')); alert('Contraseña copiada'); });

  async function renderMovimientos(){ const tb=document.querySelector('#tablaMov tbody'); const data=await allMov(); tb.innerHTML=''; data.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)); for(const m of data){ const tr=document.createElement('tr'); tr.innerHTML=`<td>${m.fecha}</td><td>${m.tipo}</td><td>${m.cliente}</td><td>${m.servicio}</td><td>${m.plan}</td><td>${m.monto}</td><td>${m.notas||''}</td>`; tb.appendChild(tr);} }

  (async function init(){ await openDB(); await ensureDefaultServices(); await refreshServiciosSelect(); document.querySelectorAll('main section').forEach((s,i)=>s.style.display = i===0? 'block':'none'); document.querySelector('#clientes').style.display='block'; document.querySelector('#inicio').value=todayStr(); document.querySelector('#fin').value=todayStr(); await renderClientes(); await renderMovimientos(); })();
})();