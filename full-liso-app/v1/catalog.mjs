import {apiFetch as fetch} from './storefront.mjs';
import {document} from './catalog-dom.mjs';
import {isFresh,optionValue,variantStatus} from './stock.mjs';
import {colorModelPhotos,colorPhoto,isModelPhoto,catalogImageSources} from './catalog-layout.mjs';
import {FlipBook} from './flip-book.mjs';
import {articleIcon} from './catalog-icons.mjs';

const $=s=>document.querySelector(s),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
let products=[],filtered=[],active='',section='cover',loading=false,error='',lastFresh=true,pendingRender=false,preparing=true;
const choices=new Map(),photosChosen=new Map(),photoViews=new Map(),imageLoads=new Map();
let preloadLabel='Preparando las fotos…';
const money=n=>n===null?'Consultar precio':new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:0,maximumFractionDigits:2}).format(n);
const title=s=>s.toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase()),pad=n=>String(n).padStart(2,'0');
const status=p=>!isFresh(p)?'unknown':p.variants.some(v=>variantStatus(v)==='available')?'available':p.variants.length&&p.variants.every(v=>variantStatus(v)==='out')?'out':'unknown';
const statusLabel=s=>s==='available'?'Con stock':s==='out'?'Sin stock':'Stock por verificar';
const colorHex=name=>({'negro':'#242424','negro completo':'#242424','blanco':'#fafafa','marino':'#15264a','azul marino':'#15264a','gris melange':'#b8b8b6','gris':'#6e6e6e','rojo':'#af3c35','verde':'#4b6951','azul':'#48749a','francia':'#2848ba','beige':'#d2c2a1','chocolate':'#633d0a','rosa':'#dca1ad','amarillo':'#efca3b'})[name.toLowerCase()]||'#d7d7d7';
const photo=(src,alt)=>{const img=el('img');if(src)img.src=src;img.decoding='async';img.alt=alt;img.draggable=false;return img;};
const badge=p=>el('span',statusLabel(status(p)),'stock-badge '+status(p));

