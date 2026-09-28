import {document} from './editor-dom.mjs';
import {sleevePanelGLSL} from './sleeve-surface.mjs';
import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {photoRect} from './placement.mjs';

// Optional preview only. The 2D photos and the quoted print sizes remain independent.
export async function createViewer(container,state,config,makeArtwork) {
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e9e9e9');
  const camera=new THREE.PerspectiveCamera(32,1,.1,1000);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  renderer.domElement.setAttribute('aria-label','Prenda en 3D. Arrastrá para girarla. Usá las flechas del teclado para rotar.');
  renderer.domElement.setAttribute('role','img');renderer.domElement.tabIndex=0;container.append(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.target.set(0,38,0);controls.enableDamping=true;controls.enablePan=false;
  controls.minDistance=90;controls.maxDistance=250;controls.rotateSpeed=.65;
  controls.minPolarAngle=.3;controls.maxPolarAngle=Math.PI-.3;
  scene.add(new THREE.HemisphereLight(0xffffff,0x666666,2.0));
  for(const [x,y,z,intensity]of [[50,110,95,2.7],[-65,70,-90,2.0],[-80,35,50,.85]]) {
    const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(x,y,z);scene.add(light);
  }
  let frame=0,dead=false,framed=false;
  const textures=new Set(),geometries=new Set(),materials=new Set();
  const resize=()=>{const w=container.clientWidth||700,h=container.clientHeight||560;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();if(framed)frameModel(true)};
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  function frameModel(preserve=false){const aspect=camera.aspect,vertical=76/(2*Math.tan(THREE.MathUtils.degToRad(16))),horizontal=73/(2*Math.tan(THREE.MathUtils.degToRad(16))*aspect);const distance=Math.max(vertical,horizontal)*1.16;const angle=({front:0,back:Math.PI,left:Math.PI/2,right:-Math.PI/2}[state.view]||0)+.12;if(preserve){const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(distance);camera.position.copy(controls.target).add(offset)}else camera.position.set(Math.sin(angle)*distance,43,Math.cos(angle)*distance);controls.target.set(0,38,0);controls.update();framed=true}
  renderer.domElement.onkeydown=event=>{const steps={ArrowLeft:-.12,ArrowRight:.12};if(event.key in steps){event.preventDefault();const offset=camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),steps[event.key]);camera.position.copy(controls.target).add(offset);controls.update()}};
  function dispose(){if(dead)return;dead=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove()}
  try {
    const gltf=await new GLTFLoader().loadAsync(config.model.asset);
    gltf.scene.updateMatrixWorld(true);
    const baked=[];
    gltf.scene.traverse(node=>{if(node.isMesh&&(Array.isArray(node.material)?node.material:[node.material]).some(m=>m.opacity>0)){const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld);geometries.add(geometry);baked.push(geometry)}});
    const bounds=new THREE.Box3();baked.forEach(g=>{g.computeBoundingBox();bounds.union(g.boundingBox)});
    const scale=76/(bounds.max.y-bounds.min.y),middleX=(bounds.min.x+bounds.max.x)/2,middleZ=(bounds.min.z+bounds.max.z)/2;
    const transform=new THREE.Matrix4().set(scale,0,0,-middleX*scale,0,scale,0,-bounds.min.y*scale,0,0,scale,-middleZ*scale,0,0,0,1);
    const logos=state.mode==='custom'?state.logos:[];
    const uniforms={}, samplers=[], projections=[];
    const axes={front:'vPrintPosition.xy',back:'vec2(-vPrintPosition.x,vPrintPosition.y)',left:'vec2(-vPrintPosition.z,vPrintPosition.y)',right:'vPrintPosition.zy'};
    const gates={front:'vPrintPosition.z > 0.0 && n.z > 0.15',back:'vPrintPosition.z < 0.0 && n.z < -0.15',left:'vPrintPosition.x > 19.0',right:'vPrintPosition.x < -19.0'};
    const sleeve=config.model.sleeve;
    uniforms.sleeveOrigin={value:new THREE.Vector3(...sleeve.origin)};uniforms.sleeveAxis={value:new THREE.Vector3(...sleeve.axis).normalize()};uniforms.sleeveRadial={value:new THREE.Vector3(...sleeve.radial).normalize()};uniforms.sleeveAngles={value:new THREE.Vector2(...sleeve.angleRange)};uniforms.sleeveLength={value:new THREE.Vector2(...sleeve.lengthRange)};
    samplers.push('uniform vec3 sleeveOrigin; uniform vec3 sleeveAxis; uniform vec3 sleeveRadial; uniform vec2 sleeveAngles; uniform vec2 sleeveLength;');
    for(const [view,v] of Object.entries(config.views)){
      // The exact same artwork canvas is used for 2D and 3D, including rotation.
      const artwork=await makeArtwork(view,state),texture=new THREE.CanvasTexture(artwork);
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.add(texture);
      uniforms['print_'+view]={value:texture};uniforms['photo_'+view]={value:new THREE.Vector4(...photoRect(v))};uniforms['panel_'+view]={value:new THREE.Vector4(...v.modelRect)};
      samplers.push(`uniform sampler2D print_${view}; uniform vec4 photo_${view}; uniform vec4 panel_${view};`);
      const coordinates=(view==='left'||view==='right')?sleevePanelGLSL(view):`vec2 panel=(${axes[view]}-panel_${view}.xy)/(panel_${view}.zw-panel_${view}.xy);`;
      projections.push(`if (gl_FrontFacing && ${gates[view]}) {
        ${coordinates}
        if(all(greaterThanEqual(panel,vec2(0.0))) && all(lessThanEqual(panel,vec2(1.0)))) {
          vec2 photo=mix(photo_${view}.xy,photo_${view}.zw,vec2(panel.x,1.0-panel.y));
          vec4 ink=texture2D(print_${view},vec2(photo.x,1.0-photo.y));
          diffuseColor.rgb=mix(diffuseColor.rgb,ink.rgb,ink.a);
        }
      }`);
    }
    const cloth=new THREE.MeshStandardMaterial({color:config.colors[state.activeColor].hex,roughness:.88,metalness:0,side:THREE.DoubleSide});materials.add(cloth);
    cloth.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader='varying vec3 vPrintPosition; varying vec3 vPrintNormal;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPrintPosition=(modelMatrix*vec4(position,1.0)).xyz; vPrintNormal=mat3(modelMatrix)*normal;');
      shader.fragmentShader='varying vec3 vPrintPosition; varying vec3 vPrintNormal;\n'+samplers.join('\n')+'\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n{vec3 n=normalize(vPrintNormal);'+projections.join('\n')+'}');
    };
    cloth.customProgramCacheKey=()=> 'full-liso-surface-wrap-v2';
    baked.forEach(g=>{g.applyMatrix4(transform);if(!g.attributes.normal)g.computeVertexNormals();const m=new THREE.Mesh(g,cloth);scene.add(m);m.updateMatrixWorld(true)});
    gltf.scene.traverse(node=>{if(node.isMesh){node.geometry.dispose();for(const material of (Array.isArray(node.material)?node.material:[node.material]))material.dispose()}});
    const applied=logos.length;
    // Soft contact shadow gives the garment depth without adding controls or a second object to edit.
    const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const sc=shadowCanvas.getContext('2d'),gradient=sc.createRadialGradient(64,64,2,64,64,64);gradient.addColorStop(0,'rgba(0,0,0,.2)');gradient.addColorStop(1,'rgba(0,0,0,0)');sc.fillStyle=gradient;sc.fillRect(0,0,128,128);
    const shadowTexture=new THREE.CanvasTexture(shadowCanvas);textures.add(shadowTexture);const shadowMaterial=new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false});materials.add(shadowMaterial);const shadowGeometry=new THREE.PlaneGeometry(85,40);geometries.add(shadowGeometry);const shadow=new THREE.Mesh(shadowGeometry,shadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.y=-1.5;scene.add(shadow);
    frameModel();
    function animate(){if(dead)return;controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(animate)}animate();
    return {applied,requested:logos.length,dispose};
  }catch(error){dispose();throw error}
}
