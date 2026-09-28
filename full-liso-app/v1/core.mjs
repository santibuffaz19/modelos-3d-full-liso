import {printRegion,rotatedCorners,insidePolygon,centerRegion,closestPoint} from './placement.mjs';
import {isExampleLogo,refreshExample} from './example-logo.mjs';
export function fitLogo(aspect, box) {
  if (!Number.isFinite(aspect) || aspect <= 0 || box.some(x=>!Number.isFinite(x)||x<=0)) throw Error('Medidas inválidas.');
  const width = Math.min(box[0], box[1] * aspect);
  return {width, height: width / aspect};
}
export function envelope(logo) {
  const radians = logo.rotation * Math.PI / 180;
  return {width:Math.abs(Math.cos(radians))*logo.width + Math.abs(Math.sin(radians))*logo.height,
    height:Math.abs(Math.sin(radians))*logo.width + Math.abs(Math.cos(radians))*logo.height};
}
export function placeInPreset(logo,preset,config) {
  const size=isExampleLogo(logo)?{width:preset.box[0],height:preset.box[1]}:fitLogo(logo.aspect,preset.box);
  const next=constrainPosition({...logo,...size,view:preset.view,x:preset.center[0],y:preset.center[1],presetId:preset.id,lockAspect:true},config);
  const error=validateLogo(next,config);if(error)throw Error(error);
  return refreshExample(next);
}
export function validateLogo(logo, config) {
  const view = config.views[logo.view];
  if (!view || ![logo.x,logo.y,logo.width,logo.height,logo.rotation].every(Number.isFinite) || logo.width<=0 || logo.height<=0) return 'Medidas inválidas.';
  const b=envelope(logo); const [x0,y0,x1,y1]=view.bounds;
  if (Math.max(logo.width,logo.height,b.width,b.height)>config.maxPrintCm+1e-7) return 'Cada estampa debe entrar en 40 × 40 cm, incluyendo el giro.';
  if (logo.x-b.width/2<x0-1e-7 || logo.x+b.width/2>x1+1e-7 || logo.y-b.height/2<y0-1e-7 || logo.y+b.height/2>y1+1e-7) return 'El logo supera la zona de impresión de esta vista.';
  if(view.printPolygon && !rotatedCorners(logo).every(([x,y])=>insidePolygon([logo.x+x,logo.y+y],printRegion(view))))return 'El logo supera la zona de impresión de esta vista.';
  return null;
}
export function constrainPosition(logo, config) {
  const view=config.views[logo.view];
  if(view.printPolygon){const region=centerRegion(logo,view);if(!region.length)return {...logo};const [x,y]=closestPoint([logo.x,logo.y],region);return {...logo,x,y}}
  const b=envelope(logo), [x0,y0,x1,y1]=view.bounds;
  return {...logo, x:Math.max(x0+b.width/2,Math.min(x1-b.width/2,logo.x)), y:Math.max(y0+b.height/2,Math.min(y1-b.height/2,logo.y))};
}
export function orderLines(state) {
  const groups=state.quantitiesByMode || {[state.mode]:state.quantitiesByColor || {negro:state.quantities}};
  const lines=[];
  for(const [mode,colors]of Object.entries(groups)){
    if(!['plain','custom'].includes(mode))throw Error('Tipo de prenda inválido.');
    for(const [color,quantities]of Object.entries(colors)){
      const values=Object.values(quantities);
      if(values.some(n=>!Number.isInteger(n)||n<0||n>999))throw Error('Cantidad inválida.');
      const quantity=values.reduce((a,b)=>a+b,0);
      if(quantity)lines.push({mode,color,quantities:{...quantities},quantity});
    }
  }
  return lines;
}
export function quote(state,config) {
  const lines=orderLines(state);
  const quantity=lines.reduce((sum,line)=>sum+line.quantity,0);
  const printQuantity=lines.filter(l=>l.mode==='custom').reduce((sum,line)=>sum+line.quantity,0);
  const plainQuantity=quantity-printQuantity;
  const logos=printQuantity>0 ? state.logos : [];
  for (const logo of logos) {const error=validateLogo(logo,config);if(error)throw Error(error);}
  // Área del rectángulo de cada archivo, después de quitar margen transparente.
  // El hueco dentro de un logo y el desperdicio de la plancha no se descuentan.
  const areaPerGarment=logos.reduce((a,l)=>a+l.width*l.height,0);
  const rate=config.pricing.unitPricePerCm2;
  const printUnits=config.pricing.wholeUnits?Math.ceil(Number((areaPerGarment*printQuantity).toFixed(6))):areaPerGarment*printQuantity;
  const printCents=Math.round(rate*100)*printUnits;
  const garmentCents=lines.reduce((sum,l)=>sum+Object.entries(l.quantities).reduce((total,[size,n])=>{const price=config.garment.prices?.[l.color]?.[size]??config.garment.unitPrice;if(n&&(!Number.isFinite(price)||price<0))throw Error('No se pudo verificar el precio.');return total+Math.round(price*100)*n;},0),0);
  return {quantity,printQuantity,plainQuantity,needsDesign:printQuantity>0&&!logos.length,areaPerGarment,totalArea:areaPerGarment*printQuantity,rate,printUnits,printCents,garmentCents,totalCents:printCents+garmentCents};
}

