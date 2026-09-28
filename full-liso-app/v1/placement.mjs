// One coordinate system for the photo, drag limits and projected 3D artwork.
export function printRegion(view) {
  const [x0,y0,x1,y1]=view.bounds;
  return view.printPolygon || [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
}
export function photoPosition(logo,view) {
  return {x:view.origin[0]*1000+logo.x*view.pxPerCm,y:view.origin[1]*1000+logo.y*view.pxPerCm,w:logo.width*view.pxPerCm,h:logo.height*view.pxPerCm};
}
export function photoRect(view) {
  const [x0,y0,x1,y1]=view.bounds,p=view.pxPerCm/1000;
  return [view.origin[0]+x0*p,view.origin[1]+y0*p,view.origin[0]+x1*p,view.origin[1]+y1*p];
}
export function designToModel(point,view) {
  const [x0,y0,x1,y1]=view.bounds,[u0,v0,u1,v1]=view.modelRect;
  return {x:u0+(point.x-x0)/(x1-x0)*(u1-u0),y:v1-(point.y-y0)/(y1-y0)*(v1-v0)};
}
export function modelToPhoto(point,view) {
  const [u0,v0,u1,v1]=view.modelRect,[x0,y0,x1,y1]=photoRect(view);
  return {x:x0+(point.x-u0)/(u1-u0)*(x1-x0),y:y0+(v1-point.y)/(v1-v0)*(y1-y0)};
}
export function rotatedCorners(logo) {
  const a=logo.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[x*logo.width/2*c-y*logo.height/2*s,x*logo.width/2*s+y*logo.height/2*c]);
}
export function insidePolygon(point,polygon) {
  return polygon.every((a,i)=>{const b=polygon[(i+1)%polygon.length];return (b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0])>=-1e-7});
}
// Erode the printable polygon by the rotated logo. Every remaining point is a
// valid logo center; this keeps its corners off seams even when it is rotated.
export function centerRegion(logo,view) {
  const region=printRegion(view),corners=rotatedCorners(logo);
  let result=region.map(p=>[...p]);
  for(let i=0;i<region.length&&result.length;i++){
    const a=region[i],b=region[(i+1)%region.length],nx=a[1]-b[1],ny=b[0]-a[0];
    const limit=nx*a[0]+ny*a[1]-Math.min(...corners.map(p=>nx*p[0]+ny*p[1]));
    const clipped=[];
    for(let j=0;j<result.length;j++){
      const p=result[j],q=result[(j+1)%result.length],dp=nx*p[0]+ny*p[1]-limit,dq=nx*q[0]+ny*q[1]-limit;
      if(dp>=-1e-9)clipped.push(p);
      if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);clipped.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])])}
    }
    result=clipped;
  }
  return result;
}
export function closestPoint(point,polygon) {
  const area=polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a[0]*b[1]-b[0]*a[1]},0);
  if(Math.abs(area)>1e-9&&insidePolygon(point,polygon))return point;
  let best=point,distance=Infinity;
  polygon.forEach((a,i)=>{const b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length)):0,q=[a[0]+t*dx,a[1]+t*dy],d=(point[0]-q[0])**2+(point[1]-q[1])**2;if(d<distance){distance=d;best=q}});
  return best;
}