const flip=new FlipBook($('#book-wrapper'),$('#book'),{onChange:position=>{
 if(position===0){section='cover';active='';}else if(position===1){section='index';active='';}else if(position===flip.total){section='end';active='';}else{section='product';active=filtered[position-2]?.slug||'';}
 updateNavigation();writeURL();
},onBusy:busy=>{
 $('#page-number').setAttribute('aria-live',busy?'off':'polite');updateNavigation(busy);
 if(!busy&&pendingRender){pendingRender=false;render();}
}});
function updateNavigation(busy=flip.busy||flip.routeTarget!=null){
 const destination=flip.routeTarget??flip.target??flip.position;
 $('#previous').disabled=preparing||!filtered.length||destination<=0;
 $('#next').disabled=preparing||!filtered.length||destination>=flip.total;
 $('#home-index').disabled=preparing||!filtered.length||destination===1;
 $('#share').disabled=preparing;
 $('#page-number').textContent=section==='cover'?'El catálogo':section==='index'?'Índice · '+filtered.length+' artículos':section==='end'?'Fin del catálogo':pad((flip.position-2)*2+1)+'–'+pad((flip.position-2)*2+2)+' / '+pad(filtered.length*2);
 $('#page-caption').textContent=preparing?preloadLabel:busy?'Pasando hojas…':section==='cover'?'Abrí el libro para empezar':section==='index'?'Tocá un artículo o pasá las hojas':'Arrastrá la hoja para seguir';
 for(const b of document.querySelectorAll('[data-open-book]'))b.disabled=preparing;
 for(const label of document.querySelectorAll('.preload-status')){label.textContent=preparing?preloadLabel:'';label.hidden=!preparing;}
 $('#book').dataset.ready=String(!preparing);
}
function writeURL(){
 const u=new URL(location.href);u.searchParams.set('fl_catalogo','1');['producto','color','revista'].forEach(k=>u.searchParams.delete(k));
 if(section==='product'){u.searchParams.set('producto',active);if(choices.get(active))u.searchParams.set('color',choices.get(active));}
 if(section==='end')u.searchParams.set('revista','fin');
 if(!document.body.hidden)history.replaceState(null,'',u);updateShare();
}
function goToProduct(slug){const index=filtered.findIndex(p=>p.slug===slug);if(index>=0&&!preparing)flip.seek(index+2);}
function pageHead(label,p){const head=el('header',undefined,'paper-head');head.append(el('span',label),p?badge(p):el('span','FULL LISO'));return head;}
function folio(text,num){const footer=el('footer',undefined,'folio');footer.append(el('span',text),el('span',num));return footer;}
function cover(end=false){
 const face=el('article',undefined,'cover-page');face.setAttribute('aria-label',end?'Contratapa':'Tapa del catálogo');
 face.append(el('p','PRENDAS LISAS · TU ESTILO','eyebrow'),el('h2',end?'Tu próxima idea empieza acá.':'FULL\nLISO'),el('p',end?'Prendas lisas. Infinitas posibilidades.':'Vestí tu idea.'));
 const b=el('button',end?'Volver al índice ↑':'Abrir catálogo →');b.dataset.openBook='';b.onclick=()=>{if(!preparing)flip.seek(1);};
 const progress=el('p',preloadLabel,'preload-status');progress.setAttribute('role','status');progress.hidden=!preparing;
 face.append(b,progress,el('span','EL CATÁLOGO','cover-edition'));return face;
}
function indexPage(items,second){
 const face=el('article',undefined,'index-page');face.setAttribute('aria-label',second?'Índice, más artículos':'Índice del catálogo');
 const grid=el('div',undefined,'index-grid');grid.dataset.noDrag='';grid.dataset.odd=String(items.length%2===1);
 for(const p of items){
  const b=el('button',undefined,'index-tile');b.type='button';b.setAttribute('aria-label','Ir a '+title(p.name));b.dataset.slug=p.slug;
  b.append(articleIcon(p.slug),el('strong',title(p.name)));b.onclick=()=>goToProduct(p.slug);grid.append(b);
 }
 face.append(grid);return face;
}
function photoPage(p,index){
 const face=el('article',undefined,'photo-page');face.dataset.product=p.slug;face.setAttribute('aria-label','Fotos de '+title(p.name));
 const frame=el('div',undefined,'photo-frame'),img=photo('',title(p.name)),missing=el('p','Foto de este color pendiente.','photo-missing');frame.append(img,missing);
 let images=[],current=0,color='';
 const controls=el('div',undefined,'photo-controls'),prev=el('button','‹'),next=el('button','›'),count=el('span');
 prev.setAttribute('aria-label','Foto anterior de '+title(p.name));next.setAttribute('aria-label','Foto siguiente de '+title(p.name));
 function update(){
  const src=images[current];img.hidden=!src;missing.hidden=!!src;
  if(src){img.src=src;img.alt=title(p.name)+' · '+color+' · Foto '+(current+1);img.dataset.kind=isModelPhoto(src)?'model':'product';}
  photosChosen.set(p.slug,{color,index:current});count.textContent=(current+1)+' / '+images.length;
  prev.disabled=current<=0;next.disabled=current>=images.length-1;controls.hidden=images.length<2;
 }
 function selectColor(name){
  color=name;const variants=p.variants.filter(v=>(optionValue(v,'color')||'Único')===color);
  images=colorModelPhotos(p,color,variants);
  const saved=photosChosen.get(p.slug);current=Math.min(saved?.color===color?saved.index:0,Math.max(0,images.length-1));update();
 }
 prev.onclick=()=>{if(current>0){current--;update();}};next.onclick=()=>{if(current<images.length-1){current++;update();}};
 controls.append(prev,count,next);face.append(frame,controls);photoViews.set(p.slug,selectColor);selectColor(choices.get(p.slug));return face;
}
function infoPage(p,index){
 const face=el('article',undefined,'info-page');face.dataset.product=p.slug;face.setAttribute('aria-label','Información de '+title(p.name));
 face.append(pageHead('COLORES Y TALLES',p));
 const heading=el('div',undefined,'info-title');heading.append(el('h2',title(p.name)),el('p',money(p.price),'price'));face.append(heading);
 const groups=new Map();for(const v of p.variants){const name=optionValue(v,'color')||'Único';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(v);}
 const unique=groups.size===1&&groups.has('Único');
 if(!groups.has(choices.get(p.slug)))choices.set(p.slug,[...groups].find(([,vs])=>vs.some(v=>variantStatus(v)==='available'))?.[0]||groups.keys().next().value||'');
 const label=el('div',undefined,'color-label');label.append(el('span',unique?'El producto':'Encontrá tu color'),el('small',unique?'Presentación única':groups.size+' colores'));face.append(label);
 const variantsPanel=el('div',undefined,'variants-panel');variantsPanel.dataset.noDrag='';const colors=el('div',undefined,'color-photos');colors.style.setProperty('--colors',Math.max(1,groups.size));variantsPanel.append(colors);
 const stock=el('div',undefined,'stock-section'),stockHeading=el('h3'),sizes=el('div',undefined,'sizes'),note=el('p',undefined,'stock-note');stock.append(stockHeading,sizes,note);
 const link=el('a',undefined,'product-link');link.href=p.url;link.target='_blank';link.rel='noopener';link.append(el('span','Ver producto en la tienda'),el('span','↗'));link.lastChild.setAttribute('aria-hidden','true');
 function updateStock(){
  const color=choices.get(p.slug),chosen=groups.get(color)||[];stockHeading.textContent=chosen.some(v=>optionValue(v,'size'))?color+' · Talles':'Disponibilidad';
  for(const b of colors.children)b.setAttribute('aria-pressed',String(b.dataset.color===color));
  sizes.replaceChildren();let last=false;
  for(const v of chosen){
   const s=isFresh(p)?variantStatus(v):'unknown',name=Object.entries(v.options).filter(([key])=>key.toLowerCase()!=='color').map(([,value])=>value).join(' · ')||'Único',chip=el('span',undefined,'size-chip '+s);chip.append(el('strong',name));
   if(s==='available'&&v.stock===1){last=true;chip.append(el('small','¹'));}if(s==='unknown')chip.append(el('small','?'));
   chip.setAttribute('aria-label',name+': '+statusLabel(s)+(s==='available'&&v.stock===1?', última unidad':''));chip.title=chip.getAttribute('aria-label');sizes.append(chip);
  }
  note.textContent=!isFresh(p)?'Stock sin verificar. Actualizá para consultar.':chosen.length&&chosen.every(v=>variantStatus(v)==='out')?(unique?'Producto sin stock.':'Este color está agotado.'):(last?'¹ Última unidad · ':'')+'Tachados: sin stock.';
 }
 for(const[name,variants]of groups){
  const out=isFresh(p)&&variants.every(v=>variantStatus(v)==='out'),b=el('button',undefined,'color-button'+(out?' out':''));b.dataset.color=name;b.setAttribute('aria-label',name+(out?', sin stock':'')+' · '+title(p.name));
  const frame=el('span',undefined,'color-image'),src=unique?p.image:colorPhoto(p,name,variants),dot=el('span',undefined,'color-dot');dot.style.backgroundColor=colorHex(name);
  if(src)frame.append(photo(src,title(p.name)+' · '+name));else frame.append(dot.cloneNode());
  const nameLine=el('span',undefined,'color-name');nameLine.append(dot,el('span',name));b.append(frame,nameLine,el('small',out?'Sin stock':!isFresh(p)?'Por verificar':src?'':'Foto pendiente'));
  b.onclick=()=>{choices.set(p.slug,name);updateStock();photoViews.get(p.slug)?.(name);writeURL();};colors.append(b);
 }
 updateStock();face.append(variantsPanel,stock,link,el('p','El stock se confirma al comprar.','purchase-note'),folio('FULL LISO · VESTÍ TU IDEA.',pad(index*2+2)));return face;
}
function buildBook(){
 const middle=Math.ceil(filtered.length/2),papers=[];photoViews.clear();
 // Establish colors before constructing the photo leaf (which precedes info).
 for(const p of filtered){const names=[...new Set(p.variants.map(v=>optionValue(v,'color')||'Único'))];
  if(!names.includes(choices.get(p.slug)))choices.set(p.slug,optionValue(p.variants.find(v=>variantStatus(v)==='available')||p.variants[0]||{},'color')||names[0]||'Único');
 }
 for(let i=0;i<filtered.length+2;i++){
  const sheet=el('div',undefined,'sheet');sheet.dataset.sheet=i;
  const front=i===0?cover():i===1?indexPage(filtered.slice(middle),true):infoPage(filtered[i-2],i-2);
  const back=i===0?indexPage(filtered.slice(0,middle),false):i<=filtered.length?photoPage(filtered[i-1],i-1):cover(true);
  front.classList.add('face','front');back.classList.add('face','back');sheet.append(front,back);papers.push(sheet);
 }
 let position=section==='cover'?0:section==='end'?papers.length:section==='product'?filtered.findIndex(p=>p.slug===active)+2:1;
 if(section==='product'&&!filtered.some(p=>p.slug===active))position=1;
 flip.setPages(papers,position);
}
function render(){
 if(flip.busy||flip.routeTarget!=null){pendingRender=true;return;}
 filtered=products;
 $('#magazine').hidden=!filtered.length;$('#catalog-empty').hidden=!!filtered.length||loading;$('#loading').hidden=!!products.length||!loading;
 if(filtered.length)buildBook();else{section='cover';active='';updateNavigation();writeURL();}
 $('#catalog-notice').textContent=error;
}
// Fetch all catalog assets once at opening, with bounded concurrency. The
// browser cache then serves color changes and turns without per-page loading.
function loadImage(src){
 if(imageLoads.has(src))return imageLoads.get(src);
 const pending=new Promise(resolve=>{
  const img=new Image();let done=false;
  const finish=ok=>{if(done)return;done=true;clearTimeout(timer);img.onload=img.onerror=null;resolve(ok);};
  const timer=setTimeout(()=>finish(false),12000);img.onload=()=>finish(true);img.onerror=()=>finish(false);img.src=src;
 });imageLoads.set(src,pending);return pending;
}
async function preloadCatalog(){
 const sources=catalogImageSources(products);let cursor=0,completed=0,failed=0;
 async function worker(){while(cursor<sources.length){const src=sources[cursor++];if(!await loadImage(src)){failed++;imageLoads.delete(src);}completed++;
  preloadLabel='Cargando fotos · '+completed+' / '+sources.length;updateNavigation();
 }}
 await Promise.all(Array.from({length:Math.min(8,sources.length)},worker));
 preparing=false;updateNavigation();
 if(failed){$('#catalog-notice').textContent='Algunas fotos no pudieron cargarse. Tocá ↻ para reintentar.';}
}
async function refresh(){
 if(loading)return;loading=true;$('#refresh').disabled=true;$('#sync-status').textContent='Consultando stock…';
 try{
  const res=await fetch('/api/catalog',{cache:'no-store',signal:AbortSignal.timeout(60000)});if(!res.ok)throw Error();const data=await res.json();if(!Array.isArray(data.products))throw Error();
  const order=new Map(products.map((p,i)=>[p.slug,i]));products=data.products.sort((a,b)=>(order.get(a.slug)??999)-(order.get(b.slug)??999));error=data.complete?'':'Algunas fichas no pudieron actualizarse. Tocá ↻ para reintentar.';
  $('#sync-status').textContent='Stock consultado '+new Date(data.checkedAt).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});lastFresh=products.every(p=>isFresh(p));
 }catch{products=products.map(p=>({...p,stale:true}));error='No se pudo actualizar la tienda. El stock necesita verificarse.';$('#sync-status').textContent='Stock sin verificar';lastFresh=false;}
 finally{loading=false;$('#refresh').disabled=false;render();await preloadCatalog();}
}
$('#previous').onclick=()=>{if(!preparing)flip.turn(-1);};$('#next').onclick=()=>{if(!preparing)flip.turn(1);};
$('#home-index').onclick=()=>{if(!preparing)flip.seek(1);};$('#brand-index').onclick=e=>{e.preventDefault();if(!preparing)flip.seek(0);};
$('#refresh').onclick=refresh;
window.addEventListener('keydown',e=>{if(document.body.hidden||preparing||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();flip.turn(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1);}});
function shareURL(){return new URL('/?fl_catalogo=1',location.origin).href;}
function updateShare(){const link=$('#whatsapp-share');if(link)link.href='https://wa.me/?text='+encodeURIComponent('Mirá el catálogo de Full Liso: '+shareURL());}
$('#share-note').textContent='FULL LISO · EL CATÁLOGO';
$('#share').onclick=async()=>{try{await navigator.clipboard.writeText(shareURL());$('#share').textContent='Copiado ✓';setTimeout(()=>$('#share').textContent='Copiar enlace',2500);}catch{$('#share-note').textContent=shareURL();}};
updateShare();
window.addEventListener('fl:catalog-open',()=>{section='cover';active='';if(products.length){flip.setPages([...$('#book').children],0);updateNavigation();writeURL();}if(!lastFresh)void refresh();});
setInterval(()=>{if(!document.hidden&&!document.body.hidden)void refresh();},60000);
setInterval(()=>{const fresh=products.length>0&&products.every(p=>isFresh(p));if(!document.body.hidden&&lastFresh&&!fresh){lastFresh=false;error='El stock necesita actualizarse. Tocá ↻ para verificarlo.';render();}},5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!document.body.hidden)void refresh();});
void refresh();
