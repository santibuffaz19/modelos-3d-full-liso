import {apiFetch as fetch} from './storefront.mjs';
import {document} from './editor-dom.mjs';
const $=(root,s)=>root.querySelector(s);
const image=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('No se pudo abrir la imagen.'));img.src=src});
const storageKey='full-liso-ai-pending';
function pending(){try{return JSON.parse(localStorage.getItem(storageKey)||'{}')}catch{return {}}}
function rememberJob(key,job){const jobs=pending();if(job)jobs[key]=job;else delete jobs[key];try{localStorage.setItem(storageKey,JSON.stringify(jobs))}catch{}}
async function json(url,options){const r=await fetch(url,options);let b;try{b=await r.json()}catch{throw Error('La IA todavía no está habilitada en esta prueba.')}if(!r.ok)throw Object.assign(Error(b.error||'No se pudo completar la operación.'),{status:r.status});return b}
function makeDialog(id,title,body){const el=document.createElement('dialog');el.id=id;el.className='logo-tool-dialog';el.setAttribute('aria-labelledby',id+'-title');el.innerHTML=`<header class="tool-head"><div><p class="tool-eyebrow">TU LOGO</p><h2 id="${id}-title">${title}</h2></div><button class="quiet tool-close" aria-label="Cerrar ${title.toLowerCase()}">✕</button></header>${body}`;document.body.append(el);$(el,'.tool-close').onclick=()=>el.close();return el}
export function createLogoTools({onApply,onGenerate}){
 const edit=makeDialog('image-tools-dialog','Editar imagen',`
 <div class="tool-content">
  <p class="tool-intro">Prepará tu archivo y revisá cómo queda antes de usarlo.</p>
  <div class="image-tool-buttons"><button data-action="removeBg">Quitar fondo <small>IA</small></button><button data-action="upscale">Mejorar calidad <small>IA · ×2</small></button><button id="erase-tool" aria-pressed="false">Borrar detalles <small>Pincel</small></button></div>
  <p class="ai-availability small muted" role="status"></p>
  <div class="brush-options" hidden><label>Tamaño del pincel <input id="erase-size" type="range" min="3" max="80" value="20"><output>20</output></label><p class="small muted">Pasá el dedo o el mouse por lo que querés borrar. Queda transparente.</p></div>
  <div class="image-workspace"><canvas id="image-edit-canvas" aria-label="Imagen para borrar detalles"></canvas></div>
  <div class="image-secondary"><button id="image-undo" class="quiet">↶ Deshacer</button><button id="image-original" class="quiet">Ver antes</button><span id="image-resolution"></span></div>
  <p class="tool-status" role="status" aria-live="polite"></p><button class="check-job secondary" hidden>Consultar resultado</button><button id="discard-ai-result" class="quiet" hidden>Descartar este resultado</button>
  <p class="tool-disclosure">El pincel funciona sin IA. Al usar IA, esta imagen se envía a FAL. El archivo original se conserva.</p>
 </div><footer class="tool-footer"><button class="cancel-tool secondary">Cancelar</button><button id="image-apply" class="primary" disabled>Usar cambios</button></footer>`);
 const gen=makeDialog('generate-logo-dialog','Creá tu logo con IA',`
 <div class="tool-content generator-content"><p class="tool-intro">Contanos tu idea. Después podés ubicar el resultado en la prenda.</p>
 <label class="tool-field">Nombre de tu marca <input id="brand-name" maxlength="80" placeholder="Ej.: Taller Norte"></label>
 <label class="tool-field">¿Cómo te lo imaginás? <textarea id="logo-prompt" rows="3" maxlength="1200" placeholder="Un sol simple junto al nombre, en negro y amarillo, para una empresa de energía."></textarea></label>
 <label class="tool-field">Estilo <select id="logo-style"><option value="minimalist">Simple y minimalista</option><option value="typographic">Tipográfico</option><option value="badge">Emblema o escudo</option></select></label>
 <p class="ai-availability small muted" role="status"></p>
 <button id="start-generation" class="primary full" disabled>✦ Generar logo</button>
 <p class="tool-disclosure">Al generar, tu descripción se envía a FAL. Revisá las letras y los detalles del resultado.</p>
 <p class="tool-status" role="status" aria-live="polite"></p><button class="check-job secondary" hidden>Consultar resultado</button>
 <div id="generated-preview" class="generated-preview" hidden><img alt="Logo generado para revisar"><p class="small muted">Podés quitar el fondo desde «Editar imagen» después de agregarlo.</p></div>
 </div><footer class="tool-footer"><button class="cancel-tool secondary">Cerrar</button><button id="use-generated" class="primary" disabled>Usar este logo</button></footer>`);
 const c=$(edit,'canvas'),ctx=c.getContext('2d',{willReadFrequently:true});
 let selected=null,base='',snapshots=[],drawing=null,eraser=false,busy=false,dirty=false,before=false,loaded=false,available=false,run=0,genRun=0,generated=null,generating=false,genAvailable=false,readyJob=null;
 function status(dialog,message){$(dialog,'.tool-status').textContent=message}
 function update(){
  $(edit,'#image-apply').disabled=!dirty||busy||!loaded||before;$(edit,'#image-undo').disabled=!snapshots.length||busy||before;
  $(edit,'#image-original').disabled=busy||!loaded;$(edit,'#erase-tool').disabled=busy||!loaded;
  $(edit,'#erase-tool').setAttribute('aria-pressed',String(eraser));$(edit,'.brush-options').hidden=!eraser;
  c.style.cursor=eraser?'crosshair':'default';c.style.touchAction=eraser?'none':'pan-y';
  edit.querySelectorAll('[data-action]').forEach(b=>b.disabled=busy||!available||!loaded||before);
  $(edit,'#image-resolution').textContent=loaded?`${c.width} × ${c.height} px`:'';
 }
 async function put(src){const img=await image(src);if(img.width*img.height>20_000_000)throw Error('La imagen supera el tamaño admitido para editar.');c.width=img.width;c.height=img.height;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(img,0,0);loaded=true;update()}
 function snapshot(){snapshots.push({pixels:ctx.getImageData(0,0,c.width,c.height),dirty});while(snapshots.length>1&&(snapshots.length>4||snapshots.reduce((sum,s)=>sum+s.pixels.width*s.pixels.height,0)>20_000_000))snapshots.shift()}
 function undo(){const s=snapshots.pop();if(!s)return;c.width=s.pixels.width;c.height=s.pixels.height;ctx.putImageData(s.pixels,0,0);dirty=s.dirty;status(edit,'Último cambio deshecho.');update()}
 async function availability(dialog){try{const s=await json('/api/ai');$(dialog,'.ai-availability').textContent=s.available?'IA lista para usar.':s.reason||'La IA todavía no está habilitada en esta prueba.';return !!s.available}catch{$(dialog,'.ai-availability').textContent='La IA todavía no está habilitada en esta prueba.';return false}}
 function updateGenerate(){const prompt=$(gen,'#logo-prompt').value.trim();$(gen,'#start-generation').disabled=!genAvailable||generating||prompt.length<3;$(gen,'#use-generated').disabled=!generated||generating;gen.querySelectorAll('input,textarea,select').forEach(el=>el.disabled=generating)}
 async function consumeResult(dialog,job){
  if(dialog===gen){generated=job.result;$(gen,'#generated-preview img').src=generated;$(gen,'#generated-preview').hidden=false;generating=false;updateGenerate();status(gen,'Tu propuesta está lista. Revisala antes de agregarla.');return}
  const result=await image(job.result),source=job.inputImage?await image(job.inputImage):null,out=document.createElement('canvas');out.width=result.width;out.height=result.height;if(out.width*out.height>20_000_000)throw Error('El resultado supera el tamaño admitido.');if(source&&Math.abs((result.width/result.height)/(source.width/source.height)-1)>.02)throw Error('La IA cambió la proporción del archivo. Conservamos tu logo para evitar deformarlo.');const t=out.getContext('2d');t.drawImage(result,0,0);
  // ESRGAN may discard alpha. Retain the source silhouette, including erased details.
  if(job.action==='upscale'&&source){t.globalCompositeOperation='destination-in';t.drawImage(source,0,0,out.width,out.height)}
  snapshot();await put(out.toDataURL('image/png'));dirty=true;busy=false;readyJob=null;$(edit,'#discard-ai-result').hidden=true;update();status(edit,'Resultado listo. Revisalo y elegí «Usar cambios».');
 }
 async function poll(dialog,ref,key,token){
  const valid=()=>dialog.open&&token===(dialog===edit?run:genRun);
  while(valid()){
   try{const job=await json('/api/ai/jobs/'+ref.requestId);if(!valid())return;
    if(job.state==='SUCCESS'){readyJob=job;await consumeResult(dialog,job);rememberJob(key,null);$(dialog,'.check-job').hidden=true;return}
    if(['ERROR','UNKNOWN'].includes(job.state)){if(job.state==='ERROR'){rememberJob(key,null);if(dialog===edit){busy=false;update()}else{generating=false;updateGenerate()}}status(dialog,job.error||'No se pudo confirmar la operación. Consultá antes de volver a generar.');$(dialog,'.check-job').hidden=job.state==='ERROR';return}
    status(dialog,job.state==='QUEUED'?'Esperando turno…':'Procesando con IA… Podés cerrar y volver a consultar.');
   }catch(error){if(!valid())return;status(dialog,error.message);$(dialog,'.check-job').hidden=false;if(dialog===edit&&readyJob)$(edit,'#discard-ai-result').hidden=false;return}
   await new Promise(resolve=>setTimeout(resolve,2500));
  }
 }
 async function launch(dialog,input,key){
  const ref={requestId:crypto.randomUUID(),action:input.action};rememberJob(key,ref);$(dialog,'.check-job').hidden=true;
  const token=dialog===edit?run:genRun;status(dialog,'Iniciando…');
  try{await json('/api/ai/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,...ref,consent:true})});await poll(dialog,ref,key,token)}
  catch(error){const rejected=[400,403,409,413,415,422,429,503].includes(error.status);if(rejected){rememberJob(key,null);if(dialog===edit){busy=false;update()}else{generating=false;updateGenerate()}}status(dialog,error.message+(rejected?'':' Podés consultar con la misma referencia.'));$(dialog,'.check-job').hidden=rejected;}
 }
 async function openEdit(logo){
  const token=++run;selected=structuredClone(logo);base=logo.src;snapshots=[];busy=false;dirty=false;loaded=false;before=false;eraser=false;readyJob=null;available=false;$(edit,'#image-original').textContent='Ver antes';status(edit,'');$(edit,'.check-job').hidden=true;$(edit,'#discard-ai-result').hidden=true;edit.showModal();update();
  try{await put(base);if(token!==run)return;available=await availability(edit);if(token!==run)return;const ref=pending()['logo:'+logo.id];if(ref){busy=true;$(edit,'.check-job').hidden=false;poll(edit,ref,'logo:'+logo.id,token)}update()}catch(error){status(edit,error.message)}
 }
 edit.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{if(busy||!available)return;busy=true;eraser=false;update();launch(edit,{action:b.dataset.action,image:c.toDataURL('image/png')},'logo:'+selected.id)});
 $(edit,'#erase-tool').onclick=()=>{eraser=!eraser;status(edit,eraser?'Borrá sobre la imagen. Podés deshacer cada trazo.':'');update()};
 $(edit,'#erase-size').oninput=ev=>$(edit,'.brush-options output').textContent=ev.target.value;
 const point=ev=>{const rect=c.getBoundingClientRect();return {x:(ev.clientX-rect.left)*c.width/rect.width,y:(ev.clientY-rect.top)*c.height/rect.height,width:Number($(edit,'#erase-size').value)*c.width/rect.width}};
 function stroke(a,b){ctx.globalCompositeOperation='destination-out';ctx.lineWidth=a.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x+.01,b.y+.01);ctx.stroke();ctx.globalCompositeOperation='source-over'}
 c.onpointerdown=ev=>{if(!eraser||busy||before||!loaded)return;ev.preventDefault();snapshot();drawing=point(ev);c.setPointerCapture(ev.pointerId);stroke(drawing,drawing);dirty=true;update()};
 c.onpointermove=ev=>{if(!drawing)return;const next=point(ev);stroke(drawing,next);drawing=next};c.onpointerup=c.onpointercancel=()=>{drawing=null};
 $(edit,'#image-undo').onclick=undo;
 let after=null;
 $(edit,'#image-original').onclick=async()=>{if(before){c.width=after.width;c.height=after.height;ctx.putImageData(after,0,0);before=false}else{after=ctx.getImageData(0,0,c.width,c.height);await put(base);before=true}$(edit,'#image-original').textContent=before?'Ver cambios':'Ver antes';update()};
 $(edit,'#image-apply').onclick=async()=>{try{const pixels=ctx.getImageData(0,0,c.width,c.height).data;let visible=false;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>8){visible=true;break}if(!visible)throw Error('Borraste todo el logo. Deshacé el último trazo para recuperarlo.');busy=true;update();await onApply(selected.id,c.toDataURL('image/png'));edit.close()}catch(error){busy=false;update();status(edit,error.message)}};
 $(edit,'.check-job').onclick=async()=>{if(readyJob){try{await consumeResult(edit,readyJob);rememberJob('logo:'+selected.id,null)}catch(error){status(edit,error.message)}return}const ref=pending()['logo:'+selected.id];if(ref)poll(edit,ref,'logo:'+selected.id,++run)};
 $(edit,'#discard-ai-result').onclick=()=>{if(!readyJob)return;rememberJob('logo:'+selected.id,null);readyJob=null;busy=false;$(edit,'#discard-ai-result').hidden=true;$(edit,'.check-job').hidden=true;status(edit,'Resultado descartado. Tu logo se conserva.');update()};
 edit.onclose=()=>{run++;drawing=null;$(edit,'#image-apply').hidden=false};
 async function openGenerate(){genRun++;gen.showModal();genAvailable=await availability(gen);const ref=pending().generate;if(ref){generating=true;$(gen,'.check-job').hidden=false;poll(gen,ref,'generate',genRun)}else generating=false;updateGenerate()}
 gen.querySelectorAll('input,textarea,select').forEach(el=>el.oninput=updateGenerate);
 $(gen,'#start-generation').onclick=()=>{if(generating||!genAvailable)return;generated=null;generating=true;$(gen,'#generated-preview').hidden=true;updateGenerate();const name=$(gen,'#brand-name').value.trim(),description=$(gen,'#logo-prompt').value.trim(),style=$(gen,'#logo-style').value;const prompt=`Create one professional ${style} logo for garment printing. Flat colors, clear shapes, centered isolated design on a plain white background, no garment or mockup, no gradients or shadows. ${name?`Brand name, exact spelling: ${JSON.stringify(name)}.`:'No text unless requested.'} Client brief: ${description}`;launch(gen,{action:'generateImage',prompt},'generate')};
 $(gen,'.check-job').onclick=()=>{const ref=pending().generate;if(ref)poll(gen,ref,'generate',++genRun)};
 $(gen,'#use-generated').onclick=async()=>{try{generating=true;updateGenerate();await onGenerate(generated);gen.close()}catch(error){status(gen,error.message)}finally{generating=false;updateGenerate()}};
 gen.onclose=()=>{genRun++};
 for(const dialog of [edit,gen])$(dialog,'.cancel-tool').onclick=()=>dialog.close();
 return {edit:openEdit,generate:openGenerate};
}
