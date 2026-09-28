import {document} from './editor-dom.mjs';
import {createEditorStock} from './editor-stock.mjs';
import {createLogoTools} from './logo-tools.mjs';
import {setupSizeGuide} from './size-guide.mjs';
import {isExampleLogo,exampleArtwork} from './example-logo.mjs';
import {photoPosition,printRegion} from './placement.mjs';
import {config} from './config.mjs';
import {fitLogo,placeInPreset,validateLogo,constrainPosition,quote,orderLines,migrateState,resizeCustom,rotateLogo,stageTransform,stageToPhoto} from './core.mjs';
const $=s=>document.querySelector(s), money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n),sizeText=l=>`${l.width.toFixed(1)} × ${l.height.toFixed(1)} cm`;
if(config.profile.real)setupSizeGuide();else {$('#open-size-guide').removeAttribute('aria-haspopup');$('#open-size-guide').textContent='Medidas de referencia ↗';$('#open-size-guide').onclick=()=>notify('Referencia provisional: '+config.garment.widthCm+' cm de ancho × '+config.garment.heightCm+' cm de alto. La tabla por talle todavía está pendiente.');}
let state={version:3,placementVersion:config.placementVersion,photoScale:Object.fromEntries(Object.entries(config.views).map(([key,v])=>[key,v.pxPerCm])),mode:'custom',view:'front',activeColor:'negro',quantitiesByMode:{custom:{negro:{S:0,M:0,L:0,XL:0}},plain:{}},logos:[],selectedId:null,presetId:'chest-left'};
const stockControl=createEditorStock({getState:()=>state,config,onUpdate:()=>{renderColors();renderSummary();stockControl.render();}});
let showGuides=true;try{showGuides=localStorage.getItem(document.body.dataset.guideStorage||'full-liso-guides')!=='off'}catch{}
let history=[],drawToken=0,pendingDraw=0,saveTimer,toastTimer,drag=null,dialDrag=false,rotationError=null,zoomed=true,viewer=null,modelRun=0;
state.activeColor=Object.keys(config.colors)[0];state.quantitiesByMode={custom:{},plain:{}};state.presetId=config.presets[0].id;
const canvas=$('#stage'),ctx=canvas.getContext('2d'),cache=new Map(),editor=$('#logo-editor');
const mobileDialog=$('#mobile-editor-dialog'),preview=$('.preview'),previewHome=document.createComment('preview-home');
preview.before(previewHome);
const mobileMedia=matchMedia('(max-width:800px), (max-width:1000px) and (max-height:550px)');
function openMobileEditor(){if(!mobileMedia.matches||state.mode!=='custom'||mobileDialog.open)return;mobileDialog.showModal();document.body.classList.add('mobile-editing');$('#mobile-preview').append(preview);render();}
function renderMobileEditor(){
  $('#mobile-edit').hidden=state.mode!=='custom';
  if(!mobileDialog.open)return;
  const select=$('#mobile-logo-select');select.replaceChildren();
  if(!current())select.append(e('option',{value:''},'Elegí un logo'));
  state.logos.forEach((l,i)=>select.append(e('option',{value:l.id},`Logo ${i+1} · ${config.views[l.view].label}`)));
  select.value=state.selectedId||'';select.disabled=!state.logos.length;
  $('#mobile-empty').hidden=!!current();$('#mobile-adjustments').append(editor);
}
$('#finish-edit').onclick=()=>mobileDialog.close();
mobileDialog.onclose=()=>{previewHome.after(preview);document.body.classList.remove('mobile-editing');render();$('#mobile-edit').focus({preventScroll:true});};
mobileMedia.addEventListener('change',ev=>{if(!ev.matches&&mobileDialog.open)mobileDialog.close()});
$('#mobile-edit').onclick=()=>{if(!current()){const logo=activeLogos(state.view)[0];if(logo)state.selectedId=logo.id;}openMobileEditor()};
$('#mobile-logo-select').onchange=ev=>selectLogo(ev.target.value);
$('#mobile-add').onclick=()=>$('#file').click();
const dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(document.body.dataset.draftDatabase||'full-liso-piloto-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('design');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});dbPromise.catch(()=>{});
async function saveLocal(){const db=await dbPromise,copy=structuredClone(state);await new Promise((resolve,reject)=>{const tx=db.transaction('design','readwrite'),store=tx.objectStore('design'),old=store.get('current');old.onsuccess=()=>{if(old.result?.photoScale&&Object.entries(old.result.photoScale).some(([key,value])=>config.views[key]&&Math.abs(value-config.views[key].pxPerCm)>1e-8))store.put(old.result,'backup-before-reference-L');if(old.result&&(old.result.placementVersion||1)<config.placementVersion)store.put(old.result,'backup-before-scale-v2');if(old.result&&old.result.version<3)store.put(old.result,'backup-before-v3');store.put(copy,'current')};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});}
async function readLocal(){const db=await dbPromise;return new Promise((resolve,reject)=>{const req=db.transaction('design').objectStore('design').get('current');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function notify(message){(mobileDialog.open?mobileDialog:document.body).append($('#toast'));$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',4000)}
function remember(){history.push(structuredClone(state));if(history.length>15)history.shift()}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveLocal().catch(()=>$('#save-status').textContent='No se pudo guardar en este navegador. Descargá tu mockup.'),650)}
function changed(){render();scheduleSave()}function current(){return state.logos.find(l=>l.id===state.selectedId)}
function image(src){if(!cache.has(src))cache.set(src,new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{cache.delete(src);reject(Error('No se pudo cargar una imagen.'))};img.crossOrigin='anonymous';img.src=src}));return cache.get(src)}
function e(tag,props={},text){const el=document.createElement(tag);Object.assign(el,props);if(text!==undefined)el.textContent=text;return el}
function activeLogos(view,s=state){return s.mode==='custom'?s.logos.filter(l=>l.view===view):[]}
function position(l,view){return photoPosition(l,config.views[view])}
async function paint(target,view,{guides=false,zoom=false,labels=false,s=state}={}){
  const v=config.views[view],base=await image(config.colors[s.activeColor][view]);target.fillStyle='#fff';target.fillRect(0,0,1000,1000);target.save();const transform=stageTransform(v,zoom);target.translate(transform.x,transform.y);target.scale(transform.scale,transform.scale);const ratio=Math.min(1000/base.width,1000/base.height),bw=base.width*ratio,bh=base.height*ratio;target.drawImage(base,(1000-bw)/2,(1000-bh)/2,bw,bh);
  if(guides&&s.mode==='custom'){
    const region=printRegion(v);target.save();target.beginPath();region.forEach(([x,y],i)=>{const p=position({x,y,width:0,height:0},view);i?target.lineTo(p.x,p.y):target.moveTo(p.x,p.y)});target.closePath();target.fillStyle='rgba(241,196,15,.035)';target.fill();target.strokeStyle='rgba(241,196,15,.6)';target.lineWidth=1.5/transform.scale;target.setLineDash([7/transform.scale,7/transform.scale]);target.stroke();target.restore();
  }
  await paintArtwork(target,view,{guides,labels,s,scale:transform.scale});target.restore();
}
async function paintArtwork(target,view,{guides=false,labels=false,s=state,scale=1}={}){
  for(const logo of activeLogos(view,s)){const asset=await image(logo.src),p=position(logo,view);target.save();target.translate(p.x,p.y);target.rotate(logo.rotation*Math.PI/180);target.globalAlpha=.96;target.drawImage(asset,-p.w/2,-p.h/2,p.w,p.h);target.globalAlpha=1;
    if(guides&&logo.id===s.selectedId){target.strokeStyle='#f1c40f';target.lineWidth=2/scale;target.setLineDash([6/scale,4/scale]);target.strokeRect(-p.w/2-4,-p.h/2-4,p.w+8,p.h+8);target.setLineDash([])}target.restore();if(labels){const number=s.logos.findIndex(l=>l.id===logo.id)+1;const bx=Math.max(20,Math.min(975,p.x-p.w/2-12)),by=Math.max(22,p.y-p.h/2-18);target.fillStyle='#f1c40f';target.beginPath();target.arc(bx,by,16,0,Math.PI*2);target.fill();target.strokeStyle='#111';target.lineWidth=1;target.stroke();target.fillStyle='#111';target.font='bold 19px Arial';target.textAlign='center';target.textBaseline='middle';target.fillText(String(number),bx,by);target.textAlign='start';target.textBaseline='alphabetic'}}
}
async function makeArtwork(view,s){const c=document.createElement('canvas'),resolution=activeLogos(view,s).length?(mobileMedia.matches?1024:2048):1;c.width=c.height=resolution;const t=c.getContext('2d');t.scale(resolution/1000,resolution/1000);await paintArtwork(t,view,{s});return c}

function draw(){if(pendingDraw)return;pendingDraw=requestAnimationFrame(()=>{pendingDraw=0;drawFrame()})}
async function drawFrame(){const token=++drawToken,view=state.view,snapshot=structuredClone(state);const off=document.createElement('canvas');off.width=off.height=1000;try{await paint(off.getContext('2d'),view,{guides:showGuides,zoom:zoomed,s:snapshot});if(token===drawToken){ctx.clearRect(0,0,1000,1000);ctx.drawImage(off,0,0)}}catch(err){if(token===drawToken)notify(err.message)}}
function selectView(view){state.view=view;state.selectedId=mobileDialog.open?activeLogos(view)[0]?.id||null:null;state.presetId=config.presets.find(p=>p.view===view).id;zoomed=true;render()}
function selectLogo(id,toggle=false,open=true){const logo=state.logos.find(l=>l.id===id);if(!logo)return;state.selectedId=toggle&&state.selectedId===id?null:id;if(state.view!==logo.view)zoomed=true;state.view=logo.view;state.presetId=logo.presetId;render();if(open&&state.selectedId)openMobileEditor()}
function applyPreset(id){const l=current();if(!l)return;remember();if(id==='custom'){l.presetId='custom';state.presetId=id;$('#manual').open=true;changed();return}const p=config.presets.find(p=>p.id===id);try{Object.assign(l,placeInPreset(l,p,config));state.presetId=id;changed()}catch(error){history.pop();notify('Ese tamaño no entra con este giro. Enderezá el logo o elegí otro tamaño.')}}

function updateDial(){const angle=current()?.rotation||0,dial=$('#rotation-wheel');dial.style.setProperty('--rotation',angle+'deg');dial.setAttribute('aria-valuenow',String(Math.round(angle)));dial.setAttribute('aria-valuetext',Math.round(angle)+' grados');dial.querySelector('.dial-value').textContent=Math.round(angle)+'°'}
function presetThumbnail(p){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),v=config.views[p.view],rect=photoPosition({x:p.center[0],y:p.center[1],width:p.box[0],height:p.box[1]},v);
  svg.setAttribute('viewBox','0 0 1000 1000');svg.setAttribute('class','preset-thumbnail');svg.setAttribute('aria-hidden','true');
  svg.innerHTML=`<path d="M410 120 Q500 ${p.view==='front'?220:160} 590 120 L650 160 L775 240 L825 440 L720 470 L690 375 L700 900 L300 900 L310 375 L280 470 L175 440 L225 240 L350 160 Z" fill="#f7f7f7" stroke="#777" stroke-width="20" stroke-linejoin="round"/><rect x="${rect.x-rect.w/2}" y="${rect.y-rect.h/2}" width="${rect.w}" height="${rect.h}" rx="9" fill="#f1c40f" stroke="#665400" stroke-width="8"/>`;
  return svg;
}
function renderEditor(){const l=current();editor.hidden=!l;if(!l)return;
  const presets=$('#presets'),extras=$('#extra-presets'),custom=$('#custom-presets'),more=$('#more-presets'),available=config.presets.filter(p=>p.view===l.view);
  presets.replaceChildren();extras.replaceChildren();custom.replaceChildren();more.hidden=!available.some(p=>p.extra);
  if(more.dataset.logo!==l.id||more.dataset.view!==l.view)more.open=available.some(p=>p.id===l.presetId&&p.extra);
  else if(more.dataset.preset!==l.presetId&&available.some(p=>p.id===l.presetId&&p.extra))more.open=true;
  more.dataset.logo=l.id;more.dataset.view=l.view;more.dataset.preset=l.presetId;
  for(const p of [...available,{id:'custom',label:'Personalizado',box:null}]){
    const b=e('button',{className:'preset-option'}),copy=e('span',{className:'preset-copy'});b.dataset.preset=p.id;b.setAttribute('aria-pressed',String(p.id===l.presetId));
    if(p.box&&['top','hoodie','polo'].includes(config.profile.family)&&['front','back'].includes(p.view))b.append(presetThumbnail(p));
    copy.append(e('strong',{},p.label),e('span',{},p.box?`Hasta ${p.box[0]} × ${p.box[1]} cm`:'Elegí ancho y alto'));b.append(copy);
    b.onclick=()=>{applyPreset(p.id);editor.querySelector(`[data-preset="${p.id}"]`)?.focus({preventScroll:true})};
    (p.id==='custom'?custom:p.extra?extras:presets).append(b);
  }
  for(const key of ['width','height']){$('#'+key).value=Number(l[key].toFixed(2));$('#'+key).disabled=l.presetId!=='custom'}
  $('#proportion-label').hidden=l.presetId!=='custom';$('#lock-aspect').checked=l.lockAspect!==false;$('#size-help').textContent=l.presetId==='custom'?'Elegí tus medidas. Podés mantener la proporción del logo.':`Tamaño aplicado: ${sizeText(l)}. Para cambiarlo, elegí «Personalizado».`;updateDial();
}
function quantityGroup(s=state){return s.quantitiesByMode[s.mode]}
function groupName(mode){return mode==='custom'?'Con logo':'Lisas'}
function ensureQuantities(){const group=quantityGroup();if(!group[state.activeColor])group[state.activeColor]=Object.fromEntries(config.garment.sizes.map(size=>[size,0]));return group[state.activeColor]}
function renderSummary(){
  try{
    const q=quote(state,config),lines=orderLines(state),groups=$('#order-breakdown');groups.replaceChildren();
    for(const mode of ['custom','plain']){
      const groupLines=lines.filter(line=>line.mode===mode);if(!groupLines.length)continue;
      const section=e('section',{className:'order-group'}),n=groupLines.reduce((a,l)=>a+l.quantity,0),heading=e('div',{className:'order-group-title'});
      heading.append(e('strong',{},mode==='custom'?'Con tu logo':'Lisas'),e('span',{},n+' '+(n===1?'prenda':'prendas')));section.append(heading);
      for(const line of groupLines){const row=e('p',{className:'order-variant'}),dot=e('span',{className:'order-dot'});dot.style.background=config.colors[line.color].hex;row.append(dot,e('strong',{},config.colors[line.color].label),e('span',{},Object.entries(line.quantities).filter(([,n])=>n>0).map(([size,n])=>size+' × '+n).join(' · ')));section.append(row)}
      groups.append(section);
    }
    $('#totals').replaceChildren();
    const rows=[[`${q.quantity} ${q.quantity===1?'prenda':'prendas'}`,money(q.garmentCents/100)]];
    if(q.printQuantity)rows.push([`Estampado · ${q.printQuantity} ${q.printQuantity===1?'prenda':'prendas'}`,q.needsDesign?'Falta tu logo':money(q.printCents/100)]);
    rows.push([q.needsDesign?'Subtotal sin estampado':'Total',money(q.totalCents/100)]);
    for(const[label,value]of rows){const row=e('div');row.append(e('span',{},label),e('span',{},value));$('#totals').append(row)}
    $('#design-required').hidden=!q.needsDesign;$('#save').disabled=!q.quantity||q.needsDesign;
    $('#sticky-count').textContent=`${q.quantity} ${q.quantity===1?'prenda':'prendas'} · ${q.printQuantity} con logo · ${q.plainQuantity} lisas`;
    $('#sticky-total').textContent=money(q.totalCents/100);
    $('#review').textContent=!q.quantity?'Elegir cantidades ↑':q.needsDesign?'Agregar mi logo ↑':'Ver mi pedido →';
    for(const mode of ['custom','plain'])$(`[data-mode-count="${mode}"]`).textContent=String(mode==='custom'?q.printQuantity:q.plainQuantity);
    stockControl.render();
  }catch(err){notify(err.message);$('#save').disabled=true;$('#order-breakdown').replaceChildren();$('#totals').replaceChildren(e('p',{className:'design-required'},'Revisá el tamaño o la ubicación de los logos para completar tu pedido.'));$('#sticky-total').textContent='Revisar diseño';$('#sticky-count').textContent='Un logo necesita ajuste';$('#review').textContent='Ajustar logo ↑'}
}
function renderColors(){
  const color=config.colors[state.activeColor],group=quantityGroup(),quantities=group[state.activeColor]||{};
  $('#color-caption').textContent=color.label+' · '+(config.profile.real?'Referencia talle L':'Medidas orientativas');$('#size-legend').textContent=(config.garment.sizes.length===1?'Cantidad en ':'Talles en ')+color.label.toLowerCase();
  $('#quantity-kind').textContent=state.mode==='custom'?'CON TU LOGO':'LISAS, SIN ESTAMPA';
  const count=Object.values(quantities).reduce((a,b)=>a+b,0);$('#color-count').textContent=count+' '+(count===1?'prenda':'prendas');
  $('#group-help').textContent=state.mode==='custom'?'Estas prendas llevan el diseño que armes abajo.':'Estas prendas se suman sin estampa. Tu diseño queda guardado.';
  for(const b of $('#colors').children)b.setAttribute('aria-pressed',String(b.dataset.color===state.activeColor));
  $('#color-order').replaceChildren();
  for(const [key,qs]of Object.entries(group)){const n=Object.values(qs).reduce((a,b)=>a+b,0);if(n){const b=e('button',{className:'color-chip'}),dot=e('span',{className:'chip-dot'});dot.style.background=config.colors[key].hex;b.append(dot,document.createTextNode(config.colors[key].label),e('strong',{},String(n)));b.setAttribute('aria-pressed',String(key===state.activeColor));b.onclick=()=>chooseColor(key);$('#color-order').append(b)}}
  for(const size of config.garment.sizes){const n=quantities[size]||0,input=$(`[data-size="${size}"]`);input.value=n;input.closest('.size-card').classList.toggle('has-quantity',n>0);$(`[data-minus="${size}"]`).disabled=n===0;$(`[data-plus="${size}"]`).disabled=n===999;input.setAttribute('aria-label',`Cantidad talle ${size}, ${color.label}, ${groupName(state.mode).toLowerCase()}`)}
  stockControl.render();
}
function chooseColor(key){state.activeColor=key;ensureQuantities();changed()}
function chooseMode(mode){remember();state.mode=mode;ensureQuantities();changed()}
function setQuantity(size,value){const stockError=stockControl.check(size,value);if(stockError){notify(stockError);renderColors();return}remember();ensureQuantities()[size]=value;renderColors();renderSummary();scheduleSave()}
function render(){
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(state.mode===b.dataset.mode)));$('#design-controls').hidden=state.mode==='plain';$('#summary .step-number').textContent=state.mode==='plain'?'2':'3';
  for(const [view]of Object.entries(config.views))$(`[data-view="${view}"]`).setAttribute('aria-pressed',String(view===state.view));$('#view-note').textContent=!config.profile.real?'Foto del catálogo · escala orientativa':config.views[state.view].generated?'Vista generada · referencia talle '+config.garment.referenceSize:'Foto del catálogo · referencia talle '+config.garment.referenceSize;$('#preview-caption').textContent=`${config.views[state.view].label} · ${config.colors[state.activeColor].label} · ${groupName(state.mode)} · ${config.profile.real?'Talle '+config.garment.referenceSize:'Escala orientativa'}`;
  const selected=current(),demo=state.mode==='custom'&&selected?.view===state.view&&isExampleLogo(selected);$('#view-note').classList.toggle('example-measure',!!demo);if(demo){const preset=config.presets.find(p=>p.id===selected.presetId);$('#view-note').textContent=`Ejemplo · ${preset?.label||'Personalizado'} · ${sizeText(selected)}`;}
  $('#guide-toggle').setAttribute('aria-checked',String(showGuides));$('#guide-toggle').hidden=state.mode==='plain';$('#zoom-toggle').hidden=!config.views[state.view].zoom;$('#zoom-toggle').textContent=zoomed?(mobileMedia.matches?'Ver completa':'Ver prenda completa'):'Acercar manga';canvas.style.touchAction=state.mode==='custom'&&current()?'none':'pan-y';const list=$('#logo-list');editor.remove();list.replaceChildren();
  state.logos.forEach((l,i)=>{
    const selected=l.id===state.selectedId,row=e('div',{className:'logo-row-shell'+(selected?' selected':'')}),b=e('button',{className:'logo-row'});
    b.setAttribute('aria-expanded',String(selected));b.setAttribute('aria-controls','logo-editor');
    const copy=e('span',{className:'row-copy'});copy.append(e('strong',{},`Logo ${i+1} · ${config.views[l.view].label}`),e('small',{},`${sizeText(l)} · ${l.presetId==='custom'?'Personalizado':config.presets.find(p=>p.id===l.presetId)?.label||'Ubicación'}`));
    b.append(e('img',{src:l.src,alt:''}),copy,e('span',{className:'row-chevron'},selected?'⌃':'⌄'));
    b.onclick=()=>selectLogo(l.id,!mobileMedia.matches);
    const edit=e('button',{className:'image-edit-button',disabled:!selected,title:'Editar la imagen del logo'},'✎');
    edit.setAttribute('aria-label',`Editar imagen del logo ${i+1}`);edit.onclick=()=>logoTools.edit(l);
    row.append(b,edit);list.append(row);if(selected&&!mobileDialog.open)list.append(editor);
  });if(!current()){$('#design-controls').append(editor);editor.hidden=true}renderMobileEditor();renderEditor();renderColors();renderSummary();draw();
}
async function addLogo(src,name,original=src,options={}){if(state.logos.length>=24)throw Error('Podés agregar hasta 24 logos por diseño.');const img=await image(src),p=config.presets.find(p=>p.id===options.presetId&&p.view===state.view)||config.presets.find(p=>p.view===state.view),aspect=img.width/img.height;const l={id:crypto.randomUUID(),kind:options.kind,name,src,originalSrc:original,aspect,view:state.view,...fitLogo(aspect,p.box),x:p.center[0],y:p.center[1],rotation:0,presetId:p.id,lockAspect:true};const error=validateLogo(l,config);if(error)throw Error(error);remember();state.logos.push(l);state.selectedId=l.id;state.presetId=p.id;state.mode='custom';$('#manual').open=false;changed();openMobileEditor();notify('Logo agregado. Arrastralo en la prenda o elegí una ubicación.')}
async function trimAlpha(src){const img=await image(src);if(img.width*img.height>20000000)throw Error('Usá una imagen de hasta 20 megapíxeles.');const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const cctx=c.getContext('2d',{willReadFrequently:true});cctx.drawImage(img,0,0);const data=cctx.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=-1,y1=-1;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){if(data[(y*c.width+x)*4+3]>8){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}}if(x1<0)throw Error('La imagen es completamente transparente.');if(x0===0&&y0===0&&x1===c.width-1&&y1===c.height-1)return src;const out=document.createElement('canvas');out.width=x1-x0+1;out.height=y1-y0+1;out.getContext('2d').drawImage(c,x0,y0,out.width,out.height,0,0,out.width,out.height);return out.toDataURL('image/png')}
for(const [view,v]of Object.entries(config.views)){const b=e('button',{},v.label);b.dataset.view=view;b.onclick=()=>selectView(view);$('#views').append(b)}
for(const [key,color]of Object.entries(config.colors)){const b=e('button');b.dataset.color=key;b.append(e('span',{className:'swatch'}),e('span',{},color.label));b.firstChild.style.background=color.hex;b.setAttribute('aria-label','Color '+color.label);b.onclick=()=>chooseColor(key);$('#colors').append(b)}
for(const size of config.garment.sizes){
  const card=e('div',{className:'size-card'}),label=e('label',{htmlFor:'qty-'+size,className:'size-name'},size),stepper=e('div',{className:'quantity-stepper'}),minus=e('button',{type:'button'},'−'),plus=e('button',{type:'button'},'+'),input=e('input',{id:'qty-'+size,type:'text',inputMode:'numeric',pattern:'[0-9]*',maxLength:3,value:ensureQuantities()[size]||0});
  input.dataset.size=size;minus.dataset.minus=size;plus.dataset.plus=size;
  minus.setAttribute('aria-label','Quitar una talle '+size);plus.setAttribute('aria-label','Sumar una talle '+size);
  input.onchange=()=>{const raw=input.value.trim();setQuantity(size,/^\d{1,3}$/.test(raw)?Number(raw):NaN)};
  input.onkeydown=ev=>{if(['ArrowUp','ArrowDown'].includes(ev.key)){ev.preventDefault();setQuantity(size,Math.max(0,Math.min(999,(quantityGroup()[state.activeColor]?.[size]||0)+(ev.key==='ArrowUp'?1:-1))))}};
  minus.onclick=()=>setQuantity(size,(quantityGroup()[state.activeColor]?.[size]||0)-1);plus.onclick=()=>setQuantity(size,(quantityGroup()[state.activeColor]?.[size]||0)+1);
  stepper.append(minus,input,plus);card.append(label,stepper);$('#sizes').append(card);
}
$('.product-info strong').textContent=config.garment.name;$('#unit-price').textContent=money(config.garment.unitPrice);document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>chooseMode(b.dataset.mode));$('#upload').onclick=()=>$('#file').click();
$('#file').onchange=async ev=>{const input=ev.target,file=input.files[0];if(!file)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024)throw Error('Elegí un PNG, JPG o WebP de hasta 12 MB.');const original=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('No se pudo leer el archivo.'));r.readAsDataURL(file)});await addLogo(await trimAlpha(original),file.name,original)}catch(err){notify(err.message)}finally{input.value=''}};
$('#example').onclick=()=>{const p=config.presets.find(p=>p.id===state.presetId&&p.view===state.view)||config.presets.find(p=>p.view===state.view),art=exampleArtwork(...p.box);addLogo(art.src,'Logo de ejemplo',art.src,{kind:'example',presetId:p.id}).catch(err=>notify(err.message))};

