import {config} from './config.mjs';
import {profiles,fallbackProfile} from './product-profiles.mjs';
import {optionValue,normalize} from './stock.mjs';
import {colorPhoto} from './catalog-layout.mjs';
const baseConfig=structuredClone(config),abs=p=>new URL(p,import.meta.url).href;
const hex=n=>({negro:'#222',negrocompleto:'#222',blanco:'#f6f6f3',marino:'#152347',azulmarino:'#152347',grismelange:'#bababa',chocolate:'#633d0a',rojo:'#be3030',verde:'#4c6a41',gris:'#888',francia:'#2848ba',azul:'#48749a',beige:'#d2c2a1',rosa:'#dca1ad',amarillo:'#efca3b',unico:'#d9d4bc'})[normalize(n)]||'#d3cbc0';
const filename=s=>decodeURIComponent(s.split('/').pop()).toLowerCase();
export function configureProduct(p,service){
 const profile=profiles[p.slug]||fallbackProfile,colors={},sizes=[],prices={};
 for(const v of p.variants){const c=optionValue(v,'color')||'Único',size=optionValue(v,'size')||Object.entries(v.options).filter(([k])=>normalize(k)!=='color').map(([,v])=>v).join(' · ')||'Único';
  if(!sizes.includes(size))sizes.push(size);if(!colors[c])colors[c]={label:c,hex:hex(c)};if(!prices[c])prices[c]={};prices[c][size]=v.price;
 }
 const order=['XS','S','M','L','XL','XXL','XXXL'];sizes.sort((a,b)=>{const x=order.indexOf(a),y=order.indexOf(b);return x<0||y<0?0:x-y;});
 let views={},presets=[],missing=[];
 if(p.slug==='remera-clasica-hombre'){
  views=structuredClone(baseConfig.views);presets=structuredClone(baseConfig.presets);
  for(const [name,color]of Object.entries(colors)){
   const k=normalize(name),base=k==='azulmarino'||k==='marino'?'marino':k==='grismelange'?'gris_melange':k;
   for(const view of Object.keys(views))color[view]=baseConfig.colors[base]?abs(baseConfig.colors[base][view]):colorPhoto(p,name,p.variants.filter(v=>optionValue(v,'color')===name))||p.image;
  }
 }else{
  const common=['front','back','left'];const terms={front:/(frente|frontal)/,back:/espalda/,left:/lateral/};
  for(const [name,color]of Object.entries(colors)){
   const primary=colorPhoto(p,name,p.variants.filter(v=>(optionValue(v,'color')||'Único')===name))||p.image;
   const key=normalize(name).replace('azulmarino','marino').replace('negrocompleto','negro');
   const photos=p.images.filter(src=>name==='Único'||normalize(filename(src)).includes(key));
   color.front=photos.find(src=>terms.front.test(filename(src))&&!/modelo|lifestyle/.test(src))||primary;
   for(const view of ['back','left'])color[view]=photos.find(src=>terms[view].test(filename(src))&&!/modelo|lifestyle/.test(src))||null;
  }
  const textile=['top','polo','hoodie'].includes(profile.family),scale=800/profile.height;
  for(const view of common){
   if(view!=='front'&&!Object.values(colors).every(c=>c[view])){missing.push(view);continue;}
   const zone=profile.zone||[Math.min(profile.width*.72,42),profile.height*.64];
   views[view]={label:({front:'Frente',back:'Espalda',left:'Lateral'})[view],generated:false,origin:[.5,.55],pxPerCm:scale,bounds:[-zone[0]/2,-zone[1]/2,zone[0]/2,zone[1]/2],modelRect:[-17,4,17,68]};
   if(textile&&view!=='left'){
    const source=baseConfig.presets.filter(x=>x.view===view);presets.push(...source.map(x=>({...x,center:[Math.max(-zone[0]/2+x.box[0]/2,Math.min(zone[0]/2-x.box[0]/2,x.center[0])),Math.max(-zone[1]/2+x.box[1]/2,Math.min(zone[1]/2-x.box[1]/2,x.center[1]-22))]})).filter(x=>x.box[0]<=zone[0]&&x.box[1]<=zone[1]));
   }else{
    const w=Math.min(zone[0],40),h=Math.min(zone[1],40);presets.push({id:view+'-center',view,label:'Logo centrado',box:[Math.min(w,10),Math.min(h,10)],center:[0,0]},{id:view+'-large',view,label:'Área amplia',box:[w,h],center:[0,0]});
   }
  }
 }
 if(!presets.length)throw Error('Este producto necesita configurar su área de impresión.');
 const sv=service.variants[0];if(!sv||!Number.isFinite(sv.price)||sv.price<=0)throw Error('No se pudo verificar el precio del estampado.');
 Object.assign(config,{product:p,service,profile,colors,views,presets,garment:{...baseConfig.garment,name:p.name,color:Object.keys(colors)[0],unitPrice:p.price,widthCm:profile.width,heightCm:profile.height,referenceSize:profile.real?'L':'orientativa',sizes,prices,calibration:profile.real?'Referencia L informada por Full Liso; posición fotográfica orientativa':'Medidas provisionales'},pricing:{unitPricePerCm2:sv.price,applicationIncluded:true,wholeUnits:true},missingViews:missing});
 config.model=p.slug==='remera-clasica-hombre'?{...baseConfig.model,asset:abs('assets/remera-preview-limpia.glb')}:null;
 return config;
}
