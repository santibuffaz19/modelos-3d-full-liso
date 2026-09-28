import markup from './catalog-markup.mjs';
import {mountShadow} from './scope.mjs';
let reader,pending,returnFocus,previousURL;
export async function openCatalog(event){
 event?.preventDefault();returnFocus=event?.currentTarget||document.activeElement;
 if(pending)return pending;
 pending=(async()=>{try{
  if(!reader){
   reader=await mountShadow('fl-catalog-v2',markup,['catalog.css','catalog-native.css'],'catalog-app');
   const dialog=document.createElement('dialog');dialog.id='fl-catalog-dialog';dialog.setAttribute('aria-label','Catálogo Full Liso');dialog.append(reader.host);document.body.append(dialog);reader.dialog=dialog;
   reader.root.querySelector('#close-catalog').onclick=()=>dialog.close();
   dialog.addEventListener('close',()=>{reader.app.hidden=true;if(previousURL)history.replaceState(null,'',previousURL);returnFocus?.focus?.();});
   previousURL=location.href;dialog.showModal();await reader.ready;await import('./catalog.mjs');
  }else{previousURL=location.href;reader.app.hidden=false;reader.dialog.showModal();window.dispatchEvent(new Event('fl:catalog-open'));}
 }catch(error){reader?.dialog?.remove();reader=null;console.error('[Full Liso catálogo]',error);window.alert('No pudimos abrir el catálogo. Volvé a intentarlo.');}finally{pending=null;}})();return pending;
}
function link(text,className=''){const a=document.createElement('a');a.href='/?fl_catalogo=1';a.className=className;a.textContent=text;a.addEventListener('click',openCatalog);return a;}
function start(){
 if(document.getElementById('fl-catalog-access'))return;
 const style=document.createElement('style');style.textContent=`#fl-catalog-dialog{padding:0;border:0;margin:0;width:100vw;max-width:none;height:100dvh;max-height:none;background:#eeeae4}#fl-catalog-dialog::backdrop{background:#fff}#fl-catalog-access{font:600 12px/1.2 inherit;text-align:right;padding:5px 20px;background:inherit;color:inherit}#fl-catalog-access a{display:inline-flex;align-items:center;min-height:32px;text-decoration:none;color:inherit;gap:7px}#fl-catalog-home{max-width:1240px;margin:20px auto;padding:22px 26px;background:#fff9de;border:1px solid #ebdb9f;border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:18px;font-family:inherit}#fl-catalog-home p{margin:4px 0 0}#fl-catalog-home a{border:1px solid #202020;background:#f1c40f;color:#161616;border-radius:25px;padding:12px 20px;white-space:nowrap;text-decoration:none;font-weight:bold}@media(min-width:769px){.fl-native-catalog-item~*{margin-left:0}#fl-catalog-access.has-nav{display:none}}@media(max-width:768px){#fl-catalog-home{margin:14px 12px;padding:16px;flex-wrap:wrap}#fl-catalog-home a{font-size:14px}#fl-catalog-access{padding:0 14px}}`;document.head.append(style);
 const head=document.querySelector('header.js-head-main,header[data-store="head"],header');
 const access=document.createElement('div');access.id='fl-catalog-access';access.append(link('▤ Catálogo digital'));
 if(head)head.append(access);else{access.style.cssText='position:sticky;top:0;z-index:1000;background:#f1c40f';document.body.prepend(access);}
 const nav=document.querySelector('.js-nav-desktop-list');if(nav){const li=document.createElement('li');li.className='nav-item-desktop nav-main-item nav-item fl-native-catalog-item';li.append(link('Catálogo','nav-list-link'));nav.append(li);access.classList.add('has-nav');}
 if(location.pathname==='/'){
  const banner=document.createElement('section');banner.id='fl-catalog-home';const copy=document.createElement('div'),title=document.createElement('strong'),sub=document.createElement('p');title.textContent='Todas tus ideas empiezan con una prenda.';sub.textContent='Explorá modelos, colores y talles en nuestro catálogo.';copy.append(title,sub);banner.append(copy,link('Abrir catálogo →'));const main=document.querySelector('main');if(main)main.prepend(banner);else head?.after(banner);
 }
 window.addEventListener('fl:catalog-request',openCatalog);window.dispatchEvent(new Event('resize'));
 if(new URL(location.href).searchParams.get('fl_catalogo')==='1')void openCatalog();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
