(function(){
'use strict';
const fmtDate=(d)=>{if(!d)return'';const x=new Date(d);return x.toISOString().slice(0,10)};
const todayStr=()=>fmtDate(new Date());
const daysBetween=(a,b)=>Math.floor((new Date(b)-new Date(a))/(1000*60*60*24));
const calcEstado=(fin)=>{const h=todayStr();if(fmtDate(fin)<h)return{k:'vencido',label:'Vencido'};if(fmtDate(fin)===h)return{k:'hoy',label:'Hoy'};return{k:'activo',label:'Activo'}};
let db;
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open('crm',1);r.onupgradeneeded=e=>{const d=e.target.result;d.createObjectStore('clientes',{keyPath:'id',autoIncrement:true});d.createObjectStore('movimientos',{keyPath:'id',autoIncrement:true});d.createObjectStore('servicios',{keyPath:'id',autoIncrement:true});};r.onsuccess=()=>{db=r.result;res(db)};r.onerror=()=>rej(r.error);});}
const tx=(s,m='readonly')=>db.transaction(s,m).objectStore(s);
const saveCliente=(o)=>new Promise((r,j)=>{const q=tx('clientes','readwrite').put(o);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});
const delCliente=(id)=>new Promise((r,j)=>{const q=tx('clientes','readwrite').delete(id);q.onsuccess=()=>r(true);q.onerror=()=>j(q.error)});
const allClientes=()=>new Promise((r,j)=>{const q=tx('clientes').getAll();q.onsuccess=()=>r(q.result||[]);q.onerror=()=>j(q.error)});
const addMov=(m)=>{m.fecha=m.fecha||todayStr();return new Promise((r,j)=>{const q=tx('movimientos','readwrite').add(m);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});};
const allMov=()=>new Promise((r,j)=>{const q=tx('movimientos').getAll();q.onsuccess=()=>r(q.result||[]);q.onerror=()=>j(q.error)});
const saveServicio=(s)=>new Promise((r,j)=>{const q=tx('servicios','readwrite').put(s);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});
const allServicios=()=>new Promise((r,j)=>{const q=tx('servicios').getAll();q.onsuccess=()=>r(q.result||[]);q.onerror=()=>j(q.error)});
const $=(q)=>document.querySelector(q), $$=(q)=>[...document.querySelectorAll(q)];
// Tabs
$$('#tabs button').forEach(b=>b.addEventListener('click',()=>{$$('#tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('main section').forEach(s=>s.classList.remove('active'));document.getElementById(b.dataset.tab).classList.add('active');if(b.dataset.tab==='clientes')renderClientes();if(b.dataset.tab==='movimientos')renderMovimientos();}));
// Render
async function renderClientes(){const data=await allClientes();const tb=$('#tablaClientes tbody');tb.innerHTML='';const hoy=todayStr();data.forEach(c=>{const est=calcEstado(c.fin);const dias=daysBetween(new Date(),new Date(c.fin));const dstr=(fmtDate(c.fin)===hoy)?'0':dias;const tr=document.createElement('tr');tr.innerHTML=`<td>${c.nombre||''} ${c.apellido||''}</td><td>${c.email||''}</td><td>${c.servicio||''}</td><td>${c.plan||''}</td><td>${c.inicio}→${c.fin}</td><td>${dstr}</td><td>${c.precio}</td><td>${est.label}</td>`;tb.appendChild(tr)});}
async function renderMovimientos(){const data=await allMov();const tb=$('#tablaMov tbody');tb.innerHTML='';data.forEach(m=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${m.fecha}</td><td>${m.tipo}</td><td>${m.cliente}</td><td>${m.servicio}</td><td>${m.plan}</td><td>${m.monto}</td><td>${m.notas||''}</td>`;tb.appendChild(tr)});}
// Form submit
if($('#formCliente'))$('#formCliente').addEventListener('submit',async e=>{e.preventDefault();const obj={id:Number($('#clienteId').value)||undefined,nombre:$('#nombre').value||'',apellido:$('#apellido').value||'',email:$('#email').value||'',servicio:$('#servicio').value||'SIN',plan:$('#plan').value||'mensual',precio:Number($('#precio').value)||0,estado:$('#estado').value||'activo',usuarioPlataforma:$('#usuarioPlataforma').value||'',passPlain:$('#contrasenaVisible').value||'',notas:$('#notas').value||'',inicio:$('#inicio').value||todayStr(),fin:$('#fin').value||todayStr()};try{const rid=await saveCliente(obj);await addMov({tipo:obj.id?'EDICIÓN':'ALTA',cliente:obj.nombre+' '+obj.apellido,servicio:obj.servicio,plan:obj.plan,monto:obj.precio,notas:''});alert('Guardado OK');renderClientes();}catch(err){alert('Error al guardar '+err)}});
if($('#btnEliminar'))$('#btnEliminar').addEventListener('click',async()=>{const id=Number($('#clienteId').value);if(!id)return;await delCliente(id);await addMov({tipo:'BAJA',cliente:'',servicio:'',plan:'',monto:0,notas:''});renderClientes()});
// Copy
function copyText(id){const el=$(id);el.select();document.execCommand('copy');}
if($('#copyUsuario'))$('#copyUsuario').addEventListener('click',()=>copyText('#usuarioPlataforma'));
if($('#copyPassVisible'))$('#copyPassVisible').addEventListener('click',()=>copyText('#contrasenaVisible'));
// Clear DB
if($('#btnClearDB'))$('#btnClearDB').addEventListener('click',()=>{indexedDB.deleteDatabase('crm');alert('Base borrada. Recargá.');});
(async function init(){await openDB();renderClientes();renderMovimientos();})();})();