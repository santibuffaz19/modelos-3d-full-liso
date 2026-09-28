// Deterministic shelf packing. Centimetres, 3 mm separation, 58 × 100 cm pages.
// It never reduces a logo to make it fit. Positions on the garment are separate.
export function pack(logos,quantity,{width=58,height=100,gap=.3}={}){
 if(!Number.isInteger(quantity)||quantity<0||quantity>5000)throw Error('Cantidad no válida para las planchas.');
 const items=[];logos.forEach((l,index)=>{if(!(l.width>0&&l.height>0)||Math.max(l.width,l.height)>40)throw Error('Estampa fuera de medida.');for(let n=0;n<quantity;n++)items.push({index,width:l.width,height:l.height});});
 if(items.length>20000)throw Error('El pedido es demasiado grande para generar las planchas en el navegador.');
 items.sort((a,b)=>b.height-a.height||b.width-a.width||a.index-b.index);
 const pages=[];let page=null,x=gap,y=gap,row=0;
 for(const item of items){if(!page){page=[];pages.push(page);}if(x+item.width+gap>width){x=gap;y+=row+gap;row=0;}if(y+item.height+gap>height){page=[];pages.push(page);x=gap;y=gap;row=0;}page.push({...item,x,y});x+=item.width+gap;row=Math.max(row,item.height);}
 return {width,height,gap,pages};
}
