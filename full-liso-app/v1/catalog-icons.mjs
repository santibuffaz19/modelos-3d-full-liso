import {document} from './catalog-dom.mjs';
// Small, original interface symbols. They identify article types, not photos.
const paths={
 'buzo-canguro-unisex':['M17 12C16 3 32 3 31 12L40 17 44 34 37 36 34 25 34 43 14 43 14 25 11 36 4 34 8 17Z','M17 12 24 18 31 12M20 17V24M28 17V24M19 32H29L32 39H16Z'],
 'buzo-cuello-a-la-base-unisex':['M17 8C17 17 31 17 31 8L40 13 44 36 37 38 33 22 33 43 15 43 15 22 11 38 4 36 8 13Z','M15 39H33M7 32 12 34M36 34 41 32'],
 'remera-clasica-hombre':['M17 8C17 16 31 16 31 8L42 15 37 25 32 22 32 42 16 42 16 22 11 25 6 15Z'],
 'remera-clasica-mujer':['M17 8C17 16 31 16 31 8L41 15 36 23 31 21 29 30 33 42 15 42 19 30 17 21 12 23 7 15Z'],
 'remera-oversize':['M16 7C16 15 32 15 32 7L45 14 40 29 34 26 34 43 14 43 14 26 8 29 3 14Z','M15 38H33'],
 'chomba-importada':['M17 8 24 11 31 8 42 15 37 25 32 22 32 42 16 42 16 22 11 25 6 15Z','M17 8 18 18 24 13 30 18 31 8M24 13V25M24 19H24.1M24 23H24.1'],
 'gorra-trucker':['M7 29V24C7 12 16 7 26 10 35 12 38 19 38 29ZM7 29C3 35 9 39 17 37L38 29 44 33C34 43 18 40 12 38','M23 10C17 16 17 23 17 29M28 17H29M33 22H34M26 25H27'],
 'gorra-gabardina':['M8 29V25C8 13 16 8 24 8S40 14 40 29ZM8 29C8 40 37 44 44 34L33 29','M24 8C19 14 18 22 18 29M24 8C30 13 33 22 33 29M21 7H27'],
 'mochila':['M12 15C12 6 36 6 36 15L39 39C39 43 9 43 9 39ZM19 9V5H29V9','M15 26H33V37H15ZM12 20H36M17 30H31M39 27H43V38H39'],
 'termo-botella':['M19 4H29V12L33 18V40C33 44 15 44 15 40V18L19 12ZM19 8H29M15 20H33','M20 25V36'],
 'totebag':['M10 17H38L41 43H7ZM17 21V12C17 2 31 2 31 12V21','M13 38H35'],
 'llavero-uv':['M25 18C36 18 41 25 41 33S35 45 28 44 16 39 16 32C16 27 18 23 22 21','M23 22 18 17M25 11A10 10 0 1 1 5 11 10 10 0 1 1 25 11','M25 28H33M25 33H33M25 38H30'],
 'pin-crockel':['M42 24A18 18 0 1 1 6 24 18 18 0 1 1 42 24','M24 13 27 20 35 21 29 27 30 35 24 31 18 35 19 27 13 21 21 20Z'],
};
export function articleIcon(slug){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 48 48');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.classList.add('article-icon');
 for(const d of paths[slug]||['M8 12H40V40H8ZM16 12V8H32V12']){const path=document.createElementNS(ns,'path');path.setAttribute('d',d);svg.append(path);}
 return svg;
}