for(const key of ['width','height'])$('#'+key).onchange=()=>{const l=current();if(!l)return;try{const next=resizeCustom(l,key,Number($('#'+key).value),config);remember();Object.assign(l,next);changed()}catch(err){notify(err.message);renderEditor()}};
$('#lock-aspect').onchange=()=>{const l=current();if(!l)return;const checked=$('#lock-aspect').checked;try{const next=checked?resizeCustom({...l,lockAspect:true},'width',l.width,config):{...l,lockAspect:false};remember();Object.assign(l,next);changed()}catch(err){$('#lock-aspect').checked=l.lockAspect!==false;notify(err.message)}};
function setAngle(degrees){const l=current();if(!l)return;try{Object.assign(l,rotateLogo(l,degrees,config));rotationError=null;updateDial();draw();scheduleSave()}catch(err){rotationError=err.message;if(!dialDrag)notify(err.message)}}
const dial=$('#rotation-wheel');function angleAt(ev){const r=dial.getBoundingClientRect();return Math.atan2(ev.clientX-r.left-r.width/2,-(ev.clientY-r.top-r.height/2))*180/Math.PI}dial.onpointerdown=ev=>{if(!current())return;remember();dialDrag=true;dial.setPointerCapture(ev.pointerId);ev.preventDefault();setAngle(angleAt(ev))};dial.onpointermove=ev=>{if(dialDrag)setAngle(angleAt(ev))};dial.onpointerup=dial.onpointercancel=()=>{dialDrag=false;if(rotationError)notify(rotationError);renderEditor();scheduleSave()};dial.onkeydown=ev=>{if(!current())return;const steps={ArrowRight:5,ArrowUp:5,ArrowLeft:-5,ArrowDown:-5};if(ev.key in steps||ev.key==='Home'){ev.preventDefault();remember();setAngle(ev.key==='Home'?0:current().rotation+steps[ev.key])}};
$('#reset-rotation').onclick=()=>{if(current()){remember();setAngle(0)}};$('#duplicate').onclick=()=>{const l=current();if(!l)return;if(state.logos.length>=24)return notify('Podés agregar hasta 24 logos por diseño.');remember();const n={...l,id:crypto.randomUUID()};state.logos.push(n);state.selectedId=n.id;changed();notify('Logo duplicado. Elegí dónde va o arrastralo.')};$('#remove').onclick=()=>{remember();state.logos=state.logos.filter(l=>l.id!==state.selectedId);state.selectedId=null;changed()};$('#guide-toggle').onclick=()=>{showGuides=!showGuides;try{localStorage.setItem(document.body.dataset.guideStorage||'full-liso-guides',showGuides?'on':'off')}catch{}$('#guide-toggle').setAttribute('aria-checked',String(showGuides));draw()};$('#zoom-toggle').onclick=()=>{zoomed=!zoomed;render()};$('#see-placement').onclick=()=>$('.preview').scrollIntoView({behavior:'smooth',block:'start'});
function point(ev){const r=canvas.getBoundingClientRect();return stageToPhoto({x:(ev.clientX-r.left)*1000/r.width,y:(ev.clientY-r.top)*1000/r.height},config.views[state.view],zoomed)}
canvas.onpointerdown=ev=>{if(state.mode!=='custom')return;const p=point(ev),hitPad=(ev.pointerType==='touch'?22:8)*1000/canvas.getBoundingClientRect().width/stageTransform(config.views[state.view],zoomed).scale;const hit=[...activeLogos(state.view)].reverse().find(l=>{const c=position(l,state.view),angle=-l.rotation*Math.PI/180,dx=p.x-c.x,dy=p.y-c.y;return Math.abs(dx*Math.cos(angle)-dy*Math.sin(angle))<=Math.max(c.w/2+4,hitPad)&&Math.abs(dx*Math.sin(angle)+dy*Math.cos(angle))<=Math.max(c.h/2+4,hitPad)});if(hit){remember();selectLogo(hit.id,false,false);drag={id:hit.id,start:p,x:hit.x,y:hit.y,moved:false};canvas.setPointerCapture(ev.pointerId);ev.preventDefault()}else if(current()&&!mobileDialog.open){state.selectedId=null;render()}};canvas.onpointermove=ev=>{if(!drag)return;const l=current(),p=point(ev),v=config.views[state.view];if(!l)return;if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>3)drag.moved=true;Object.assign(l,constrainPosition({...l,x:drag.x+(p.x-drag.start.x)/v.pxPerCm,y:drag.y+(p.y-drag.start.y)/v.pxPerCm},config));draw()};function endDrag(){if(drag){const tapped=!drag.moved;drag=null;renderEditor();scheduleSave();if(tapped&&mobileMedia.matches)openMobileEditor()}}canvas.onpointerup=endDrag;canvas.onpointercancel=endDrag;
canvas.onkeydown=ev=>{const l=current();if(state.mode!=='custom'||!l)return;const moves={ArrowLeft:[-.5,0],ArrowRight:[.5,0],ArrowUp:[0,-.5],ArrowDown:[0,.5]};if(moves[ev.key]){ev.preventDefault();remember();const [x,y]=moves[ev.key];Object.assign(l,constrainPosition({...l,x:l.x+x,y:l.y+y},config));draw();scheduleSave()}};
$('#save').onclick=async()=>{try{await saveLocal();$('#save-status').textContent='Guardado en este navegador. Podés recuperarlo al volver.';notify('Diseño guardado.')}catch{$('#save-status').textContent='No se pudo guardar en este navegador.'}};$('#restore').onclick=async()=>{try{const saved=await readLocal();if(!saved)return notify('Todavía no hay un diseño guardado.');const migrated=migrateState(saved,config);remember();state=migrated;render();notify(migrated.calibrationReview?'Diseño recuperado. Un logo necesita ajustarse a la nueva escala; conservamos sus medidas y el borrador anterior.':(saved.placementVersion||1)<config.placementVersion?'Diseño recuperado con la escala actualizada. Revisá las ubicaciones; las medidas de tus logos se conservaron.':'Diseño recuperado, con sus colores y cantidades.')}catch(err){notify('No se pudo recuperar: '+err.message)}};$('#review').onclick=async()=>{if(Object.values(state.quantitiesByMode).some(group=>Object.values(group).some(qs=>Object.values(qs).some(n=>n>0)))){const issues=await stockControl.refresh(true);if(issues.length){const issue=issues[0];chooseColor(issue.color);if(!(quantityGroup()[issue.color]?.[issue.size]>0))chooseMode(state.mode==='plain'?'custom':'plain');$('.quantity-field').scrollIntoView({behavior:'smooth',block:'center'});notify('Revisá el stock antes de continuar.');return;}}const invalid=state.logos.find(l=>validateLogo(l,config));if(invalid){chooseMode('custom');selectLogo(invalid.id);if(!mobileDialog.open)editor.scrollIntoView({behavior:'smooth',block:'center'});return}if(!quote(state,config).quantity){$('.quantity-field').scrollIntoView({behavior:'smooth',block:'center'});return}if(quote(state,config).needsDesign){chooseMode('custom');$('#file').click()}else $('#summary').scrollIntoView({behavior:'smooth',block:'center'})};
async function downloadMockup(exportOnly=false,suppliedState=state,{mime='image/png',quality=.88}={}){const button=$('#download');button.disabled=true;const s=structuredClone(suppliedState);if(exportOnly)s.mode='custom';const logos=s.mode==='custom'?s.logos:[],lines=orderLines(s);try{const result=document.createElement('canvas');result.width=2000;result.height=2380+Math.max(1,logos.length)*55+lines.length*32;const t=result.getContext('2d');t.fillStyle='white';t.fillRect(0,0,result.width,result.height);t.fillStyle='#171717';t.font='bold 45px Arial';t.fillText('FULL LISO · '+config.colors[s.activeColor].label+' · '+groupName(s.mode),45,65);t.font='24px Arial';t.fillStyle='#666';t.fillText('Mockup orientativo · referencia talle '+config.garment.referenceSize+' · estampas en cm · no es un archivo de impresión',45,108);let i=0;for(const view of Object.keys(config.views)){const x=(i%2)*1000,y=Math.floor(i/2)*1030+145;t.save();t.translate(x,y);await paint(t,view,{s,labels:true});t.restore();t.fillStyle='#171717';t.font='22px Arial';t.fillText(config.views[view].label+(config.views[view].generated?' · vista generada':''),x+30,y+1015);i++}t.fillStyle='#f1c40f';t.fillRect(35,2220,1930,45);t.fillStyle='#171717';t.font='bold 24px Arial';t.fillText('DETALLE DE ESTAMPAS · ancho × alto',55,2252);t.font='23px Arial';if(!logos.length)t.fillText('Prenda lisa, sin estampas.',55,2300);logos.forEach((l,j)=>{const preset=l.presetId==='custom'?'Personalizado':config.presets.find(p=>p.id===l.presetId)?.label||'';t.fillText(`Logo ${j+1} · ${config.views[l.view].label} · ${preset} · ${sizeText(l)} · Giro ${Math.round(l.rotation)}°`,55,2300+j*55)});const total=quote(s,config);t.fillStyle='#666';t.font='20px Arial';lines.forEach((line,j)=>{const sizes=Object.entries(line.quantities).filter(([,n])=>n>0).map(([size,n])=>`${size} × ${n}`).join(', ');t.fillText(`${groupName(line.mode)} · ${config.colors[line.color].label}: ${sizes}`,45,result.height-65-(lines.length-1-j)*32)});t.fillText(`Pedido: ${total.quantity} prendas · ${total.printQuantity} con logo · ${total.plainQuantity} lisas · ${total.needsDesign?'Estampado pendiente de logo':'Estampado '+money(total.printCents/100)} · Planchado incluido`,45,result.height-22);const blob=await new Promise(resolve=>result.toBlob(resolve,exportOnly?mime:'image/png',quality));if(exportOnly)return blob;if(!blob)throw Error('No se pudo generar el mockup.');const url=URL.createObjectURL(blob);e('a',{href:url,download:`full-liso-${s.activeColor}-${s.mode}-mockup-medidas.png`}).click();setTimeout(()=>URL.revokeObjectURL(url),10000);notify('Mockup con medidas descargado.')}catch(err){if(exportOnly)throw err;notify(err.message)}finally{button.disabled=false}};$('#download').onclick=()=>downloadMockup(false);
$('#view3d').hidden=!config.model;$('#view3d').onclick=async()=>{if(!config.model)return;const run=++modelRun;$('#model-dialog').showModal();$('#model-color').textContent=config.colors[state.activeColor].label+' · '+groupName(state.mode)+' · Referencia talle '+config.garment.referenceSize;$('#model-loading').textContent='Preparando tu prenda…';try{const {createViewer}=await import('./viewer3d.mjs');if(run!==modelRun)return;const created=await createViewer($('#model-stage'),structuredClone(state),config,makeArtwork);if(run!==modelRun){created.dispose();return}viewer=created;$('#model-loading').textContent=viewer.applied===viewer.requested?`${viewer.applied} ${viewer.applied===1?'logo aplicado':'logos aplicados'}`:`${viewer.applied} de ${viewer.requested} logos aplicados; hay ubicaciones para revisar.`;}catch(err){if(run===modelRun)$('#model-loading').textContent='No se pudo abrir el 3D: '+err.message}};$('#close-3d').onclick=()=>$('#model-dialog').close();$('#model-dialog').onclose=()=>{modelRun++;viewer?.dispose();viewer=null;$('#model-stage').replaceChildren()};
document.addEventListener('keydown',ev=>{if(document.body.dataset.submitting==='true')return;if(document.querySelector('.logo-tool-dialog[open]')||$('#size-guide-dialog')?.open)return;if((ev.ctrlKey||ev.metaKey)&&ev.key==='z'&&!['INPUT','TEXTAREA'].includes(ev.target.tagName)&&history.length&&!$('#model-dialog').open){ev.preventDefault();state=history.pop();changed()}});render();void stockControl.refresh();

const logoTools=createLogoTools({
  onApply:async(id,src)=>{const logo=state.logos.find(l=>l.id===id);if(!logo)throw Error('Ese logo ya no está en el diseño.');const editedImage=await image(src);remember();Object.assign(logo,{src,kind:'upload',aspect:editedImage.width/editedImage.height,name:isExampleLogo(logo)?'Logo editado':logo.name});changed();notify('Cambios aplicados. Se conservaron el tamaño y la ubicación.');},
  onGenerate:async(src)=>{await addLogo(await trimAlpha(src),'Logo creado con IA',src,{kind:'generated'});}
});
$('#mobile-image-edit').onclick=()=>{if(current())logoTools.edit(current())};
$('#generate-logo').onclick=()=>logoTools.generate();

export function snapshot(){return structuredClone(state);}
export {downloadMockup,saveLocal,stockControl,notify};
