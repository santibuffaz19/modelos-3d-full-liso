import {document} from './catalog-dom.mjs';
// Front/back paper mechanics adapted from the Telas Shop reference supplied
// by the user. Desktop: Y-axis fold. Mobile: X-axis fold, top/bottom spread.
export class FlipBook {
 constructor(wrapper,book,{onChange=()=>{},onBusy=()=>{}}={}){
  this.wrapper=wrapper;this.book=book;this.onChange=onChange;this.onBusy=onBusy;
  this.media=matchMedia('(max-width:768px) and (orientation:portrait)');this.reduced=matchMedia('(prefers-reduced-motion:reduce)');
  this.papers=[];this.position=0;this.busy=false;this.drag=null;this.timer=null;this.routeTarget=null;
  book.addEventListener('pointerdown',e=>this.startDrag(e));
  book.addEventListener('pointermove',e=>this.moveDrag(e));
  book.addEventListener('pointerup',e=>this.endDrag(e));
  book.addEventListener('pointercancel',()=>this.cancelDrag());
  book.addEventListener('lostpointercapture',()=>{if(this.drag)this.cancelDrag();});
  window.addEventListener('resize',()=>this.snap());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.snap();});
 }
 get mobile(){return this.media.matches;}
 get total(){return this.papers.length;}
 get duration(){return this.reduced.matches?0:300;}
 shift(position){return position===0?-25:position===this.total?25:0;}
 transform(angle){return this.mobile?'rotateX('+angle+'deg)':'rotateY('+(-angle)+'deg)';}
 moveWrapper(shift){this.wrapper.style.transform='translate'+(this.mobile?'Y':'X')+'('+shift+'%)';}
 setPages(papers,position=0){
  clearTimeout(this.timer);this.drag=null;this.busy=false;this.routeTarget=null;this.papers=papers;this.target=null;this.position=Math.max(0,Math.min(position,papers.length));
  this.book.replaceChildren(...papers);this.paint();this.onChange(this.position);this.onBusy(false);
 }
 paint(active=-1){
  const p=this.position,n=this.total;
  this.wrapper.style.transition='none';this.moveWrapper(this.shift(p));
  this.papers.forEach((sheet,i)=>{
   sheet.style.display=Math.abs(i-p)<=2||i===active?'block':'none';
   sheet.style.zIndex=i===active?'9999':String(i<p?i+1:n-i);
   sheet.style.transition='none';sheet.style.transform=this.transform(i<p?180:0);sheet.style.setProperty('--turn-shadow','0');
   const front=sheet.firstElementChild,back=sheet.lastElementChild;
   for(const [face,visible]of [[front,i===p],[back,i===p-1]]){face.inert=!visible;face.setAttribute('aria-hidden',String(!visible));}
  });
  this.book.dataset.position=String(p);this.book.dataset.busy=String(this.busy);
 }
 lock(value){this.busy=value;this.book.dataset.busy=String(value);this.onBusy(value||this.routeTarget!=null);}
 turn(delta){return this.seek((this.routeTarget??this.target??this.position)+Math.sign(delta));}
 seek(position){
  if(!this.total)return false;
  const target=Math.max(0,Math.min(position,this.total));
  if(this.drag)this.cancelDrag();
  if(this.reduced.matches){clearTimeout(this.timer);this.target=null;this.routeTarget=null;this.position=target;this.paint();this.onChange(target);this.lock(false);return true;}
  // Repeated taps update the destination instead of being ignored/disabled.
  if(this.busy){this.routeTarget=target;this.onBusy(true);return true;}
  if(target===this.position)return false;
  this.routeTarget=target;return this.go(Math.sign(target-this.position),Math.abs(target-this.position)>1?90:this.duration);
 }
 go(delta,duration=this.duration){
  if(this.busy||!this.total)return false;
  const target=this.position+delta;if(target<0||target>this.total)return false;
  this.lock(true);const index=delta>0?this.position:this.position-1;this.paint(index);
  // Force the initial pose before applying the animated transform.
  void this.wrapper.offsetWidth;this.finishTurn(index,target,delta>0?180:0,duration);return true;
 }
 finishTurn(index,target,angle,duration=this.duration){
  const sheet=this.papers[index];
  this.lock(true);this.drag=null;
  for(const s of this.papers)for(const f of s.children)f.inert=true;
  const transition='transform '+duration+'ms cubic-bezier(.3,0,.2,1)';
  sheet.style.transition=transition;this.wrapper.style.transition=transition;
  sheet.style.transform=this.transform(angle);sheet.style.setProperty('--turn-shadow','0');this.moveWrapper(this.shift(target));
  this.target=target;
  clearTimeout(this.timer);this.timer=setTimeout(()=>{
   this.position=target;this.target=null;
   if(this.routeTarget===target)this.routeTarget=null;
   this.paint();this.onChange(this.position);this.lock(false);
   if(this.routeTarget!=null)this.go(Math.sign(this.routeTarget-this.position),Math.abs(this.routeTarget-this.position)>1?90:this.duration);
  },duration+30);
 }
 startDrag(e){
  if(this.book.dataset.ready==='false'||e.button!==0||e.target.closest('button,a,input,select,textarea,[data-no-drag]'))return;
  if(this.busy){this.snap();}
  const sheet=e.target.closest('.sheet'),index=this.papers.indexOf(sheet);if(index<0)return;
  const next=index===this.position,previous=index===this.position-1&&this.position>0;
  if(!next&&!previous)return;
  this.drag={id:e.pointerId,index,next,start:this.mobile?e.clientY:e.clientX,progress:0,moved:false};
  this.lock(true);this.paint(index);this.book.setPointerCapture(e.pointerId);e.preventDefault();
 }
 moveDrag(e){
  const d=this.drag;if(!d||e.pointerId!==d.id)return;
  const delta=(this.mobile?e.clientY:e.clientX)-d.start;
  const length=this.mobile?this.wrapper.clientHeight/2:this.wrapper.clientWidth/2;
  d.progress=Math.max(0,Math.min(1,(d.next?-delta:delta)/Math.max(1,length)));
  d.moved=d.moved||Math.abs(delta)>5;
  const angle=(d.next?d.progress:1-d.progress)*180,sheet=this.papers[d.index];
  sheet.style.transform=this.transform(angle);sheet.style.setProperty('--turn-shadow',String(Math.sin(angle*Math.PI/180)*.2));
  this.moveWrapper(this.shift(this.position)+(this.shift(this.position+(d.next?1:-1))-this.shift(this.position))*d.progress);
 }
 endDrag(e){
  const d=this.drag;if(!d||e.pointerId!==d.id)return;
  const commit=d.moved&&d.progress>.25,target=this.position+(commit?(d.next?1:-1):0);
  this.drag=null;if(this.book.hasPointerCapture(e.pointerId))this.book.releasePointerCapture(e.pointerId);
  this.finishTurn(d.index,target,d.next?(commit?180:0):(commit?0:180));
 }
 cancelDrag(){
  if(!this.drag)return;const d=this.drag;this.drag=null;
  if(this.book.hasPointerCapture(d.id))this.book.releasePointerCapture(d.id);
  this.finishTurn(d.index,this.position,d.next?0:180);
 }
 snap(){
  if(!this.papers.length)return;
  clearTimeout(this.timer);const d=this.drag;this.drag=null;
  if(d&&this.book.hasPointerCapture(d.id))this.book.releasePointerCapture(d.id);
  if(this.routeTarget!=null)this.position=this.routeTarget;
  else if(this.target!=null)this.position=this.target;
  this.routeTarget=null;this.target=null;
  this.paint();this.onChange(this.position);this.lock(false);
 }
}
