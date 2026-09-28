import {apiFetch as fetch,product as readProduct} from './storefront.mjs';
import {document} from './editor-dom.mjs';
import {capacity,checkQuantity,isFresh,selectedTotal,stockIssues} from './stock.mjs';
export function createEditorStock({getState,config,onUpdate}){
  let product=null,pending=null,lastFresh=false,error='';
  const $=selector=>document.querySelector(selector);
  function render(){
    const state=getState(),fresh=isFresh(product);lastFresh=fresh;
    $('#stock-status').textContent=error||(fresh?'Stock consultado en la tienda · '+new Date(product.fetchedAt).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}):pending?'Consultando stock de la tienda…':'Stock sin verificar. Actualizá para sumar prendas.');
    $('#refresh-stock').disabled=!!pending;
    for(const color of Object.keys(config.colors)){
      const button=$(`[data-color="${color}"]`);if(!button)continue;
      let badge=button.querySelector('.color-stock');if(!badge){badge=document.createElement('small');badge.className='color-stock';button.append(badge);}
      const rows=config.garment.sizes.map(size=>capacity(product,color,size));
      const available=rows.some(s=>s.known&&s.max>0),out=rows.every(s=>s.known&&s.max===0);
      badge.textContent=available?'Con stock':out?'Sin stock':'Sin verificar';button.classList.toggle('no-stock',out);
      button.setAttribute('aria-label',`Color ${config.colors[color].label}${out?', sin stock':''}`);
    }
    for(const size of config.garment.sizes){
      const input=$(`[data-size="${size}"]`);if(!input)continue;
      const n=getState().quantitiesByMode?.[state.mode]?.[state.activeColor]?.[size]||0;
      const stock=capacity(product,state.activeColor,size),total=selectedTotal(state,state.activeColor,size),other=total-n;
      const card=input.closest('.size-card');let status=card.querySelector('.size-stock');
      if(!status){status=document.createElement('small');status.className='size-stock';status.id='stock-size-'+size;card.append(status);}
      status.textContent=stock.label;
      if(stock.known&&total>stock.max)status.textContent=`Pediste ${total}; hay ${stock.max}`;
      else if(stock.known&&stock.max>0&&total>=stock.max)status.textContent='Todo el stock en tu pedido';
      else if(stock.known&&other)status.textContent+=` · ${other} en ${state.mode==='custom'?'lisas':'con logo'}`;
      input.disabled=n===0&&(!stock.known||stock.max===0);input.setAttribute('aria-describedby',status.id);
      $(`[data-plus="${size}"]`).disabled=n===999||!stock.known||total>=stock.max;
      $(`[data-minus="${size}"]`).disabled=n===0;
      card.classList.toggle('stock-empty',stock.known&&stock.max===0);card.classList.toggle('stock-conflict',stock.known&&total>stock.max);
    }
    const issues=stockIssues(state,product),box=$('#stock-order-warning');box.replaceChildren();box.hidden=!issues.length;
    if(issues.length){const title=document.createElement('strong');title.textContent='Revisá la disponibilidad de tu pedido';box.append(title);
      for(const issue of issues){const p=document.createElement('p');p.textContent=`${config.colors[issue.color]?.label||issue.color} · ${issue.size}: ${issue.message}`;box.append(p);}
      const hint=document.createElement('p');hint.textContent='Lisas y estampadas comparten el stock. Podés reducir las cantidades; conservamos tu diseño.';box.append(hint);
      $('#review').textContent='Revisar stock ↑';
    }
  }
  async function refresh(fresh=false){
    if(pending)return pending;
    error='';pending=(async()=>{try{
      const res=await fetch('/api/catalog/product/'+config.product.slug+(fresh?'?fresh=1':''),{cache:'no-store',signal:AbortSignal.timeout(25000)});
      if(!res.ok)throw Error();const data=await res.json();
      if(data.slug!==config.product.slug||!Array.isArray(data.variants)||!Number.isFinite(data.fetchedAt))throw Error();
      product=data;config.product=data;const service=await readProduct('servicio-de-estampado-cm2',{fresh});config.service=service;config.pricing.unitPricePerCm2=service.variants[0].price;for(const v of data.variants){const c=Object.entries(v.options).find(([k])=>k.toLowerCase()==='color')?.[1]||'Único',s=Object.entries(v.options).find(([k])=>/talle|talla|tamaño/i.test(k))?.[1]||Object.entries(v.options).filter(([k])=>k.toLowerCase()!=='color').map(([,v])=>v).join(' · ')||'Único';if(config.garment.prices[c])config.garment.prices[c][s]=v.price;}if(!isFresh(product))error='No se pudo actualizar el stock. No sumes prendas hasta verificarlo.';
    }catch{product=product?{...product,stale:true}:null;error='No pudimos verificar el stock. Tocá Actualizar para reintentar.';}finally{pending=null;onUpdate();}
    return stockIssues(getState(),product);})();render();return pending;
  }
  $('#refresh-stock').onclick=()=>refresh(true);
  setInterval(()=>{if(!document.hidden)void refresh()},60000);
  setInterval(()=>{if(lastFresh!==isFresh(product))onUpdate()},5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh(true)});
  window.addEventListener('focus',()=>void refresh(true));
  return {render,refresh,issues:()=>stockIssues(getState(),product),check:(size,value)=>{const s=getState();return checkQuantity(s,product,s.activeColor,size,s.mode,value)}};
}
