import type { Pen } from '../pen'
import { hitPoint, type Point } from '../point'
import type { Rect } from '../rect'

export function getLineR(pen: Pen) {
  return pen?.lineWidth ? pen.lineWidth / 2 + 4 : 4
}

export function pointInSimpleRect(pt: Point, rect: Rect, r = 0) {
  const { x, y, ex, ey } = rect
  return pt.x >= x - r && pt.x <= ex + r && pt.y >= y - r && pt.y <= ey + r
}
//射线法 判断点是否在多边形内部
export function pointInPolygon(pt: Point, pts: Point[]) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x,
      yi = pts[i].y
    const xj = pts[j].x,
      yj = pts[j].y

    const intersect = yi > pt.y != yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}
export function pointInLine(pt: Point, pen: Pen) {
  const r = getLineR(pen)

  let i = 0
  let from: Point // 上一个点
  let point: Point
  for (const anchor of pen.calculative.worldAnchors) {
    if (from) {
      point = pointInLineSegment(pt, from, anchor, r)
      if (point) {
        return {
          i,
          point
        }
      }
      ++i
    }
    from = anchor
  }
  if (
    pen.close &&
    pen.calculative.worldAnchors.length > 1 &&
    (point = pointInLineSegment(pt, from, pen.calculative.worldAnchors[0], r))
  ) {
    return {
      i,
      point
    }
  }
}

export function pointInLineSegment(pt: Point, pt1: Point, pt2: Point, r = 4) {
  if (!pt1.next && !pt2.prev) {
    const { x: x1, y: y1 } = pt1
    const { x: x2, y: y2 } = pt2
    const minX = Math.min(x1, x2)
    const maxX = Math.max(x1, x2)
    const minY = Math.min(y1, y2)
    const maxY = Math.max(y1, y2)
    if (!(pt.x >= minX - r && pt.x <= maxX + r && pt.y >= minY - r && pt.y <= maxY + r)) {
      return
    }
    return pointToLine(pt, pt1, pt2, r)
  } else if (pt1.curvePoints) {
    for (const point of pt1.curvePoints) {
      if (hitPoint(pt, point, r)) {
        return point
      }
    }
  }
}

export function pointToLine(pt: Point, pt1: Point, pt2: Point, r = 4) {
  // 竖线
  if (pt1.x === pt2.x) {
    const len = Math.abs(pt.x - pt1.x)
    if (len <= r) {
      return {
        x: pt1.x,
        y: pt.y
      }
    }
  } else {
    const A = (pt1.y - pt2.y) / (pt1.x - pt2.x)
    const B = pt1.y - A * pt1.x
    const len = Math.abs((A * pt.x + B - pt.y) / Math.sqrt(A * A + 1))
    if (len <= r) {
      const m = pt.x + A * pt.y
      const x = (m - A * B) / (A * A + 1)
      return {
        x,
        y: A * x + B
      }
    }
  }
}
