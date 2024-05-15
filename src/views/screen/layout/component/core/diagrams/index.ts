export * from './rectangle'

export * from './arrow'

import { rectangle, square } from './rectangle'

export function commonPens() {
  return {
    rectangle,
    square,
    mindNode2: rectangle,
    echarts: rectangle
  }
}

// export function commonAnchors() {
//   return {
//     triangle: triangleAnchors,
//     pentagon: pentagonAnchors,
//     pentagram: pentagramAnchors,
//     mindNode: mindNodeAnchors,
//     mindLine: mindLineAnchors
//   }
// }
