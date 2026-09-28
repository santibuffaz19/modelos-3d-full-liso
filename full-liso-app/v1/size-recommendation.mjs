import {mensTshirtMeasurements} from './garment-measurements.mjs';

// Initial store rule, not a validated fit model. Hem width is a provisional
// proxy for this regular-cut shirt's body width; chest/shoulder data is missing.
export const fitPolicy = Object.freeze({easeCm:8, minInputCm:50, maxInputCm:250});
export const bodyFields = ['chest','abdomen','hips'];

export function parseBodyMeasurement(raw){
  if(typeof raw!=='string'&&typeof raw!=='number')return null;
  const text=String(raw).trim();
  if(!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(text))return null;
  const value=Number(text.replace(',','.'));
  return Number.isFinite(value)&&value>=fitPolicy.minInputCm&&value<=fitPolicy.maxInputCm?value:null;
}

export function recommendSize(input,measurements=mensTshirtMeasurements){
  const body={};
  for(const key of bodyFields){
    body[key]=parseBodyMeasurement(input?.[key]);
    if(body[key]===null)throw Error('Ingresá los tres contornos completos en centímetros, entre 50 y 250.');
  }
  const largest=Math.max(...Object.values(body));
  const needed=Math.round((largest+fitPolicy.easeCm)*100);
  const entries=Object.entries(measurements.sizes).sort((a,b)=>a[1].hemWidth-b[1].hemWidth);
  const found=entries.find(([,m])=>Math.round(m.hemWidth*2*100)>=needed);
  if(!found)return {status:'outside-range',size:null,largest,easeCm:fitPolicy.easeCm};
  const [size,garment]=found,referenceRoomCm=Math.round((garment.hemWidth*2-largest)*100)/100;
  return {status:'suggestion',size,garment:{...garment},largest,easeCm:fitPolicy.easeCm,referenceRoomCm,
    extraLoose:referenceRoomCm>20,provisional:true};
}