export function migrateState(saved,config) {
  if (!saved || ![1,2,3].includes(saved.version)) throw Error('Diseño no compatible.');
  const copy=structuredClone(saved);
  if(copy.version===1){copy.quantitiesByColor={negro:copy.quantities};delete copy.quantities;copy.activeColor='negro';copy.version=2;}
  if(!['custom','plain'].includes(copy.mode)||!config.colors[copy.activeColor] || !config.views[copy.view])throw Error('Diseño no compatible.');
  if(copy.version===2){copy.quantitiesByMode={plain:{},custom:{},[copy.mode]:copy.quantitiesByColor};delete copy.quantitiesByColor;copy.version=3;}
  if(!copy.quantitiesByMode?.plain||!copy.quantitiesByMode?.custom)throw Error('Cantidades no compatibles.');
  for(const group of Object.values(copy.quantitiesByMode))for(const [color,quantities]of Object.entries(group)){
    if(!config.colors[color])throw Error('Color no disponible.');
    if(Object.keys(quantities).some(size=>!config.garment.sizes.includes(size)))throw Error('Talle no disponible.');
  }
  const needsScale=(copy.placementVersion||1)<config.placementVersion||Object.entries(copy.photoScale||{}).some(([key,value])=>config.views[key]&&Math.abs(config.views[key].pxPerCm-value)>1e-8);
  if(needsScale){
    copy.logos=copy.logos.map(l=>{const v=config.views[l.view];if(!v)throw Error('Vista no disponible.');const previous=copy.photoScale?.[l.view]||v.previousPxPerCm;return constrainPosition({...l,x:l.x*previous/v.pxPerCm,y:l.y*previous/v.pxPerCm},config)});
    copy.placementVersion=config.placementVersion;
  }
  copy.photoScale=Object.fromEntries(Object.entries(config.views).map(([key,v])=>[key,v.pxPerCm]));
  copy.logos.forEach(l=>{if(!l.aspect)l.aspect=l.width/l.height;if(l.lockAspect===undefined)l.lockAspect=true;});
  copy.calibrationReview=false;
  for(const l of copy.logos){const error=validateLogo(l,config);if(error?.includes('zona de impresión'))copy.calibrationReview=true;else if(error)throw Error(error)}
  orderLines(copy);if(!copy.calibrationReview)quote(copy,config);return copy;
}

export function resizeCustom(logo,dimension,value,config) {
  if(logo.presetId!=='custom')throw Error('Elegí Personalizado para cambiar las medidas.');
  if(!['width','height'].includes(dimension)||!Number.isFinite(value)||value<0.3)throw Error('Ingresá una medida de al menos 0,3 cm.');
  const next={...logo,[dimension]:value};
  if(logo.lockAspect!==false){if(dimension==='width')next.height=value/logo.aspect;else next.width=value*logo.aspect;}
  const bounded=constrainPosition(next,config),error=validateLogo(bounded,config);
  if(error)throw Error(error);return refreshExample(bounded);
}

export function rotateLogo(logo,degrees,config) {
  const rotation=((Math.round(degrees)%360)+360)%360;
  const next=constrainPosition({...logo,rotation},config),error=validateLogo(next,config);
  if(error)throw Error(error);return next;
}

export function stageTransform(view,zoomed=true) {
  const z=zoomed&&view.zoom?view.zoom:{scale:1,center:[.5,.5]};
  return {scale:z.scale,x:500-z.center[0]*1000*z.scale,y:500-z.center[1]*1000*z.scale};
}
export function stageToPhoto(point,view,zoomed=true) {
  const t=stageTransform(view,zoomed);return {x:(point.x-t.x)/t.scale,y:(point.y-t.y)/t.scale};
}
