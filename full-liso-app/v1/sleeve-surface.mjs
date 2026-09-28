// A sleeve is unwrapped along its axis and around its circumference. A side
// projection would stretch ink by 1/cos(angle) as it approaches the front.
export const sleeveUniformNames=['sleeveOrigin','sleeveAxis','sleeveRadial','sleeveAngles','sleeveLength'];
export function sleevePanel(point,side,sleeve){
  const normalize=v=>{const n=Math.hypot(...v);return v.map(x=>x/n)},axis=normalize(sleeve.axis),radial=normalize(sleeve.radial);
  const p=[Math.abs(point[0])-sleeve.origin[0],point[1]-sleeve.origin[1],point[2]-sleeve.origin[2]];
  const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0),along=dot(p,axis),angle=Math.atan2((side==='left'?-1:1)*p[2],dot(p,radial));
  return {x:(angle-sleeve.angleRange[0])/(sleeve.angleRange[1]-sleeve.angleRange[0]),y:1-(along-sleeve.lengthRange[0])/(sleeve.lengthRange[1]-sleeve.lengthRange[0])};
}
export function sleevePanelGLSL(side){
  if(!['left','right'].includes(side))throw Error('Invalid sleeve');
  return `
    vec3 sleevePoint=vec3(abs(vPrintPosition.x),vPrintPosition.y,vPrintPosition.z)-sleeveOrigin;
    float along=dot(sleevePoint,sleeveAxis);
    float radial=dot(sleevePoint,sleeveRadial);
    float angle=atan(${side==='left'?'-':''}sleevePoint.z,radial);
    vec2 panel=vec2((angle-sleeveAngles.x)/(sleeveAngles.y-sleeveAngles.x),1.0-(along-sleeveLength.x)/(sleeveLength.y-sleeveLength.x));
  `;
}
