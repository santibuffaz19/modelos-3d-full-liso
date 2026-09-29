import {document} from './editor-dom.mjs';
import {config} from './config.mjs';
import {quote,orderLines} from './core.mjs';
import {findVariant} from './stock.mjs';
import {addLines,readCart} from './cart.mjs';
import {pack} from './packing.mjs';
import {connectDrive,sendDrive} from './drive-bridge.mjs';
import {uploadBatches,reuseIdentical,shortReference} from './upload-plan.mjs';
const $=s=>document.querySelector(s),text=message=>{$('#save-status').textContent=message;$('#save-status').setAttribute('role','status');if(document.body.dataset.submitting==='true')$('#compact-next').textContent=message;},digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);};
async function png(src){const image=new Image();image.src=src;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);return new Promise(resolve=>c.toBlob(resolve,'image/png'));}
async function pdf(logos,n,session){
 if(!window.jspdf)await new Promise((resolve,reject)=>{const script=globalThis.document.createElement('script');script.src=new URL('./vendor/jspdf.umd.min.js',import.meta.url).href;script.onload=resolve;script.onerror=()=>reject(Error('No se pudo preparar el PDF.'));globalThis.document.head.append(script);});
 const {jsPDF}=window.jspdf;const layout=pack(logos,n),doc=new jsPDF({unit:'mm',format:[580,1000],compress:true});doc.setCreationDate(new Date(session.createdAt));doc.setFileId(session.id.replaceAll('-','').toUpperCase());
 const artworkIds=new Map();logos.forEach((l,i)=>{if(!artworkIds.has(l.src))artworkIds.set(l.src,'logo-'+i);});
 for(let i=0;i<layout.pages.length;i++){if(i)doc.addPage([580,1000]);for(const item of layout.pages[i])doc.addImage(logos[item.index].src,'PNG',item.x*10,item.y*10,item.width*10,item.height*10,session.transportVersion>=3?artworkIds.get(logos[item.index].src):'logo-'+item.index,'FAST');}
 return doc.output('blob');
}
const prepared=new Map();let activeKey='',queue=Promise.resolve();
const customerName=()=>($('#order-customer-name')?.value||'').replace(/\s+/g,' ').trim().slice(0,70);
const endpoint=()=>window.FullLisoV2?.driveUrl||'';
function endpointReady(){if(location.hostname==='127.0.0.1'&&/^http:\/\/127\.0\.0\.1:\d+\/drive$/.test(endpoint()))return true;return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint());}
async function call(url,payload,onWait=()=>{}){
 if(new URL(url).hostname==='script.google.com')return sendDrive(url,payload,seconds=>onWait(seconds,0));
 let error;
 for(let attempt=0;attempt<2;attempt++){
  const started=Date.now(),timer=setInterval(()=>onWait(Math.round((Date.now()-started)/1000),attempt),5000);
  try{
   const requestUrl=new URL(url);requestUrl.searchParams.set('fl_request',crypto.randomUUID());
   const res=await fetch(requestUrl.href,{method:'POST',redirect:'follow',cache:'no-store',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(payload),signal:AbortSignal.timeout(50000)});
   if(!res.ok)throw Error('Google no confirmó la carga (HTTP '+res.status+').');
   const data=await res.json();if(!data.ok)throw Object.assign(Error(data.error||'Drive rechazó la operación.'),{rejected:true});return data;
  }catch(e){error=e;if(e.rejected)break;if(attempt===0){onWait(0,1);await new Promise(r=>setTimeout(r,800));}}
  finally{clearInterval(timer);}
 }
 const suffix=' Tu diseño está guardado en este navegador. Tocá Reintentar; continuamos desde los archivos recibidos.';
 throw Error((error?.name==='TimeoutError'?'Google tardó demasiado en confirmar.':error?.message==='Failed to fetch'?'Se cortó la conexión con Google.':error?.message||'No se confirmó la carga.')+suffix);
}
async function context(engine){
 const state=engine.snapshot(),q=quote(state,config),printed=q.printQuantity>0,lines=[];
 for(const l of orderLines(state))for(const [size,quantity]of Object.entries(l.quantities)){if(!quantity)continue;const v=findVariant(config.product,l.color,size);if(!v)throw Error('Variante no disponible.');lines.push({productId:config.product.id,variantId:v.id,mode:l.mode,color:l.color,size,quantity});}
 if(!lines.length)throw Error('Elegí las cantidades de tu pedido.');
 const serialized=JSON.stringify({lines,logos:state.logos.map(({id,src,originalSrc,name,kind,view,width,height,x,y,rotation,aspect,lockAspect,presetId})=>({id,src,originalSrc,name,kind,view,width,height,x,y,rotation,aspect,lockAspect,presetId})),quote:q,product:config.product.id,geometry:config.views});
 const fingerprint=await digest(new TextEncoder().encode(serialized)),key='fl-v2-order-'+fingerprint;
 let session;try{session=JSON.parse(sessionStorage.getItem(key));}catch{}
 if(!session){session={id:crypto.randomUUID(),createdAt:new Date().toISOString(),transportVersion:3};session.token=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');sessionStorage.setItem(key,JSON.stringify(session));}
 if(!session.createdAt){session.createdAt=new Date().toISOString();sessionStorage.setItem(key,JSON.stringify(session));}
 return {state,q,printed,lines,key,session,auth:{id:session.id,token:session.token},engine};
}
function showReference(ctx){let el=$('#order-reference');if(!el){el=document.createElement('p');el.id='order-reference';el.className='small muted';$('#save-status').before(el);}el.textContent='Referencia: '+shortReference(ctx.session.id);}
async function fileEntry(name,blob){if(!blob||blob.size>12*1024*1024)throw Error(name+' supera 12 MB. Reducí la resolución o dividí el diseño en grupos.');const bytes=new Uint8Array(await blob.arrayBuffer());return {fileName:name,mime:blob.type||'application/octet-stream',base64:base64(bytes),sha256:await digest(bytes)};}
async function transfer(ctx,job){
 const {state,q,lines,session,auth,engine}=ctx;
 const progress=msg=>{job.message=msg;if(activeKey===ctx.key)text(msg);};
 const remote=(payload,message)=>{progress(message);return call(endpoint(),payload,(seconds,attempt)=>progress(attempt?'Retomando la carga, sin duplicar archivos…':message+(seconds?' · '+seconds+' s':'')));};
 progress('Verificando el carrito antes de subir…');await engine.saveLocal();await readCart();
 const logos=state.logos.map(l=>({...l,originalExtension:/^data:image\/jpeg/.test(l.originalSrc)?'jpg':/^data:image\/webp/.test(l.originalSrc)?'webp':'png'}));
 const design={slug:config.product.slug,lines,logos:logos.map(({src,originalSrc,...l})=>l),quote:{totalCents:q.totalCents,printUnits:q.printUnits},calibration:config.garment.calibration};
 if(session.transportVersion>=3)design.previewExtension='jpg';
 let opened=await remote({op:'begin',...auth,design,customerName:customerName()},'Conectando con Drive…');job.response=opened;job.savedName=customerName();
 if(opened.status==='ARCHIVOS_PENDIENTES'){
  const batched=!!opened.capabilities?.batchUpload,jpeg=!!opened.capabilities?.previewJpeg&&opened.requiredFiles?.includes('mockup.jpg');
  const fileState={...state,mode:'custom',activeColor:lines.find(l=>l.mode==='custom')?.color||lines[0].color,view:'front',selectedId:null,presetId:null,calibrationReview:false};
  const entries=[],add=async(name,make)=>{if(!opened.files?.[name])entries.push(await fileEntry(name,await make()));};
  progress('Preparando el mockup y las estampas…');
  await add('diseno.json',()=>new Blob([JSON.stringify({version:2,product:{id:config.product.id,slug:config.product.slug,name:config.product.name},configuration:{views:config.views,colors:config.colors,garment:{widthCm:config.garment.widthCm,heightCm:config.garment.heightCm,referenceSize:config.garment.referenceSize,calibration:config.garment.calibration}},state:{...fileState,logos:logos.map(({src,originalSrc,...l},i)=>({...l,originalFile:'logo_'+(i+1)+'_original.'+l.originalExtension,finalFile:'logo_'+(i+1)+'_final.png'}))},quote:q,packing:pack(logos,q.printQuantity)},null,2)],{type:'application/json'}));
  await add(jpeg?'mockup.jpg':'mockup.png',()=>engine.downloadMockup(true,fileState,{mime:jpeg?'image/jpeg':'image/png',quality:.88}));
  const normalized=new Map();
  for(let i=0;i<logos.length;i++){
   const l=logos[i];
   await add('logo_'+(i+1)+'_original.'+l.originalExtension,async()=>/^data:image\/(png|jpeg|webp);/.test(l.originalSrc)?(await fetch(l.originalSrc)).blob():png(l.originalSrc));
   // Reuse PNG bytes exactly when possible; no resizing or lossy compression.
   const getFinal=async()=>{if(!normalized.has(l.src))normalized.set(l.src,/^data:image\/png;/.test(l.src)?(await fetch(l.src)).blob():png(l.src));return normalized.get(l.src);};
   await add('logo_'+(i+1)+'_final.png',getFinal);
   if(!opened.files?.['planchas_DTF_58cm.pdf']&&!/^data:image\/png;/.test(l.src)){const blob=await getFinal();l.src=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});}
  }
  await add('planchas_DTF_58cm.pdf',()=>pdf(logos,q.printQuantity,session));
  if(batched&&entries.length){
   const batches=uploadBatches(reuseIdentical(entries,opened.files)),total=Object.keys(opened.files||{}).length+entries.length;let count=Object.keys(opened.files||{}).length;
   for(let i=0;i<batches.length;i++){
    const files=batches[i],message='Guardando '+(count+1)+'–'+(count+files.length)+' de '+total+' archivos…';
    const answer=await remote({op:'uploadBatch',...auth,files,finalize:i===batches.length-1},message);
    for(const f of files)if(answer.files?.[f.fileName]?.sha256!==f.sha256)throw Error('No se confirmó un archivo. Reintentá para continuar.');
    opened=answer;count+=files.length;
   }
  }else{
   for(let i=0;i<entries.length;i++){const f=entries[i],answer=await remote({op:'upload',...auth,...f},'Guardando archivo '+(i+1)+' de '+entries.length+'…');if(answer.files?.[f.fileName]?.sha256!==f.sha256&&answer.sha256!==f.sha256)throw Error('No se confirmó un archivo. Reintentá para continuar.');}
  }
  if(opened.status==='ARCHIVOS_PENDIENTES')opened=await remote({op:'finalize',...auth},'Confirmando tus archivos…');
 }
 if(!['PENDIENTE_DE_COMPRA','ORDEN_PENDIENTE_DE_PAGO','PAGO_CONFIRMADO','REVISAR_DIFERENCIAS','ORDEN_CANCELADA_O_REEMBOLSADA'].includes(opened.status))throw Error('Drive todavía no confirmó todos los archivos. Reintentá para continuar.');
 job.response=opened;job.ready=true;progress('✓ Archivos guardados. Listo para agregar al carrito.');
 return job;
}
async function ensurePrepared(ctx){
 activeKey=ctx.key;showReference(ctx);
 if(!ctx.printed)return null;
 if(!endpointReady())throw Error('La conexión de personalización todavía no está configurada. Tu diseño quedó guardado.');
 if(!ctx.state.logos.length||ctx.state.logos.some(l=>l.kind==='example'))throw Error('Subí tu archivo antes de confirmar. El logo de ejemplo sirve para probar.');
 let job=prepared.get(ctx.key);
 if(job){if(job.message)text(job.message);return job.promise;}
 job={ready:false,message:'',auth:ctx.auth};prepared.set(ctx.key,job);
 job.promise=queue.catch(()=>{}).then(()=>transfer(ctx,job));queue=job.promise;
 job.promise.catch(()=>{if(prepared.get(ctx.key)===job)prepared.delete(ctx.key);});
 for(const [key,other]of prepared)if(key!==ctx.key&&other.ready)prepared.delete(key);
 return job.promise;
}
export async function prepareDesign(engine){
 const ctx=await context(engine);
 if(!ctx.printed||!ctx.state.logos.length||ctx.state.logos.some(l=>l.kind==='example')||!endpointReady())return;
 try{return await ensurePrepared(ctx);}catch(error){if(activeKey===ctx.key)text('La precarga se interrumpió. Al confirmar vamos a retomar los archivos pendientes.');throw error;}
}
export async function updatePreparedCustomer(){
 const job=prepared.get(activeKey);if(!job)return;
 await job.promise;if(!job.response?.capabilities?.customerLabel)return;
 const name=customerName();if(job.pendingName===name&&job.labelPromise)return job.labelPromise;
 if((job.response.customerName||'')===name&&!job.labelPromise)return;
 job.pendingName=name;
 job.labelPromise=(job.labelPromise||Promise.resolve()).catch(()=>{}).then(async()=>{
  if((job.response.customerName||'')!==name)job.response=await call(endpoint(),{op:'label',...job.auth,customerName:name});
 });
 return job.labelPromise;
}
export function pausePreparationStatus(){activeKey='';}
export function showSubmitError(message){text(message);}
export async function submitDesign(engine){
 const ctx=await context(engine),{state,q,lines,session,auth}=ctx;await engine.saveLocal();
 text('Verificando el carrito…');await readCart();
 const job=await ensurePrepared(ctx);
 if(job?.response?.capabilities?.customerLabel){
  text('Guardando el nombre de tu pedido…');await updatePreparedCustomer();
 }
 text('Confirmando disponibilidad…');const issues=await engine.stockControl.refresh(true);
 if(issues.length)throw Error('El stock cambió. Revisá las cantidades; tus archivos siguen guardados.');
 if(quote(state,config).totalCents!==q.totalCents)throw Error('El precio cambió. Revisá el nuevo total y confirmá nuevamente.');
 const cartLines=lines.map(l=>({...l,variations:Object.values(findVariant(config.product,l.color,l.size).options||{}),properties:{'FL Tipo':l.mode==='custom'?'Con logo':'Lisa',...(l.mode==='custom'?{'FL Diseño':session.id,'FL cm2/prenda':Number(q.areaPerGarment.toFixed(6))}:{})}}));
 if(ctx.printed)cartLines.push({productId:config.service.id,variantId:config.service.variants[0].id,variations:Object.values(config.service.variants[0].options||{}),quantity:q.printUnits,properties:{'FL Tipo':'Estampado','FL Diseño':session.id}});
 const cart=await addLines(cartLines,session.id,text);
 try{if(cart.products&&typeof window.LS?.updateCart==='function')window.LS.updateCart(cart,false);for(const el of globalThis.document.querySelectorAll('.js-cart-widget-amount'))el.textContent=String((cart.products||cart.items||[]).reduce((sum,item)=>sum+Number(item.quantity||0),0));}catch(error){console.warn('[Full Liso] Abrí el carrito para ver el pedido actualizado.',error);}
 text('Tu pedido ya está en el carrito.');const link=document.createElement('a');link.href='/comprar/';link.className='primary';link.textContent='Ir al carrito →';$('#save-status').append(document.createElement('br'),link);
 // The cart hint is informational and must not hold the success screen hostage.
 if(ctx.printed)void call(endpoint(),{op:'cart',...auth,group:session.id}).catch(()=>{});
 window.dispatchEvent(new CustomEvent('fl:cart-added',{detail:{group:session.id}}));
}

// Warm the connection while the customer chooses quantities and edits the logo.
if(endpointReady()&&new URL(endpoint()).hostname==='script.google.com')void connectDrive(endpoint()).catch(()=>{});
