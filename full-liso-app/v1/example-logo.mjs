export function isExampleLogo(logo) {
  return logo?.kind==='example'||(logo?.name==='Logo de ejemplo'&&logo.src?.startsWith('data:image/svg+xml;'));
}

export function exampleArtwork(width,height) {
  if(![width,height].every(n=>Number.isFinite(n)&&n>0&&n<=40))throw Error('Medidas inválidas.');
  const w=width*60,h=height*60,short=Math.min(w,h),pad=short*.09;
  const format=n=>Number(n.toFixed(1)).toLocaleString('es-AR');
  const label=`${format(width)} × ${format(height)} cm`,wide=w/h>=2.4;
  const icon=wide?h*.60:Math.min(w*.40,h*.33),ix=wide?pad:(w-icon)/2,iy=wide?(h-icon)/2:h*.13;
  const textX=wide?ix+icon+pad:w/2,anchor=wide?'start':'middle';
  const brandSize=wide?Math.min(h*.25,(w-textX-pad)/5.4):Math.min(w*.115,h*.12);
  const sizeSize=wide?Math.min(h*.22,(w-textX-pad)/label.length*1.65):Math.min(w*.11,h*.10);
  const brandY=wide?h*.43:h*.66,sizeY=wide?h*.74:h*.84;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" rx="${short*.045}" fill="#f1c40f"/>
    <g transform="translate(${ix} ${iy}) scale(${icon/100})" fill="#171717"><path d="M0 0h47v36h43v31H47v33H0z"/><path d="M61 0h39v27H61z"/></g>
    <g fill="#171717" font-family="Arial,sans-serif" text-anchor="${anchor}"><text x="${textX}" y="${brandY}" font-size="${brandSize}" font-weight="800">TU MARCA</text><text x="${textX}" y="${sizeY}" font-size="${sizeSize}" font-weight="700">${label}</text></g>
  </svg>`;
  return {src:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg),aspect:width/height};
}

export function refreshExample(logo) {
  if(!isExampleLogo(logo))return logo;
  const artwork=exampleArtwork(logo.width,logo.height);
  return {...logo,...artwork,kind:'example',originalSrc:artwork.src};
}
