// Medidas informadas por Santiago el 18/09/2026. Centímetros, sin interpolar.
// Son medidas de la prenda; no equivalen al área imprimible ni calibran una foto.
// La abertura de manga y el talle de las fotos todavía deben confirmarse.
export const mensTshirtMeasurements = {
  unit: 'cm', recordedAt: '2026-09-18', source: 'Full Liso · medición de prendas',
  photoReferenceSize: null, editorReferenceSize: 'L', sleeveWidthLandmark: null,
  sizes: {
    XS:   {hemWidth:47, bodyHeight:67, sleeveLength:18, sleeveWidth:15, neckInnerWidth:12, neckOuterWidth:16},
    S:    {hemWidth:50, bodyHeight:70, sleeveLength:20, sleeveWidth:17, neckInnerWidth:14, neckOuterWidth:18},
    M:    {hemWidth:55, bodyHeight:73, sleeveLength:20, sleeveWidth:19, neckInnerWidth:16, neckOuterWidth:20},
    L:    {hemWidth:56, bodyHeight:75, sleeveLength:22, sleeveWidth:21, neckInnerWidth:16, neckOuterWidth:20},
    XL:   {hemWidth:58, bodyHeight:76, sleeveLength:23, sleeveWidth:21, neckInnerWidth:16, neckOuterWidth:20},
    XXL:  {hemWidth:60, bodyHeight:78, sleeveLength:23, sleeveWidth:21, neckInnerWidth:16, neckOuterWidth:20},
    XXXL: {hemWidth:62, bodyHeight:80, sleeveLength:26, sleeveWidth:21, neckInnerWidth:16, neckOuterWidth:20}
  },
  definitions: {
    hemWidth: 'Ancho de lado a lado en la base o ruedo; no es el contorno.',
    bodyHeight: 'Desde el ruedo hasta el punto más alto del hombro junto al cuello.',
    sleeveLength: 'Desde la costura del hombro hasta el final de la manga.',
    sleeveWidth: 'Ancho informado de la manga; punto de medición por confirmar.',
    neckInnerWidth: 'Ancho del hueco del cuello, sin el borde.',
    neckOuterWidth: 'Ancho del cuello incluyendo el borde.'
  }
};
