import {document} from './editor-dom.mjs';
import {config} from './config.mjs';
import {quote,orderLines} from './core.mjs';
import {findVariant} from './stock.mjs';
import {addLines} from './cart.mjs';
import {pack} from './packing.mjs';
const $=s=>document.querySelector(s),text=message=>{$('#save-status').textContent=message;$('#save-status').setAttribute('role','status');if(document.body.dataset.submitting==='true')$('#compact-next').textContent=message;},digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);};
async function png(src){const image=new Image();image.src=src;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);return new Promise(resolve=>c.toBlob(resolve,'image/png'));}
async function pdf(logos,n,session){
 if(!window.jspdf)await new Promise((resolve,reject)=>{const script=globalThis.document.createElement('script');script.src=new URL('./vendor/jspdf.umd.min.js',import.meta.url).href;script.onload=resolve;script.onerror=()=>reject(Error('No se pudo preparar el PDF.'));globalThis.document.head.append(script);});
 const {jsPDF}=window.jspdf;const layout=pack(logos,n),doc=new jsPDF({unit:'mm',format:[580,1000],compress:true});doc.setCreationDate(new Date(session.createdAt));doc.setFileId(session.id.replaceAll('-','').toUpperCase());
 for(let i=0;i<layout.pages.length;i++){if(i)doc.addPage([580,1000]);for(const item of layout.pages[i])doc.addImage(logos[item.index].src,'PNG',item.x*10,item.y*10,item.width*10,item.height*10,'logo-'+item.index,'FAST');}
 return doc.output('blob');
}
async function call(endpoint,payload){
 let error;
 for(let attempt=0;attempt<2;attempt++)try{
  const res=await fetch(endpoint,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(payload),signal:AbortSignal.timeout(90000)});
  if(!res.ok)throw Error('Drive no respondió (HTTP '+res.status+').');const data=await res.json();if(!data.ok)throw Object.assign(Error(data.error||'Drive rechazó la operación.'),{rejected:true});return data;
 }catch(e){error=e;if(e.rejected)break;}
 throw Error(error?.message==='Failed to fetch'?'Se interrumpió la conexión con Drive. Tu diseño sigue guardado; reintentá para continuar desde los archivos recibidos.':error?.message||'No se confirmó Drive. Tu diseño sigue guardado; podés reintentar.');
}
export async function submitDesign(engine){
 const state=engine.snapshot(),q=quote(state,config),settings=window.FullLisoV2||{};
 await engine.saveLocal();
 const printed=q.printQuantity>0;
 if(printed&&!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(settings.driveUrl||''))throw Error('La conexión de personalización todavía no está configurada. Tu diseño quedó guardado.');
 const lines=[];for(const l of orderLines(state))for(const [size,quantity]of Object.entries(l.quantities)){if(!quantity)continue;const v=findVariant(config.product,l.color,size);if(!v)throw Error('Variante no disponible.');lines.push({productId:config.product.id,variantId:v.id,mode:l.mode,color:l.color,size,quantity});}
 const serialized=JSON.stringify({lines,logos:state.logos.map(({id,src,originalSrc,name,kind,view,width,height,x,y,rotation,aspect,lockAspect,presetId})=>({id,src,originalSrc,name,kind,view,width,height,x,y,rotation,aspect,lockAspect,presetId})),quote:q,product:config.product.id,geometry:config.views});const fingerprint=await digest(new TextEncoder().encode(serialized)),key='fl-v2-order-'+fingerprint;
 let session;try{session=JSON.parse(sessionStorage.getItem(key));}catch{}
 if(!session){session={id:crypto.randomUUID(),createdAt:new Date().toISOString()};session.token=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');sessionStorage.setItem(key,JSON.stringify(session));}
 if(!session.createdAt){session.createdAt=new Date().toISOString();sessionStorage.setItem(key,JSON.stringify(session));}
 const auth={id:session.id,token:session.token};
 let reference=$('#order-reference');if(!reference){reference=document.createElement('p');reference.id='order-reference';reference.className='small muted';$('#save-status').before(reference);}reference.textContent='Referencia del diseño: '+session.id;
 const fileState={...state,mode:printed?'custom':'plain',activeColor:lines.find(l=>l.mode==='custom')?.color||lines[0].color,view:'front',selectedId:null,presetId:null,calibrationReview:false};
 if(printed){
  text('Preparando tus archivos…');
  const logos=state.logos.map(l=>({...l,originalExtension:/^data:image\/jpeg/.test(l.originalSrc)?'jpg':/^data:image\/webp/.test(l.originalSrc)?'webp':'png'}));
  if(logos.some(l=>l.kind==='example'))throw Error('El logo de ejemplo sirve para probar. Subí tu archivo antes de confirmar el pedido.');
  const design={slug:config.product.slug,lines,logos:logos.map(({src,originalSrc,...l})=>l),quote:{totalCents:q.totalCents,printUnits:q.printUnits},calibration:config.garment.calibration};
  const opened=await call(settings.driveUrl,{op:'begin',...auth,design});
  if(opened.status==='ARCHIVOS_PENDIENTES'){
   const files=[{name:'diseno.json',blob:new Blob([JSON.stringify({version:2,product:{id:config.product.id,slug:config.product.slug,name:config.product.name},configuration:{views:config.views,colors:config.colors,garment:{widthCm:config.garment.widthCm,heightCm:config.garment.heightCm,referenceSize:config.garment.referenceSize,calibration:config.garment.calibration}},state:{...fileState,logos:logos.map(({src,originalSrc,...l},i)=>({...l,originalFile:'logo_'+(i+1)+'_original.'+l.originalExtension,finalFile:'logo_'+(i+1)+'_final.png'}))},quote:q,packing:pack(logos,q.printQuantity)},null,2)],{type:'application/json'})},{name:'mockup.png',blob:await engine.downloadMockup(true,fileState)}];
   for(let i=0;i<logos.length;i++){const l=logos[i];files.push({name:'logo_'+(i+1)+'_original.'+l.originalExtension,blob:/^data:image\/(png|jpeg|webp);/.test(l.originalSrc)?await (await fetch(l.originalSrc)).blob():await png(l.originalSrc)});const blob=await png(l.src);if(blob.size>12*1024*1024)throw Error('Un logo supera 12 MB al prepararlo. Reducí su resolución y volvé a cargarlo.');l.src=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});files.push({name:'logo_'+(i+1)+'_final.png',blob});}
   files.push({name:'planchas_DTF_58cm.pdf',blob:await pdf(logos,q.printQuantity,session)});
   for(const file of files)if(file.blob.size>12*1024*1024)throw Error(file.name+' supera 12 MB. Reducí la resolución del archivo o dividí el diseño en grupos. Tu borrador está guardado.');
   for(let i=0;i<files.length;i++){const file=files[i];if(opened.files?.[file.name])continue;const bytes=new Uint8Array(await file.blob.arrayBuffer()),sha256=await digest(bytes);if(opened.files?.[file.name]?.sha256===sha256)continue;
    text('Guardando tus archivos · '+(i+1)+' / '+files.length);const answer=await call(settings.driveUrl,{op:'upload',...auth,fileName:file.name,mime:file.blob.type||'application/octet-stream',base64:base64(bytes),sha256});if(answer.files?.[file.name]?.sha256!==sha256&&answer.sha256!==sha256)throw Error('No se confirmó un archivo. Reintentá con el diseño guardado.');
   }
   await call(settings.driveUrl,{op:'finalize',...auth});
  }
 }
 const issues=await engine.stockControl.refresh(true);if(issues.length)throw Error('El stock cambió mientras se preparaban los archivos. Revisá las cantidades.');if(quote(state,config).totalCents!==q.totalCents)throw Error('El precio cambió mientras se preparaban los archivos. Revisá el nuevo total y confirmá nuevamente.');
 const cartLines=lines.map(l=>({...l,properties:{'FL Tipo':l.mode==='custom'?'Con logo':'Lisa',...(l.mode==='custom'?{'FL Diseño':session.id,'FL cm2/prenda':Number(q.areaPerGarment.toFixed(6))}:{})}}));
 if(printed)cartLines.push({productId:config.service.id,variantId:config.service.variants[0].id,quantity:q.printUnits,properties:{'FL Tipo':'Estampado','FL Diseño':session.id}});
 const cart=await addLines(cartLines,session.id,text);try{if(typeof window.LS?.updateCart==='function')window.LS.updateCart(cart,false);for(const el of globalThis.document.querySelectorAll('.js-cart-widget-amount'))el.textContent=String((cart.products||cart.items||[]).reduce((sum,item)=>sum+Number(item.quantity||0),0));}catch(error){console.warn('[Full Liso] Abrí el carrito para ver el pedido actualizado.',error);}
 if(printed)try{await call(settings.driveUrl,{op:'cart',...auth,group:session.id});}catch{/* The verified cart and confirmed files remain usable. */}
 text('Tu pedido ya está en el carrito.');const link=document.createElement('a');link.href='/comprar/';link.className='primary';link.textContent='Ir al carrito →';$('#save-status').append(document.createElement('br'),link);
 window.dispatchEvent(new CustomEvent('fl:cart-added',{detail:{group:session.id}}));
}
