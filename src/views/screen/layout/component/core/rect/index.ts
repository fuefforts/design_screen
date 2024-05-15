import type { Pen } from '../pen'
import { calcCenter, calcRightBottom, rotatePoint, type Point } from '../point'

export interface Rect {
  x?: number
  y?: number
  ex?: number
  ey?: number
  width?: number
  height?: number
  rotate?: number
  center?: Point
}

export function getRect(pens: Pen[]): Rect {
  const points: Point[] = []
  pens.forEach((pen) => {
    if (pen.isRuleLine) {
      return
    }
    const rect = pen.calculative.worldRect
    if (rect) {
      const pts = rectToPoints(rect)
      // rectToPoints 已经计算过 rotate 无需重复计算
      points.push(...pts)
    }
  })

  const rect = getRectOfPoints(points)
  calcCenter(rect)
  return rect
}

export function rectToPoints(rect: Rect) {
  const pts = [
    { x: rect.x, y: rect.y },
    { x: rect.ex, y: rect.y },
    { x: rect.ex, y: rect.ey },
    { x: rect.x, y: rect.ey }
  ]

  if (rect.rotate) {
    if (!rect.center) {
      calcCenter(rect)
    }
    pts.forEach((pt) => {
      rotatePoint(pt, rect.rotate, rect.center)
    })
  }
  return pts
}

export function getRectOfPoints(points: Point[]): Rect {
  let x = Infinity
  let y = Infinity
  let ex = -Infinity
  let ey = -Infinity

  points?.forEach((item) => {
    if (!isFinite(item.x) || !isFinite(item.y)) {
      return
    }
    x = Math.min(x, item.x)
    y = Math.min(y, item.y)
    ex = Math.max(ex, item.x)
    ey = Math.max(ey, item.y)
  })
  return { x, y, ex, ey, width: ex - x, height: ey - y }
}

export function pointInRect(pt: Point, rect: Rect) {
  if (!rect) {
    return
  }
  if (rect.ex == null) {
    calcRightBottom(rect)
  }

  if (
    !rect.rotate ||
    // rect.width < 20 ||
    // rect.height < 20 ||
    rect.rotate % 360 === 0
  ) {
    return pt.x > rect.x && pt.x < rect.ex && pt.y > rect.y && pt.y < rect.ey
  }

  if (!rect.center) {
    calcCenter(rect)
  }

  const pts: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.ex, y: rect.y },
    { x: rect.ex, y: rect.ey },
    { x: rect.x, y: rect.ey }
  ]
  pts.forEach((item: Point) => {
    rotatePoint(item, rect.rotate, rect.center)
  })

  return pointInVertices(pt, pts)
}
export function pointInVertices(point: { x: number; y: number }, vertices: Point[]): boolean {
  if (vertices.length < 3) {
    return false
  }
  let isIn = false
  let last = vertices[vertices.length - 1]
  for (const item of vertices) {
    if (last.y > point.y !== item.y > point.y) {
      if (item.x + ((point.y - item.y) * (last.x - item.x)) / (last.y - item.y) > point.x) {
        isIn = !isIn
      }
    }

    last = item
  }

  return isIn
}
/**
 * 计算相对点 ，anchors 中的值都是百分比
 * @param pt 绝对坐标
 * @param worldRect 图形外接矩形
 * @returns 相对坐标点
 */
export function calcRelativePoint(pt: Point, worldRect: Rect) {
  const { x, y, width, height } = worldRect
  const { penId, connectTo } = pt
  const point: Point = Object.assign({}, pt, {
    x: width ? (pt.x - x) / width : 0,
    y: height ? (pt.y - y) / height : 0
  })
  if (pt.prev) {
    point.prev = {
      penId,
      connectTo,
      x: width ? (pt.prev.x - x) / width : 0,
      y: height ? (pt.prev.y - y) / height : 0
    }
  }
  if (pt.next) {
    point.next = {
      penId,
      connectTo,
      x: width ? (pt.next.x - x) / width : 0,
      y: height ? (pt.next.y - y) / height : 0
    }
  }
  return point
}
