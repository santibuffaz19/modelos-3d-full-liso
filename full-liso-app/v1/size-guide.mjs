import {document} from './editor-dom.mjs';
import {mensTshirtMeasurements as measurements} from './garment-measurements.mjs';
import {bodyFields,parseBodyMeasurement,recommendSize} from './size-recommendation.mjs';

// Read-only guide: does not change the design, quantities, price or photo scale.
export function setupSizeGuide(){
  const dialog=document.querySelector('#size-guide-dialog');
  const sizes=Object.keys(measurements.sizes);
  const picker=dialog.querySelector('.measurement-sizes');
  const selected=dialog.querySelector('#measurement-detail');
  const fields=[['hemWidth','Ancho al ruedo'],['bodyHeight','Largo total'],['sleeveLength','Largo de manga'],['sleeveWidth','Ancho de manga*'],['neckInnerWidth','Cuello interno'],['neckOuterWidth','Cuello externo']];
  const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el};
  function showSize(size){
    const values=measurements.sizes[size];
    dialog.querySelector('#measurement-size').textContent='Talle '+size;
    picker.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.textContent===size)));
    selected.replaceChildren();
    for(const [key,label] of fields){
      const item=document.createElement('div');item.className='measurement-item';
      item.append(node('dt',label),node('dd',values[key]+' cm'));selected.append(item);
    }
  }
  for(const size of sizes){
    const button=node('button',size);button.type='button';button.setAttribute('aria-label','Ver medidas del talle '+size);
    button.onclick=()=>showSize(size);picker.append(button);
    const row=document.createElement('tr'),head=node('th',size);head.scope='row';row.append(head);
    for(const key of ['hemWidth','bodyHeight'])row.append(node('td',measurements.sizes[size][key]));
    dialog.querySelector('tbody').append(row);
  }
  showSize(measurements.editorReferenceSize);
  const modeButtons=dialog.querySelectorAll('[data-guide-mode]');
  const panels=dialog.querySelectorAll('[data-guide-panel]');
  function showMode(mode){
    modeButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.guideMode===mode)));
    panels.forEach(p=>p.hidden=p.dataset.guidePanel!==mode);
    dialog.querySelector('.size-guide-content').scrollTop=0;
  }
  modeButtons.forEach(b=>b.onclick=()=>showMode(b.dataset.guideMode));
  const form=dialog.querySelector('#size-finder-form'),result=dialog.querySelector('#size-finder-result');
  const inputs=Object.fromEntries(bodyFields.map(key=>[key,form.elements.namedItem(key)]));
  const touched=new Set();let timer;
  function updateRecommendation(){
    clearTimeout(timer);
    const raw=Object.fromEntries(bodyFields.map(key=>[key,inputs[key].value]));
    const valid=bodyFields.every(key=>parseBodyMeasurement(raw[key])!==null);
    for(const key of bodyFields){
      const invalid=touched.has(key)&&parseBodyMeasurement(raw[key])===null;
      inputs[key].setAttribute('aria-invalid',String(invalid));
      dialog.querySelector('#'+key+'-error').hidden=!invalid;
    }
    result.replaceChildren();result.className='size-finder-result';
    if(!valid){result.append(node('p','Completá los tres contornos para ver tu sugerencia.'));return;}
    const answer=recommendSize(raw);
    if(answer.status==='outside-range'){
      result.classList.add('outside-range');
      result.append(node('h3','Revisemos tu talle'),node('p','Ningún talle de esta tabla deja el margen que buscamos con estas medidas. Revisá que hayas ingresado centímetros; si están bien, consultanos antes de elegir.'));
      return;
    }
    result.classList.add('has-suggestion');
    result.append(node('p','Talle sugerido'),node('strong',answer.size));
    result.append(node('p',answer.extraLoose?'Es el menor talle de la tabla y podría quedarte muy holgado. Compará sus medidas antes de elegir.':'Buscamos que te quede cómodo, con un poco de holgura.'));
    const dimensions=node('p',`Prenda: ${answer.garment.hemWidth} cm de ancho al ruedo · ${answer.garment.bodyHeight} cm de largo.`);dimensions.className='suggested-dimensions';result.append(dimensions);
    const disclaimer=node('p','Sugerencia orientativa: compará también con una remera que te quede cómoda.');disclaimer.className='suggestion-note';result.append(disclaimer);
    const button=node('button','Ver medidas del talle '+answer.size);button.type='button';button.className='secondary';
    button.onclick=()=>{showSize(answer.size);showMode('measurements');picker.querySelector('[aria-pressed="true"]').focus({preventScroll:true});};result.append(button);
  }
  for(const key of bodyFields){
    inputs[key].addEventListener('input',()=>{
      // Clear stale recommendations immediately while entering a new measurement.
      result.replaceChildren(node('p','Actualizando tu sugerencia…'));
      result.className='size-finder-result';clearTimeout(timer);timer=setTimeout(updateRecommendation,250);
    });
    inputs[key].addEventListener('blur',()=>{touched.add(key);updateRecommendation()});
  }
  form.onsubmit=ev=>{ev.preventDefault();bodyFields.forEach(key=>touched.add(key));updateRecommendation();};
  dialog.addEventListener('close',()=>{clearTimeout(timer);form.reset();touched.clear();updateRecommendation();showMode('measurements');});
  updateRecommendation();
  document.querySelector('#open-size-guide').onclick=()=>dialog.showModal();
  document.querySelector('#close-size-guide').onclick=()=>dialog.close();
}
