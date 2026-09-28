import markup from './editor-markup.mjs';
import {mountShadow} from './scope.mjs';
import {product} from './storefront.mjs';
import {configureProduct} from './runtime-product.mjs';
import {installCheckoutGuard} from './cart.mjs';
async function start(){
 installCheckoutGuard();
 const slug=location.pathname.match(/^\/productos\/([^/]+)\/?$/)?.[1];
 if(!slug||slug==='servicio-de-estampado-cm2'||document.getElementById('fl-editor-v2'))return;
 const original=document.getElementById('single-product');if(!original)return;
 if(document.querySelector('#fl-dynamic-form,#fl-customizer-modal')){console.warn('[Full Liso V2] Pausá las etiquetas anteriores para activar el nuevo editor.');return;}
 const note=document.createElement('p');note.textContent='Preparando opciones de tu pedido…';note.style.cssText='padding:16px;text-align:center';original.before(note);
 let embedded,previous=[];
 try{
  const [p,service]=await Promise.all([product(slug),product('servicio-de-estampado-cm2')]);const config=configureProduct(p,service);
  embedded=await mountShadow('fl-editor-v2',markup,['style.css','updates.css','logo-tools.css','size-guide.css','stock.css','compact.css','native.css'],'compact');
  embedded.app.dataset.step='prendas';embedded.app.dataset.draftDatabase='full-liso-web-v2-'+p.id;embedded.app.dataset.guideStorage='full-liso-web-guides';
  embedded.root.querySelector('h1').textContent=p.name;embedded.root.querySelector('.compact-intro p:last-child').textContent='Elegí colores y cantidades. Sumá tu logo si querés personalizar.';
  embedded.root.querySelector('.preview>.small').textContent=config.profile.real?'Diseñá sobre la referencia talle L. El logo mantiene sus centímetros en todos los talles.':'Medidas y ubicación orientativas. El logo conserva el tamaño en centímetros que elegís.';
  if(config.missingViews.length){const info=document.createElement('p');info.className='fl-view-note';info.textContent='Mostramos las vistas con fotos disponibles de este producto.';embedded.root.querySelector('.preview').append(info);}
  original.before(embedded.host);await embedded.ready;
  const header=document.querySelector('header.js-head-main,header[data-store="head"]');const offset=()=>embedded.host.style.setProperty('--fl-head-height',(header?header.getBoundingClientRect().height:0)+'px');if(header)new ResizeObserver(offset).observe(header);offset();
  await import('./compact.mjs');
  previous=[...original.children].map(node=>({node,hidden:node.hidden}));previous.forEach(x=>x.node.hidden=true);original.hidden=true;
  // The entire header, search form, account and cart remain in the shop DOM.
  note.remove();window.dispatchEvent(new CustomEvent('fl:editor-ready',{detail:{productId:p.id}}));
 }catch(error){embedded?.host.remove();original.hidden=false;previous.forEach(x=>x.node.hidden=x.hidden);note.textContent='No pudimos cargar el personalizador. Podés usar la compra habitual o recargar la página.';console.error('[Full Liso V2]',error);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else void start();
