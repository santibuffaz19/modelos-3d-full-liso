// Base geométrica. El adaptador de la tienda carga los precios y variantes antes de iniciar.
import {mensTshirtMeasurements as measurements} from './garment-measurements.mjs';
const reference=measurements.sizes[measurements.editorReferenceSize];
export const config = {
  version: '2.0.0-preview', currency: 'ARS', maxPrintCm: 40,
  garment: {name: 'Remera clásica', color: 'Negro', unitPrice: 7950, widthCm: reference.hemWidth,
    heightCm: reference.bodyHeight, referenceSize: measurements.editorReferenceSize,
    calibration: 'provisional', sizes: Object.keys(measurements.sizes), priceCheckedAt: '2026-09-18'},
  placementVersion: 2,
  photoHeightPx: {front:770,back:821,left:822,right:822},
  model: {asset:'./assets/remera-preview-limpia.glb',sleeve:{origin:[17,64,-1.6],axis:[0.714,-0.700,0],radial:[0.700,0.714,0],angleRange:[-1.15,1.15],lengthRange:[1.5,20.5]}},
  pricing: {unitPricePerCm2: null, applicationIncluded: true},
  colors: {
    negro: {label:'Negro', hex:'#232323', front:'assets/front.png', back:'assets/back.png', left:'assets/left-generated.png', right:'assets/right-generated.png'},
    blanco: {label:'Blanco', hex:'#f3f3f1', front:'assets/blanco-front.png', back:'assets/blanco-back.png', left:'assets/blanco-left.png', right:'assets/blanco-right.png'},
    marino: {label:'Azul marino', hex:'#142249', front:'assets/marino-front.png', back:'assets/marino-back.png', left:'assets/marino-left.png', right:'assets/marino-right.png'},
    gris_melange: {label:'Gris melange', hex:'#bfc0be', front:'assets/gris_melange-front.png', back:'assets/gris_melange-back.png', left:'assets/gris_melange-left.png', right:'assets/gris_melange-right.png'}
  },
  views: {
    front: {label:'Frente', asset:'assets/front.png', generated:false, origin:[0.5,0.28], pxPerCm:7.3, bounds:[-25,-9,25,81], modelRect:[-17.4,1.5,17.4,68.5]},
    back: {label:'Espalda', asset:'assets/back.png', generated:false, origin:[0.5,0.18], pxPerCm:7.6, bounds:[-24,-5,24,91], modelRect:[-17.4,1.8,17.4,71]},
    left: {label:'Manga izquierda', asset:'assets/left-generated.png', generated:true, origin:[0.505,0.305], pxPerCm:9, bounds:[-7.45,-14.56,11.23,10], printPolygon:[[-7.45,-6.12],[-2.56,-11.45],[2.78,-14.56],[7.78,-13.11],[11.23,-4.45],[8.78,10],[-6.5,8.78]], modelRect:[-8,51.5,8,70], zoom:{scale:2.3,center:[0.523,0.28]}},
    right: {label:'Manga derecha', asset:'assets/right-generated.png', generated:true, origin:[0.495,0.305], pxPerCm:9, bounds:[-11.23,-14.56,7.45,10], printPolygon:[[6.5,8.78],[-8.78,10],[-11.23,-4.45],[-7.78,-13.11],[-2.78,-14.56],[2.56,-11.45],[7.45,-6.12]], modelRect:[-8,51.5,8,70], zoom:{scale:2.3,center:[0.477,0.28]}}
  },
  presets: [
    {id:'chest-left', view:'front', label:'Pecho izquierdo', box:[10,10], center:[11,8]},
    {id:'chest-right', view:'front', label:'Pecho derecho', box:[10,10], center:[-11,8]},
    {id:'chest-center', view:'front', label:'Centro pequeño', box:[12,12], center:[0,10]},
    {id:'chest-band', view:'front', label:'Franja en el pecho', box:[20,5], center:[0,11]},
    {id:'front-large', view:'front', label:'Frente grande', box:[28,35], center:[0,24]},
    {id:'front-medium', view:'front', label:'Frente mediano', box:[20,20], center:[0,20], extra:true},
    {id:'front-vertical-left', view:'front', label:'Vertical izquierda', box:[12,35], center:[11,30], extra:true},
    {id:'front-vertical-right', view:'front', label:'Vertical derecha', box:[12,35], center:[-11,30], extra:true},
    {id:'front-bottom-left', view:'front', label:'Abajo a la izquierda', box:[12,8], center:[11,75], extra:true},
    {id:'front-bottom-right', view:'front', label:'Abajo a la derecha', box:[12,8], center:[-11,75], extra:true},
    {id:'back-neck', view:'back', label:'Debajo del cuello', box:[10,6], center:[0,8]},
    {id:'back-band', view:'back', label:'Espalda superior', box:[28,10], center:[0,16]},
    {id:'back-large', view:'back', label:'Espalda grande', box:[28,35], center:[0,30]},
    {id:'back-medium', view:'back', label:'Espalda mediana', box:[20,20], center:[0,30], extra:true},
    {id:'back-vertical-left', view:'back', label:'Vertical izquierda', box:[12,35], center:[-11,39], extra:true},
    {id:'back-vertical-right', view:'back', label:'Vertical derecha', box:[12,35], center:[11,39], extra:true},
    {id:'back-bottom-left', view:'back', label:'Abajo a la izquierda', box:[12,8], center:[-11,82], extra:true},
    {id:'back-bottom-right', view:'back', label:'Abajo a la derecha', box:[12,8], center:[11,82], extra:true},
    {id:'sleeve-left', view:'left', label:'Logo en manga', box:[8,8], center:[0,0]},
    {id:'sleeve-right', view:'right', label:'Logo en manga', box:[8,8], center:[0,0]}
  ]
};

// The two ends of this vertical reference belong to the garment, not the image
// canvas. Keep print centimetres independent from the amount of white margin.
// Regions and preset centers retain their photo positions when scale changes.
for(const [key,view] of Object.entries(config.views)){
  const previous=view.pxPerCm,next=config.photoHeightPx[key]/config.garment.heightCm,ratio=previous/next;
  view.previousPxPerCm=previous;view.pxPerCm=next;
  view.bounds=view.bounds.map(n=>n*ratio);
  if(view.printPolygon)view.printPolygon=view.printPolygon.map(p=>p.map(n=>n*ratio));
  config.presets.filter(p=>p.view===key).forEach(p=>p.center=p.center.map(n=>n*ratio));
}
