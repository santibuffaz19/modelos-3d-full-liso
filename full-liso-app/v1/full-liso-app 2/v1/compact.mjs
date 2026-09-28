import {document} from './editor-dom.mjs';
// Alternative presentation; editing, pricing, stock and exports share the
// existing engine. The page supplies a separate local draft database.
const engine=await import('./app-v2.mjs');
import {submitDesign,prepareDesign,updatePreparedCustomer,pausePreparationStatus,showSubmitError} from './order-flow.mjs';
const $=s=>document.querySelector(s),steps=['prendas','diseno','resumen'];
let step='prendas',busy=false,syncPending=false,retry=false,preloadTimer;
const customer=document.createElement('label');customer.className='order-customer';customer.textContent='Nombre o empresa para identificar el pedido';const nameInput=document.createElement('input');nameInput.id='order-customer-name';nameInput.type='text';nameInput.maxLength=70;nameInput.autocomplete='name';nameInput.placeholder='Ej. Juan Pérez · Taller Norte';customer.append(nameInput);const help=document.createElement('small');help.textContent='Opcional. Usamos este nombre para organizar tus archivos.';customer.append(help);$('#summary').before(customer);
try{nameInput.value=sessionStorage.getItem('fl-order-customer')||'';}catch{}
nameInput.addEventListener('blur',()=>{void updatePreparedCustomer().catch(()=>{});});
nameInput.addEventListener('input',()=>{try{sessionStorage.setItem('fl-order-customer',nameInput.value);}catch{}});
$('.quantity-field').insertBefore($('#open-size-guide'),$('.quantity-group-caption'));
const counts=()=>({custom:Number($('[data-mode-count="custom"]').textContent)||0,plain:Number($('[data-mode-count="plain"]').textContent)||0,logos:$('#logo-list').querySelectorAll('.logo-row-shell').length});
function message(text){$('#compact-message').textContent=text;$('#compact-message').hidden=!text;}
const status=document.createElement('p');status.id='compact-message';status.className='compact-message';status.setAttribute('role','status');status.hidden=true;$('.compact-steps').after(status);
function sync(){
 const q=counts(),total=q.custom+q.plain;
 $('#step-quantity').textContent=total?`${total} ${total===1?'prenda':'prendas'}`:'Colores y talles';
 $('#step-logos').textContent=q.logos?`${q.logos} ${q.logos===1?'logo':'logos'}`:total&&!q.custom?'Sin estampa':'Tu logo';
 $('#compact-plain-design').hidden=!$('#design-controls').hidden;
 $('#group-help').textContent=$('#design-controls').hidden?'Se suman sin estampa. Tu diseño se conserva.':'Comparten el diseño que armes en el paso 2.';
 $('#compact-summary-empty').hidden=total>0;
 $('#compact-next').textContent=busy?'Verificando stock…':step==='prendas'?(q.custom?'Seguir con mi logo →':q.plain?'Revisar pedido →':'Seguir →'):step==='diseno'?'Revisar pedido →':retry?'Reintentar carga':'Agregar al carrito';
 $('#compact-next').disabled=busy;
 $('#compact-back').hidden=step==='prendas';
 $('[data-step-to="prendas"] .nav-number').classList.toggle('complete',total>0);
 $('[data-step-to="diseno"] .nav-number').classList.toggle('complete',q.logos>0||(total>0&&!q.custom));
}
function showStep(next,{scroll=false,focus=false}={}){
 if(!steps.includes(next))return;
 step=next;document.body.dataset.step=next;message('');
 for(const name of steps){const selected=name===next;$('#panel-'+name).hidden=!selected;const tab=$('#tab-'+name);tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
 if(next==='diseno'&&counts().custom&&$('#design-controls').hidden)$('[data-mode="custom"]').click();
 clearTimeout(preloadTimer);pausePreparationStatus();if(next==='resumen')preloadTimer=setTimeout(()=>{if(!busy)void prepareDesign(engine).catch(()=>{});},400);
 sync();if(focus)$('#tab-'+next).focus({preventScroll:true});
 if(scroll)requestAnimationFrame(()=>$('.compact-steps').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'}));
}
for(const button of document.querySelectorAll('[data-step-to]'))button.addEventListener('click',()=>showStep(button.dataset.stepTo,{scroll:button.closest('.summary-shortcuts')!==null}));
$('.compact-steps').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();let i=steps.indexOf(step);i=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;showStep(steps[i],{focus:true});});
$('#compact-back').onclick=()=>showStep(steps[Math.max(0,steps.indexOf(step)-1)],{scroll:true});
$('#compact-preview-toggle').onclick=()=>{const expanded=document.body.classList.toggle('preview-expanded');$('#compact-preview-toggle').setAttribute('aria-expanded',String(expanded));$('#compact-preview-toggle').textContent=expanded?'Cerrar vista previa ↑':'Ver prenda y herramientas ↓';};
$('#compact-add-custom').onclick=()=>{$('[data-mode="custom"]').click();showStep('prendas',{scroll:true});};
const originalReview=$('#review').onclick;
async function validate(){
 const q=counts();
 if(!q.custom&&!q.plain){showStep('prendas',{scroll:true});message('Elegí al menos una prenda para armar tu pedido.');return false;}
 if(q.custom&&!q.logos){showStep('diseno',{scroll:true});message('Agregá tu logo o probá un ejemplo para completar la cotización.');return false;}
 busy=true;sync();
 try{
  const before=$('#sticky-total').textContent;await originalReview.call($('#review'));
  if(before!==$('#sticky-total').textContent){showStep('resumen',{scroll:true});message('La tienda actualizó un precio. Revisá el nuevo total y confirmá nuevamente.');return false;}
  if(!$('#stock-order-warning').hidden){showStep('prendas',{scroll:true});message('Revisá las cantidades señaladas: el stock cambió o necesita verificarse.');return false;}
  if($('#sticky-total').textContent==='Revisar diseño'||$('#save').disabled){showStep('diseno',{scroll:true});message('Revisá el tamaño y la ubicación de tu logo antes de continuar.');return false;}
  return true;
 }catch{message('No se pudo verificar el pedido. Probá nuevamente.');return false;}
 finally{busy=false;sync();}
}
$('#compact-next').onclick=async()=>{
 if(busy)return;
 const q=counts();
 if(step==='prendas'){
  if(!q.custom&&!q.plain){message('Sumá las cantidades de los talles que necesitás.');$('#sizes').scrollIntoView({behavior:'smooth',block:'center'});return;}
  if(q.custom){showStep('diseno',{scroll:true});return;}
 }
 const save=step==='resumen';
 if(await validate()){showStep('resumen',{scroll:true});if(save){busy=true;sync();document.body.dataset.submitting='true';$('.compact-main').inert=true;$('#restore').disabled=true;$('#compact-back').disabled=true;try{await submitDesign(engine);retry=false;}catch(error){retry=true;message(error.message);showSubmitError(error.message);}finally{document.body.dataset.submitting='false';$('.compact-main').inert=false;$('#restore').disabled=false;$('#compact-back').disabled=false;busy=false;sync();}}}
};
// A single, always-visible primary action replaces the duplicated review/save
// buttons. The original handlers and validation remain in use.
$('#save').hidden=true;
const observer=new MutationObserver(()=>{if(syncPending)return;syncPending=true;queueMicrotask(()=>{syncPending=false;sync();});});
for(const node of [$('#logo-list'),$('#totals'),...document.querySelectorAll('[data-mode-count]')])observer.observe(node,{childList:true,subtree:true,characterData:true});
observer.observe($('#design-controls'),{attributes:true,attributeFilter:['hidden']});
$('#restore').addEventListener('click',()=>{$('.draft-menu').open=false;showStep('prendas');});
showStep('prendas');
