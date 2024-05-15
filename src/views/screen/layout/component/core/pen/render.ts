import type { Canvas } from '../canvas'
import { drawArrow } from '../diagrams/arrow'
import {
  calcCenter,
  calcCenterNode,
  calcRightBottom,
  calcRightBottomNode,
  rotatePoint,
  type Point
} from '../point'
import { getRectOfPoints, pointInRect, rectToPoints, type Rect } from '../rect'
import { globalStore, type Meta2dStore } from '../store'
import { deepClone, rgba } from '../utils'
import { renderFromArrow, renderToArrow } from './arrow'
import { Gradient, LineAnimateType, PenType, type Pen } from './model'

export function getParent(pen: Pen, root?: boolean): Pen {
  if (!pen || !pen.parentId || !pen.calculative) {
    return undefined
  }

  const store = pen.calculative.canvas.store
  const parent = store.pens[pen.parentId]
  if (!root) {
    return parent
  }
  return getParent(parent, root) || parent
}
export function ctxFlip(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pen: Pen
) {
  // worldRect 可能为 undefined
  const { x, ex, y, ey } = pen.calculative.worldRect || {}
  if (pen.calculative.flipX) {
    ctx.translate(x + ex + 0.5, 0.5)
    ctx.scale(-1, 1)
  }
  if (pen.calculative.flipY) {
    ctx.translate(0.5, y + ey + 0.5)
    ctx.scale(1, -1)
  }
}
/**
 * 根据图片的宽高， imageRatio iconAlign 来获取图片的实际位置
 * @param pen 画笔
 */
function getImagePosition(pen: Pen) {
  const {
    worldIconRect: rect,
    iconWidth,
    iconHeight,
    imgNaturalWidth,
    imgNaturalHeight
  } = pen.calculative
  let { x, y, width: w, height: h } = rect
  if (iconWidth) {
    w = iconWidth
  }
  if (iconHeight) {
    h = iconHeight
  }
  if (imgNaturalWidth && imgNaturalHeight && pen.imageRatio) {
    const scaleW = rect.width / imgNaturalWidth
    const scaleH = rect.height / imgNaturalHeight
    const scaleMin = Math.min(scaleW, scaleH)
    const wDivideH = imgNaturalWidth / imgNaturalHeight
    if (iconWidth) {
      h = iconWidth / wDivideH
    } else if (iconHeight) {
      w = iconHeight * wDivideH
    } else {
      w = scaleMin * imgNaturalWidth
      h = scaleMin * imgNaturalHeight
    }
  }
  x += (rect.width - w) / 2
  y += (rect.height - h) / 2

  switch (pen.iconAlign) {
    case 'top':
      y = rect.y
      break
    case 'bottom':
      y = rect.ey - h
      break
    case 'left':
      x = rect.x
      break
    case 'right':
      x = rect.ex - w
      break
    case 'left-top':
      x = rect.x
      y = rect.y
      break
    case 'right-top':
      x = rect.ex - w
      y = rect.y
      break
    case 'left-bottom':
      x = rect.x
      y = rect.ey - h
      break
    case 'right-bottom':
      x = rect.ex - w
      y = rect.ey - h
      break
  }

  return {
    x,
    y,
    width: w,
    height: h
  }
}

export function drawImage(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pen: Pen
) {
  const { x, y, width, height } = getImagePosition(pen)
  const { worldIconRect, iconRotate, img } = pen.calculative

  if (iconRotate) {
    const { x: centerX, y: centerY } = worldIconRect.center
    ctx.translate(centerX, centerY)
    ctx.rotate((iconRotate * Math.PI) / 180)
    ctx.translate(-centerX, -centerY)
  }
  if (pen.imageRadius) {
    ctx.save()
    let wr = pen.calculative.imageRadius || 0,
      hr = wr
    const { x: _x, y: _y, width: w, height: h, ex, ey } = pen.calculative.worldRect
    if (wr < 1) {
      wr = w * wr
      hr = h * hr
    }
    let r = wr < hr ? wr : hr
    if (w < 2 * r) {
      r = w / 2
    }
    if (h < 2 * r) {
      r = h / 2
    }
    ctx.beginPath()

    ctx.moveTo(_x + r, _y)
    ctx.arcTo(ex, _y, ex, ey, r)
    ctx.arcTo(ex, ey, _x, ey, r)
    ctx.arcTo(_x, ey, _x, _y, r)
    ctx.arcTo(_x, _y, ex, _y, r)
    ctx.clip()
    ctx.drawImage(img, x, y, width, height)
    ctx.restore()
  } else {
    ctx.drawImage(img, x, y, width, height)
  }
}

export function ctxRotate(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pen: Pen,
  noFlip: boolean = false
) {
  const { x, y } = pen.calculative.worldRect.center
  ctx.translate(x, y)
  let rotate = (pen.calculative.rotate * Math.PI) / 180
  // 目前只有水平和垂直翻转，都需要 * -1
  if (!noFlip) {
    if (pen.calculative.flipX) {
      rotate *= -1
    }
    if (pen.calculative.flipY) {
      rotate *= -1
    }
  }
  ctx.rotate(rotate)
  ctx.translate(-x, -y)
}
export function setGlobalAlpha(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pen: Pen
) {
  const globalAlpha = pen.calculative.globalAlpha
  if (typeof globalAlpha === 'number' && globalAlpha < 1 && !isNaN(globalAlpha)) {
    ctx.globalAlpha = globalAlpha
  }
}

export function calcWorldRects(pen: Pen) {
  const store: Meta2dStore = pen.calculative.canvas.store

  const rect: any = {
    x: pen.x,
    y: pen.y
  }

  if (!pen.parentId || (pen.parentId && !store.pens[pen.parentId])) {
    pen.parentId = undefined
    rect.width = pen.width
    rect.height = pen.height
    rect.rotate = pen.rotate
    calcRightBottom(rect)
    calcCenter(rect)
  } else {
    const parent = store.pens[pen.parentId]
    let parentRect = parent.calculative.worldRect
    if (!parentRect) {
      parentRect = calcWorldRects(parent)
    }

    rect.x = parentRect.x + parentRect.width * pen.x
    rect.y = parentRect.y + parentRect.height * pen.y
    rect.width = parentRect.width * pen.width
    rect.height = parentRect.height * pen.height
    if (parent.flipX) {
      rect.x = parentRect.width - (rect.x - parentRect.x + rect.width) + parentRect.x
    }
    if (parent.flipY) {
      rect.y = parentRect.height - (rect.y - parentRect.y + rect.height) + parentRect.y
    }

    calcRightBottom(rect)

    rect.rotate = parentRect.rotate + pen.rotate
    calcCenter(rect)
  }

  pen.calculative.worldRect = rect
  // 这里的 rect 均是绝对值
  // calcPadding(pen, rect);

  return rect
}

export function calcWorldRectsNode(pen: Pen, elemnt: HTMLElement) {
  const store: Meta2dStore = pen.calculative.canvas.store

  const rect: any = {
    x: pen.x,
    y: pen.y
  }

  if (!pen.parentId || (pen.parentId && !store.pens[pen.parentId])) {
    pen.parentId = undefined
    rect.width = pen.width
    rect.height = pen.height
    rect.rotate = pen.rotate
    calcRightBottomNode(rect, elemnt)
    calcCenterNode(rect, elemnt)
  } else {
    const parent = store.pens[pen.parentId]
    let parentRect = parent.calculative.worldRect
    if (!parentRect) {
      parentRect = calcWorldRects(parent)
    }

    rect.x = parentRect.x + parentRect.width * pen.x
    rect.y = parentRect.y + parentRect.height * pen.y
    rect.width = parentRect.width * pen.width
    rect.height = parentRect.height * pen.height
    if (parent.flipX) {
      rect.x = parentRect.width - (rect.x - parentRect.x + rect.width) + parentRect.x
    }
    if (parent.flipY) {
      rect.y = parentRect.height - (rect.y - parentRect.y + rect.height) + parentRect.y
    }

    calcRightBottomNode(rect, elemnt)

    rect.rotate = parentRect.rotate + pen.rotate
    calcCenterNode(rect, elemnt)
  }

  pen.calculative.worldRect = rect
  // 这里的 rect 均是绝对值
  // calcPadding(pen, rect);

  return rect
}

export function translateRect(rect: any | Pen, x: number, y: number) {
  rect.x += x
  rect.y += y
  rect.ex += x
  rect.ey += y

  if (rect.center) {
    rect.center.x += x
    rect.center.y += y
  }
}

/**
 * 每个画笔 locked
 * @param pens 画笔
 * @returns
 */
export function getPensLock(pens: Pen[]): boolean {
  return pens.every((pen) => pen.locked)
}
/**
 * 画笔们的 disableSize = true
 * 即 全部不允许改变大小 返回 true
 * @param pens 画笔
 * @returns
 */
export function getPensDisableResize(pens: Pen[]): boolean {
  return pens.every((pen) => pen.disableSize)
}

/**
 * 画笔们的 disabledRotate = true
 * 即 全部禁止旋转 返回 true
 * @param pens 画笔
 * @returns
 */
export function getPensDisableRotate(pens: Pen[]): boolean {
  return pens.every((pen) => pen.disableRotate)
}

export function hitPoint(pt: Point, target: Point, radius = 5, pen?: Pen) {
  if (target.type === PointType.Line) {
    let _rotate = pen.rotate
    if (pen.flipX) {
      _rotate *= -1
    }
    if (pen.flipY) {
      _rotate *= -1
    }
    let rotate = target.rotate + _rotate
    if (pen.flipX) {
      rotate *= -1
    }
    if (pen.flipY) {
      rotate *= -1
    }
    return pointInRect(pt, {
      x: target.x - (target.length * pen.calculative.canvas.store.data.scale) / 2,
      y: target.y - radius,
      width: target.length * pen.calculative.canvas.store.data.scale,
      height: radius * 2,
      rotate: rotate
    })
  } else {
    return (
      pt.x > target.x - radius &&
      pt.x < target.x + radius &&
      pt.y > target.y - radius &&
      pt.y < target.y + radius
    )
  }
}

export function setHover(pen: Pen, hover = true) {
  if (!pen) {
    return
  }
  const store = pen.calculative.canvas.store
  pen.calculative.hover = hover
  if (pen.children) {
    pen.children.forEach((id) => {
      // 子节点没有自己的独立hover，继承父节点hover
      if (store.pens[id]?.hoverColor == undefined && store.pens[id]?.hoverBackground == undefined) {
        setHover(store.pens[id], hover)
      }
    })
  }
}

export function calcWorldAnchors(pen: Pen) {
  const store: Meta2dStore = pen.calculative.canvas.store
  let anchors: Point[] = []
  if (pen.anchors) {
    const _anchors = deepClone(pen.anchors)
    if (pen.flipX) {
      _anchors.forEach((anchor) => {
        anchor.x = 0.5 - (anchor.x - 0.5)
      })
    }
    if (pen.flipY) {
      _anchors.forEach((anchor) => {
        anchor.y = 0.5 - (anchor.y - 0.5)
      })
    }
    _anchors.forEach((anchor) => {
      anchors.push(calcWorldPointOfPen(pen, anchor))
    })
  }

  // Default anchors of node
  if (!anchors.length && !pen.type && !pen.calculative.canvas.parent.isCombine(pen)) {
    const { x, y, width, height } = pen.calculative.worldRect
    anchors = store.options.defaultAnchors.map((anchor, index) => {
      return {
        id: `${index}`,
        penId: pen.id,
        x: x + width * anchor.x,
        y: y + height * anchor.y
      }
    })
  }

  if (pen.calculative.rotate) {
    anchors.forEach((anchor) => {
      rotatePoint(anchor, pen.calculative.rotate, pen.calculative.worldRect.center)
    })
  }

  if (!pen.type || pen.anchors) {
    pen.calculative.worldAnchors = anchors
  }

  if (pen.calculative.activeAnchor && anchors.length) {
    pen.calculative.activeAnchor = anchors.find((a) => {
      a.id === pen.calculative.activeAnchor.id
    })
  }

  pen.calculative.gradientAnimatePath = undefined
}

export function calcWorldPointOfPen(pen: Pen, pt: Point) {
  const p: Point = { ...pt }
  const { x, y, width, height } = pen.calculative.worldRect
  p.x = x + width * pt.x
  p.y = y + height * pt.y
  if (pt.prev) {
    p.prev = {
      penId: pen.id,
      connectTo: pt.prev.connectTo,
      x: x + width * pt.prev.x,
      y: y + height * pt.prev.y
    }
  }
  if (pt.next) {
    p.next = {
      penId: pen.id,
      connectTo: pt.next.connectTo,
      x: x + width * pt.next.x,
      y: y + height * pt.next.y
    }
  }

  return p
}
/**
 * 计算画笔的 inView
 * @param pen 画笔
 * @param calcChild 是否计算子画笔
 */
export function calcInView(pen: Pen, calcChild = false) {
  const { store, canvasRect } = pen.calculative.canvas as Canvas
  if (calcChild) {
    pen.children?.forEach((id) => {
      const child = store.pens[id]
      child && calcInView(child, true)
    })
  }

  pen.calculative.inView = true
  if (!isShowChild(pen, store) || pen.visible == false || pen.calculative.visible == false) {
    pen.calculative.inView = false
  } else {
    const { x, y, width, height, rotate } = pen.calculative.worldRect
    const penRect: Rect = {
      x: x + store.data.x,
      y: y + store.data.y,
      width,
      height,
      rotate
    }
    calcRightBottom(penRect)
    if (!rectInRect(penRect, canvasRect)) {
      pen.calculative.inView = false
    }
  }
  // TODO: 语义化上，用 onValue 更合适，但 onValue 会触发 echarts 图形的重绘，没有必要
  // 更改 view 后，修改 dom 节点的显示隐藏
  pen.onMove?.(pen)
}
/**
 * 判断该画笔 是否是组合为状态中 展示的画笔
 */
export function isShowChild(pen: Pen, store: Meta2dStore) {
  let selfPen = pen
  while (selfPen && selfPen.parentId) {
    const oldPen = selfPen
    selfPen = store.pens[selfPen.parentId]
    const showChildIndex = selfPen?.calculative?.showChild
    if (showChildIndex != undefined) {
      const showChildId = selfPen.children[showChildIndex]
      if (showChildId !== oldPen.id) {
        // toPng 不展示它
        return false
      }
    }
  }
  return true
}

export function rectInRect(source: Rect, target: Rect, allIn?: boolean) {
  if (source.rotate) {
    // 根据 rotate 扩大 rect
    source = getRectOfPoints(rectToPoints(source)) // 更改 source 引用地址值，不影响原值
  }
  if (allIn) {
    return (
      source.x > target.x && source.ex < target.ex && source.y > target.y && source.ey < target.ey
    )
  }
  return !(
    source.x > target.ex ||
    source.ex < target.x ||
    source.ey < target.y ||
    source.y > target.ey
  )
}

/**
 * 全局 color
 */
export function getGlobalColor(store: Meta2dStore) {
  const { data, options } = store
  return data.color || options.color
}

export function renderPen(ctx: CanvasRenderingContext2D, pen: Pen, download?: boolean) {
  ctx.save()
  ctx.translate(0.5, 0.5)
  ctx.beginPath()
  const store = pen.calculative.canvas.store
  const textFlip = pen.textFlip || store.options.textFlip
  const textRotate = pen.textRotate || store.options.textRotate
  if (!textFlip || !textRotate) {
    ctx.save()
  }
  ctxFlip(ctx, pen)

  if (pen.calculative.rotate && pen.name !== 'line') {
    ctxRotate(ctx, pen)
  }
  if (pen.calculative.lineWidth > 1 || download) {
    ctx.lineWidth = pen.calculative.lineWidth
  }

  inspectRect(ctx, store, pen) // 审查 rect
  let fill: any
  // 该变量控制在 hover active 状态下的节点是否设置填充颜色
  // let setBack = true;
  let lineGradientFlag = false
  let _stroke = undefined
  if (pen.calculative.hover) {
    _stroke = pen.hoverColor || store.options.hoverColor
    fill = pen.hoverBackground || store.options.hoverBackground
    //  ctx.fillStyle = fill;
    //  fill && (setBack = false);
  } else if (pen.calculative.active) {
    _stroke = pen.activeColor || store.options.activeColor
    fill = pen.activeBackground || store.options.activeBackground
    // ctx.fillStyle = fill;
    // fill && (setBack = false);
  } else if (pen.calculative.isDock) {
    if (pen.type === PenType.Line) {
      _stroke = store.options.dockPenColor
    } else {
      fill = rgba(store.options.dockPenColor, 0.2)
      //  ctx.fillStyle = fill;
      //  fill && (setBack = false);
    }
  }
  // else {
  const strokeImg = pen.calculative.strokeImg
  if (pen.calculative.strokeImage && strokeImg) {
    ctx.strokeStyle = _stroke || ctx.createPattern(strokeImg, 'repeat')
    // fill = true;
  } else {
    let stroke: string | CanvasGradient | CanvasPattern
    // TODO: 线只有线性渐变
    if (pen.calculative.strokeType) {
      if (pen.calculative.lineGradientColors) {
        if (pen.name === 'line') {
          lineGradientFlag = true
        } else {
          if (pen.calculative.lineGradient) {
            stroke = pen.calculative.lineGradient
          } else {
            stroke = getLineGradient(ctx, pen)
            pen.calculative.lineGradient = stroke
          }
        }
      } else {
        stroke = strokeLinearGradient(ctx, pen)
      }
    } else {
      stroke = pen.calculative.color || getGlobalColor(store)
    }
    ctx.strokeStyle = _stroke || stroke
  }
  // }
  //if (setBack) {
  const backgroundImg = pen.calculative.backgroundImg
  if (pen.calculative.backgroundImage && backgroundImg) {
    ctx.fillStyle = fill || ctx.createPattern(backgroundImg, 'repeat')
    fill = true
  } else {
    let back: string | CanvasGradient | CanvasPattern
    if (pen.calculative.bkType === Gradient.Linear) {
      if (pen.calculative.gradientColors) {
        if (!pen.type) {
          //连线不考虑渐进背景
          if (pen.calculative.gradient) {
            //位置变化/放大缩小操作不会触发重新计算
            back = pen.calculative.gradient
          } else {
            back = getBkGradient(ctx, pen)
            pen.calculative.gradient = back
          }
        }
      } else {
        back = drawBkLinearGradient(ctx, pen)
      }
    } else if (pen.calculative.bkType === Gradient.Radial) {
      if (pen.calculative.gradientColors) {
        if (pen.calculative.radialGradient) {
          back = pen.calculative.radialGradient
        } else {
          back = getBkRadialGradient(ctx, pen)
          pen.calculative.radialGradient = back
        }
      } else {
        back = drawBkRadialGradient(ctx, pen)
      }
    } else {
      back = pen.calculative.background || store.data.penBackground
    }
    ctx.fillStyle = fill || back
    fill = !!back
  }
  // }

  setLineCap(ctx, pen)
  setLineJoin(ctx, pen)

  setGlobalAlpha(ctx, pen)

  if (pen.calculative.lineDash) {
    ctx.setLineDash(
      pen.calculative.lineDash.map((item) => item * pen.calculative.canvas.store.data.scale)
    )
  }
  if (pen.calculative.lineDashOffset) {
    ctx.lineDashOffset = pen.calculative.lineDashOffset
  }

  if (pen.calculative.shadowColor) {
    ctx.shadowColor = pen.calculative.shadowColor
    ctx.shadowOffsetX = pen.calculative.shadowOffsetX
    ctx.shadowOffsetY = pen.calculative.shadowOffsetY
    ctx.shadowBlur = pen.calculative.shadowBlur
  }
  if (lineGradientFlag) {
    ctxDrawLinearGradientPath(ctx, pen)
    // ctxDrawLinePath(true, ctx, pen, store)
  } else {
    ctxDrawPath(true, ctx, pen, store, fill)

    ctxDrawCanvas(ctx, pen)
  }
  // if (!(pen.image && pen.calculative.img) && pen.calculative.icon) {
  //   drawIcon(ctx, pen);
  // }

  if (!textFlip || !textRotate) {
    ctx.restore()
  }
  if (textFlip && !textRotate) {
    ctxFlip(ctx, pen)
  }
  if (!textFlip && textRotate) {
    if (pen.calculative.rotate && pen.name !== 'line') {
      ctxRotate(ctx, pen, true)
    }
  }

  // drawText(ctx, pen);
  // if (pen.type === PenType.Line && pen.fillTexts) {
  //   for (const text of pen.fillTexts) {
  //     drawFillText(ctx, pen, text);
  //   }
  // }

  ctx.restore()
}
/**
 * 根据 path2D 绘制 path
 * @param canUsePath 是否可使用 Path2D, downloadSvg 不可使用 path2D
 */
export function ctxDrawPath(
  canUsePath = true,
  ctx: CanvasRenderingContext2D,
  pen: Pen,
  store: Meta2dStore,
  fill: boolean
) {
  const path = canUsePath ? store.path2dMap.get(pen) : globalStore.path2dDraws[pen.name]
  if (path) {
    if (pen.type === PenType.Line && pen.borderWidth) {
      ctx.save()
      ctx.beginPath()
      const lineWidth = pen.calculative.lineWidth + pen.calculative.borderWidth
      ctx.lineWidth = lineWidth
      ctx.strokeStyle = pen.borderColor
      if (path instanceof Path2D) {
        fill && ctx.fill(path)
        lineWidth && ctx.stroke(path)
      } else {
        path(pen, ctx)
        fill && ctx.fill()
        lineWidth && ctx.stroke()
      }
      ctx.restore()
    }
    if (path instanceof Path2D) {
      if (pen.type) {
        if (pen.close) {
          fill && ctx.fill(path)
        }
      } else {
        //svgPath
        fill && ctx.fill(path)
      }
    } else {
      ctx.save()
      path(pen, ctx)
      fill && ctx.fill()
      ctx.restore()
    }

    const progress = pen.calculative.progress
    if (progress != null) {
      // 从左往右 x, y, x + width * progress, y
      // 从右往左 ex, y, x + width * (1-progress), y
      // 从下往上 x, y, x, y + height * progress
      // 从上往下 x, ey, x, y + height * (1 - progress)
      ctx.save()
      const { ex, x, y, width, height, ey } = pen.calculative.worldRect
      let grd = null
      if (!pen.verticalProgress) {
        grd = !pen.reverseProgress
          ? ctx.createLinearGradient(x, y, x + width * progress, y)
          : ctx.createLinearGradient(ex, y, x + width * (1 - progress), y)
      } else {
        grd = !pen.reverseProgress
          ? ctx.createLinearGradient(x, ey, x, y + height * (1 - progress))
          : ctx.createLinearGradient(x, y, x, y + height * progress)
      }

      if (pen.calculative.progressGradientColors) {
        const { colors } = formatGradient(pen.calculative.progressGradientColors)
        colors.forEach((stop) => {
          grd.addColorStop(stop.i, stop.color)
        })
      } else {
        const color =
          pen.calculative.progressColor || pen.calculative.color || store.options.activeColor
        grd.addColorStop(0, color)
        grd.addColorStop(1, color)
      }
      grd.addColorStop(1, 'transparent')

      ctx.fillStyle = grd
      if (path instanceof Path2D) {
        ctx.fill(path)
      } else {
        path(pen, ctx)
        ctx.fill()
      }
      ctx.restore()
    }

    if (pen.calculative.lineWidth) {
      if (path instanceof Path2D) {
        if (store.options.svgPathStroke || pen.name !== 'svgPath') {
          ctx.stroke(path)
        }
      } else {
        path(pen, ctx)
        ctx.stroke()
      }
    }

    if (pen.type) {
      if (pen.calculative.animatePos) {
        ctx.save()
        setCtxLineAnimate(ctx, pen, store)
        if (
          pen.lineAnimateType === LineAnimateType.Arrow ||
          pen.lineAnimateType === LineAnimateType.WaterDrop
        ) {
          //箭头动画
          const _path = drawArrow(pen, ctx)
          if (_path instanceof Path2D) {
            ctx.stroke(_path)
            ctx.fill(_path)
          } else {
            ctx.stroke()
            ctx.fill()
          }
        } else {
          if (path instanceof Path2D) {
            ctx.stroke(path)
          } else {
            path(pen, ctx)
            ctx.stroke()
          }
        }
        ctx.restore()
      }

      pen.fromArrow && renderFromArrow(ctx, pen, store)
      pen.toArrow && renderToArrow(ctx, pen, store)

      if (
        pen.calculative.active &&
        !pen.calculative.pencil &&
        !store.options.disableAnchor &&
        !store.data.locked
      ) {
        renderLineAnchors(ctx, pen)
      }
    }
  }
}

export function renderLineAnchors(ctx: CanvasRenderingContext2D, pen: Pen) {
  const store = pen.calculative.canvas.store

  ctx.save()
  ctx.lineWidth = 1
  ctx.fillStyle = pen.activeColor || store.options.activeColor
  pen.calculative.worldAnchors.forEach((pt) => {
    !pt.hidden && !pt.isTemp && renderAnchor(ctx, pt, pen)
  })

  ctx.restore()
}

export function renderAnchor(ctx: CanvasRenderingContext2D, pt: Point, pen: Pen) {
  if (!pt) {
    return
  }

  const active =
    pen.calculative.canvas.store.activeAnchor === pen.calculative.activeAnchor &&
    pen.calculative.activeAnchor === pt
  let r = 3
  if (pen.calculative.lineWidth > 3) {
    r = pen.calculative.lineWidth
  }
  if (pen.anchorRadius) {
    r = pen.anchorRadius
  }
  if (pt.radius) {
    r = pt.radius
  }
  if (active) {
    if (pt.prev) {
      ctx.save()
      ctx.strokeStyle = '#4dffff'
      ctx.beginPath()
      ctx.moveTo(pt.prev.x, pt.prev.y)
      ctx.lineTo(pt.x, pt.y)
      ctx.stroke()
      ctx.restore()

      ctx.save()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(pt.prev.x, pt.prev.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
    if (pt.next) {
      ctx.save()
      ctx.strokeStyle = '#4dffff'
      ctx.beginPath()
      ctx.moveTo(pt.x, pt.y)
      ctx.lineTo(pt.next.x, pt.next.y)
      ctx.stroke()
      ctx.restore()

      ctx.save()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(pt.next.x, pt.next.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()

      ctx.beginPath()
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
}

/**
 * 设置线条动画，ctx 的 strokeStyle lineDash 等属性更改
 */
export function setCtxLineAnimate(ctx: CanvasRenderingContext2D, pen: Pen, store: Meta2dStore) {
  ctx.strokeStyle = pen.animateColor || store.options.animateColor
  if (pen.animateShadow) {
    ctx.shadowBlur = pen.animateShadowBlur || pen.animateLineWidth || 6
    ctx.shadowColor = pen.animateShadowColor || pen.animateColor || store.options.animateColor
  }
  pen.calculative.animateLineWidth &&
    (ctx.lineWidth = pen.calculative.animateLineWidth * store.data.scale)
  let len = 0
  switch (pen.lineAnimateType) {
    case LineAnimateType.Beads:
      if (pen.animateReverse) {
        ctx.lineDashOffset = pen.calculative.animatePos
      } else {
        ctx.lineDashOffset = pen.length - pen.calculative.animatePos
      }
      len = pen.calculative.lineWidth || 5
      if (len < 5) {
        len = 5
      }
      const dash = pen.animateLineDash && pen.animateLineDash.map((item) => (item * len) / 5)
      ctx.setLineDash(dash || [len, len * 2])
      break
    case LineAnimateType.Dot:
      if (pen.animateReverse) {
        ctx.lineDashOffset = pen.calculative.animatePos
      } else {
        ctx.lineDashOffset = pen.length - pen.calculative.animatePos
      }
      len = pen.calculative.animateDotSize || pen.calculative.lineWidth * 2 || 6
      if (len < 6) {
        len = 6
      }
      if (len > 40) {
        len = 40
      }
      ctx.lineWidth = (pen.calculative.animateLineWidth || len) * store.data.scale
      ctx.setLineDash([0.1, pen.length])
      break
    case LineAnimateType.Arrow:
      ctx.fillStyle = pen.animateColor || store.options.animateColor
      ctx.lineWidth = 1
      break
    case LineAnimateType.WaterDrop:
      ctx.fillStyle = pen.animateColor || store.options.animateColor
      ctx.lineWidth = 1
      break
    default:
      if (pen.animateReverse) {
        ctx.lineDashOffset = Number.EPSILON //防止在执行动画时会绘制多余的远点
        ctx.setLineDash([
          0,
          pen.length - pen.calculative.animatePos + 1,
          pen.calculative.animatePos
        ])
      } else {
        ctx.setLineDash([
          pen.calculative.animatePos,
          pen.length + 0.01 - pen.calculative.animatePos //避免在缩放时，精度问题绘制多余圆点
        ])
      }
      break
  }
}
/**
 * ctx 绘制图纸，并非 Path2D
 * @param ctx 画布上下文
 * @param pen 画笔
 */
function ctxDrawCanvas(ctx: CanvasRenderingContext2D, pen: Pen) {
  const canvasDraw = globalStore.canvasDraws[pen.name]
  if (canvasDraw) {
    // TODO: 后续考虑优化 save / restore
    ctx.save()
    // TODO: 原有 return 终止后续操作，必要性不大
    canvasDraw(ctx, pen)
    ctx.restore()
  }
}
/**
 * 绘制 rect ，上线后可查看 rect 位置
 */
function inspectRect(ctx: CanvasRenderingContext2D, store: Meta2dStore, pen: Pen) {
  if (store.fillWorldTextRect) {
    ctx.save()
    ctx.fillStyle = '#c3deb7'
    const { x, y, width, height } = pen.calculative.worldTextRect
    ctx.fillRect(x, y, width, height)
    ctx.restore()
  }
}

function getGradientR(angle: number, width: number, height: number) {
  const dividAngle = (Math.atan(height / width) / Math.PI) * 180
  let calculateAngle = (angle - 90) % 360
  let r = 0
  if (
    (calculateAngle > dividAngle && calculateAngle < 180 - dividAngle) ||
    (calculateAngle > 180 + dividAngle && calculateAngle < 360 - dividAngle) ||
    calculateAngle < 0
  ) {
    //根据高计算
    if (calculateAngle > 270) {
      calculateAngle = 360 - calculateAngle
    } else if (calculateAngle > 180) {
      calculateAngle = calculateAngle - 180
    } else if (calculateAngle > 90) {
      calculateAngle = 180 - calculateAngle
    }
    r = Math.abs(height / Math.sin((calculateAngle / 180) * Math.PI) / 2)
  } else {
    //根据宽计算
    if (calculateAngle > 270) {
      calculateAngle = 360 - calculateAngle
    } else if (calculateAngle > 180) {
      calculateAngle = calculateAngle - 180
    } else if (calculateAngle > 90) {
      calculateAngle = 180 - calculateAngle
    }
    r = Math.abs(width / Math.cos((calculateAngle / 180) * Math.PI) / 2)
  }
  return r
}

function getLineGradient(ctx: CanvasRenderingContext2D, pen: Pen) {
  const { x, y, ex, width, height, center } = pen.calculative.worldRect
  const points = [
    { x: ex, y: y + height / 2 },
    { x: x, y: y + height / 2 }
  ]

  const { angle, colors } = formatGradient(pen.calculative.lineGradientColors)
  const r = getGradientR(angle, width, height)

  points.forEach((point) => {
    rotatePoint(point, angle, center)
  })
  return getLinearGradient(ctx, points, colors, r)
}

function formatGradient(color: string) {
  if (typeof color == 'string' && color.startsWith('linear-gradient')) {
    const arr = color.slice(16, -2).split('deg,')
    if (arr.length > 1) {
      const _arr = arr[1].split('%,')
      const colors = []
      _arr.forEach((stap) => {
        if (/rgba?/.test(stap)) {
          const _arr = stap.split(') ')
          colors.push({
            color: rgbaToHex(_arr[0] + ')'),
            i: parseFloat(_arr[1]) / 100
          })
        } else {
          const _arr = stap.split(' ')
          if (_arr.length > 2) {
            colors.push({
              color: _arr[1],
              i: parseFloat(_arr[2]) / 100
            })
          } else {
            colors.push({
              color: _arr[0],
              i: parseFloat(_arr[1]) / 100
            })
          }
        }
      })
      return {
        angle: parseFloat(arr[0]),
        colors
      }
    } else {
      return {
        angle: parseFloat(arr[0]),
        colors: []
      }
    }
  } else {
    return {
      angle: 0,
      colors: []
    }
  }
}

function rgbaToHex(value) {
  if (/rgba?/.test(value)) {
    const array = value.split(',')
    //不符合rgb或rgb规则直接return
    if (array.length < 3) return ''
    value = '#'
    for (let i = 0, color; (color = array[i++]); ) {
      if (i < 4) {
        //前三位转换成16进制
        color = parseInt(color.replace(/[^\d]/gi, ''), 10).toString(16)
        value += color.length == 1 ? '0' + color : color
      } else {
        //rgba的透明度转换成16进制
        color = color.replace(')', '')
        const colorA = parseInt(color * 255 + '')
        let colorAHex = colorA.toString(16)
        colorAHex = colorAHex.length === 2 ? colorAHex : '0' + colorAHex
        value += colorAHex
      }
    }
    value = value.toUpperCase()
  }
  return value
}

function getLinearGradient(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  colors: ColorStop[],
  radius: number
): CanvasGradient {
  const arr = getLinearGradientPoints(points[0].x, points[0].y, points[1].x, points[1].y, radius)
  const gradient = ctx.createLinearGradient(arr[0], arr[1], arr[2], arr[3])
  colors.forEach((stop) => {
    gradient.addColorStop(stop.i, stop.color)
  })
  return gradient
}

function getLinearGradientPoints(x1: number, y1: number, x2: number, y2: number, r: number) {
  let slantAngle = 0
  slantAngle = Math.PI / 2 - Math.atan2(y2 - y1, x2 - x1)
  const originX = (x1 + x2) / 2
  const originY = (y1 + y2) / 2

  const perpX1 = originX + r * Math.sin((90 * Math.PI) / 180 - slantAngle)
  const perpY1 = originY + r * -Math.cos((90 * Math.PI) / 180 - slantAngle)

  const perpX2 = originX + r * Math.sin((270 * Math.PI) / 180 - slantAngle)
  const perpY2 = originY + r * -Math.cos((270 * Math.PI) / 180 - slantAngle)

  return [perpX1, perpY1, perpX2, perpY2]
}

function strokeLinearGradient(ctx: CanvasRenderingContext2D, pen: Pen) {
  const { worldRect, lineGradientFromColor, lineGradientToColor, lineGradientAngle } =
    pen.calculative
  return linearGradient(
    ctx,
    worldRect,
    lineGradientFromColor,
    lineGradientToColor,
    lineGradientAngle
  )
}

/**
 * 避免副作用，把创建好后的线性渐变对象返回出来
 * @param ctx 画布绘制对象
 * @param worldRect 世界坐标
 * @returns 线性渐变
 */
function linearGradient(
  ctx: CanvasRenderingContext2D,
  worldRect: Rect,
  fromColor: string,
  toColor: string,
  angle: number
) {
  if (!fromColor || !toColor) {
    return
  }

  const { x, y, center, ex, ey } = worldRect
  const from: Point = {
    x,
    y: center.y
  }
  const to: Point = {
    x: ex,
    y: center.y
  }
  if (angle % 90 === 0 && angle % 180) {
    from.x = center.x
    to.x = center.x
    if (angle % 270) {
      from.y = y
      to.y = ey
    } else {
      from.y = ey
      to.y = y
    }
  } else if (angle) {
    rotatePoint(from, angle, worldRect.center)
    rotatePoint(to, angle, worldRect.center)
  }

  // contributor: https://github.com/sunnyguohua/meta2d
  const grd = ctx.createLinearGradient(from.x, from.y, to.x, to.y)
  grd.addColorStop(0, fromColor)
  grd.addColorStop(1, toColor)
  return grd
}

function getBkGradient(ctx: CanvasRenderingContext2D, pen: Pen) {
  const { x, y, ex, width, height, center } = pen.calculative.worldRect
  const points = [
    { x: ex, y: y + height / 2 },
    { x: x, y: y + height / 2 }
  ]
  const { angle, colors } = formatGradient(pen.calculative.gradientColors)
  const r = getGradientR(angle, width, height)
  points.forEach((point) => {
    rotatePoint(point, angle, center)
  })
  return getLinearGradient(ctx, points, colors, r)
}

function drawBkLinearGradient(ctx: CanvasRenderingContext2D, pen: Pen) {
  const { worldRect, gradientFromColor, gradientToColor, gradientAngle } = pen.calculative
  return linearGradient(ctx, worldRect, gradientFromColor, gradientToColor, gradientAngle)
}

function getBkRadialGradient(ctx: CanvasRenderingContext2D, pen: Pen) {
  const { worldRect, gradientColors, gradientRadius } = pen.calculative
  if (!gradientColors) {
    return
  }

  const { width, height, center } = worldRect
  const { x: centerX, y: centerY } = center
  let r = width
  if (r < height) {
    r = height
  }
  r *= 0.5
  const { colors } = formatGradient(gradientColors)
  const grd = ctx.createRadialGradient(
    centerX,
    centerY,
    r * (gradientRadius || 0),
    centerX,
    centerY,
    r
  )
  colors.forEach((stop) => {
    grd.addColorStop(stop.i, stop.color)
  })

  return grd
}

/**
 * 避免副作用，把创建好后的径向渐变对象返回出来
 * @param ctx 画布绘制对象
 * @param pen 当前画笔
 * @returns 径向渐变
 */
function drawBkRadialGradient(ctx: CanvasRenderingContext2D, pen: Pen) {
  const { worldRect, gradientFromColor, gradientToColor, gradientRadius } = pen.calculative
  if (!gradientFromColor || !gradientToColor) {
    return
  }

  const { width, height, center } = worldRect
  const { x: centerX, y: centerY } = center
  let r = width
  if (r < height) {
    r = height
  }
  r *= 0.5
  const grd = ctx.createRadialGradient(
    centerX,
    centerY,
    r * (gradientRadius || 0),
    centerX,
    centerY,
    r
  )
  grd.addColorStop(0, gradientFromColor)
  grd.addColorStop(1, gradientToColor)

  return grd
}

/**
 * 更改 ctx 的 lineCap 属性
 */
export function setLineCap(ctx: CanvasRenderingContext2D, pen: Pen) {
  const lineCap = pen.lineCap || (pen.type ? 'round' : 'square')
  if (lineCap) {
    ctx.lineCap = lineCap
  } else if (pen.type) {
    ctx.lineCap = 'round'
  }
}

/**
 * 更改 ctx 的 lineJoin 属性
 */
export function setLineJoin(ctx: CanvasRenderingContext2D, pen: Pen) {
  const lineJoin = pen.lineJoin
  if (lineJoin) {
    ctx.lineJoin = lineJoin
  } else if (pen.type) {
    ctx.lineJoin = 'round'
  }
}

function ctxDrawLinearGradientPath(ctx: CanvasRenderingContext2D, pen: Pen) {
  const anchors = pen.calculative.worldAnchors
  const smoothLenth =
    pen.calculative.lineWidth * (pen.calculative.gradientSmooth || pen.calculative.lineSmooth || 0)
  for (let i = 0; i < anchors.length - 1; i++) {
    if ((pen.lineName === 'curve' || pen.lineName === 'mind') && anchors[i].curvePoints) {
      if (i > 0) {
        const lastCurvePoints = anchors[i - 1].curvePoints
        if (lastCurvePoints) {
          //上一个存在锚点
          smoothTransition(
            ctx,
            pen,
            smoothLenth,
            lastCurvePoints[lastCurvePoints.length - 1],
            anchors[i],
            anchors[i].curvePoints[0]
          )
        } else {
          smoothTransition(
            ctx,
            pen,
            smoothLenth,
            anchors[i - 1],
            anchors[i],
            anchors[i].curvePoints[0]
          )
        }
        //获取当前相对于0的位置
        const next = getSmoothAdjacent(smoothLenth, anchors[i], anchors[i].curvePoints[0])
        drawLinearGradientLine(ctx, pen, [next, anchors[i].curvePoints[1]])
      } else {
        drawLinearGradientLine(ctx, pen, [anchors[i], anchors[i].curvePoints[0]])
        drawLinearGradientLine(ctx, pen, [anchors[i].curvePoints[0], anchors[i].curvePoints[1]])
      }
      const len = anchors[i].curvePoints.length - 1
      for (let j = 1; j < len; j++) {
        drawLinearGradientLine(ctx, pen, [anchors[i].curvePoints[j], anchors[i].curvePoints[j + 1]])
      }
      const last = getSmoothAdjacent(smoothLenth, anchors[i + 1], anchors[i].curvePoints[len])
      drawLinearGradientLine(ctx, pen, [anchors[i].curvePoints[len], last])
    } else {
      let _next = anchors[i]
      let _last = anchors[i + 1]
      if (i > 0 && i < anchors.length - 1) {
        //有突兀的地方
        const lastCurvePoints = anchors[i - 1].curvePoints
        if (lastCurvePoints) {
          smoothTransition(
            ctx,
            pen,
            smoothLenth,
            lastCurvePoints[lastCurvePoints.length - 1],
            anchors[i],
            anchors[i + 1]
          )
        } else {
          smoothTransition(ctx, pen, smoothLenth, anchors[i - 1], anchors[i], anchors[i + 1])
        }
      }
      if (i > 0 && i < anchors.length - 1) {
        _next = getSmoothAdjacent(smoothLenth, anchors[i], anchors[i + 1])
      }
      if (i < anchors.length - 2) {
        _last = getSmoothAdjacent(smoothLenth, anchors[i + 1], anchors[i])
      }
      drawLinearGradientLine(ctx, pen, [_next, _last])
    }
  }
}

function smoothTransition(
  ctx: CanvasRenderingContext2D,
  pen: Pen,
  smoothLenth: number,
  p1: Point,
  p2: Point,
  p3: Point
) {
  const last = getSmoothAdjacent(smoothLenth, p2, p1)
  const next = getSmoothAdjacent(smoothLenth, p2, p3)
  const contrlPoint = { x: p2.x, y: p2.y }

  const points = getBezierPoints(
    pen.calculative.canvas.store.data.smoothNum || 20,
    last,
    contrlPoint,
    next
  )
  for (let k = 0; k < points.length - 1; k++) {
    drawLinearGradientLine(ctx, pen, [
      {
        x: points[k].x,
        y: points[k].y
      },
      {
        x: points[k + 1].x,
        y: points[k + 1].y
      }
    ])
  }
}

function smoothAnimateTransition(ctx: Path2D, smoothLenth: number, p2: Point, p3: Point) {
  const next = getSmoothAdjacent(smoothLenth, p2, p3)
  const contrlPoint = { x: p2.x, y: p2.y }

  ctx.quadraticCurveTo(contrlPoint.x, contrlPoint.y, next.x, next.y)
}

export function getGradientAnimatePath(pen: Pen) {
  const anchors = pen.calculative.worldAnchors
  const smoothLenth =
    pen.calculative.lineWidth * (pen.calculative.gradientSmooth || pen.calculative.lineSmooth || 0)
  //只创建一次
  const _path = new Path2D()
  for (let i = 0; i < anchors.length - 1; i++) {
    let _next = anchors[i]
    let _last = anchors[i + 1]
    if (i == 0) {
      _path.moveTo(anchors[i].x, anchors[i].y)
    }
    if (i > 0 && i < anchors.length - 1) {
      //有突兀的地方
      const lastCurvePoints = anchors[i - 1].curvePoints
      // const path = new Path2D();
      if (lastCurvePoints) {
        smoothAnimateTransition(_path, smoothLenth, anchors[i], anchors[i + 1])
      } else {
        smoothAnimateTransition(_path, smoothLenth, anchors[i], anchors[i + 1])
      }
    }
    if (i > 0 && i < anchors.length - 1) {
      _next = getSmoothAdjacent(smoothLenth, anchors[i], anchors[i + 1])
    }
    if (i < anchors.length - 2) {
      _last = getSmoothAdjacent(smoothLenth, anchors[i + 1], anchors[i])
    }
    _path.lineTo(_last.x, _last.y)
  }

  return _path
}

function getSmoothAdjacent(smoothLenth: number, p1: Point, p2: Point) {
  const nexLength = Math.sqrt((p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y))
  if (nexLength === 0) {
    return {
      x: p1.x,
      y: p1.y
    }
  }
  if (smoothLenth < nexLength) {
    return {
      x: p1.x + ((p2.x - p1.x) * smoothLenth) / nexLength,
      y: p1.y + ((p2.y - p1.y) * smoothLenth) / nexLength
    }
  } else {
    return {
      x: p1.x + (p2.x - p1.x) / nexLength / 2,
      y: p1.y + (p2.y - p1.y) / nexLength / 2
    }
  }
}

function getBezierPoints(num = 100, p1?: Point, p2?: Point, p3?: Point, p4?: Point) {
  let func = null
  const points = []
  if (!p3 && !p4) {
    func = oneBezier
  } else if (p3 && !p4) {
    func = twoBezier
  } else if (p3 && p4) {
    func = threeBezier
  }
  for (let i = 0; i < num; i++) {
    points.push(func(i / num, p1, p2, p3, p4))
  }
  if (p4) {
    points.push(p4)
  } else if (p3) {
    points.push(p3)
  }
  return points
}

/**
 * @desc 一阶贝塞尔
 * @param  t 当前百分比
 * @param  p1 起点坐标
 * @param  p2 终点坐标
 */
function oneBezier(t: number, p1: Point, p2: Point) {
  const { x: x1, y: y1 } = p1
  const { x: x2, y: y2 } = p2
  const x = x1 + (x2 - x1) * t
  const y = y1 + (y2 - y1) * t
  return { x, y }
}

/**
 * @desc 二阶贝塞尔
 * @param  t 当前百分比
 * @param  p1 起点坐标
 * @param  p2 终点坐标
 * @param  cp 控制点
 */
function twoBezier(t: number, p1: Point, cp: Point, p2: Point) {
  const { x: x1, y: y1 } = p1
  const { x: cx, y: cy } = cp
  const { x: x2, y: y2 } = p2
  const x = (1 - t) * (1 - t) * x1 + 2 * t * (1 - t) * cx + t * t * x2
  const y = (1 - t) * (1 - t) * y1 + 2 * t * (1 - t) * cy + t * t * y2
  return { x, y }
}

/**
 * @desc 三阶贝塞尔
 * @param  t 当前百分比
 * @param  p1 起点坐标
 * @param  p2 终点坐标
 * @param  cp1 控制点1
 * @param  cp2 控制点2
 */
function threeBezier(t: number, p1: Point, cp1: Point, cp2: Point, p2: Point) {
  const { x: x1, y: y1 } = p1
  const { x: x2, y: y2 } = p2
  const { x: cx1, y: cy1 } = cp1
  const { x: cx2, y: cy2 } = cp2
  const x =
    x1 * (1 - t) * (1 - t) * (1 - t) +
    3 * cx1 * t * (1 - t) * (1 - t) +
    3 * cx2 * t * t * (1 - t) +
    x2 * t * t * t
  const y =
    y1 * (1 - t) * (1 - t) * (1 - t) +
    3 * cy1 * t * (1 - t) * (1 - t) +
    3 * cy2 * t * t * (1 - t) +
    y2 * t * t * t
  return { x, y }
}
function drawLinearGradientLine(ctx: CanvasRenderingContext2D, pen: Pen, points: Point[]) {
  let colors = []
  if (pen.calculative.gradientColorStop) {
    colors = pen.calculative.gradientColorStop
  } else {
    colors = formatGradient(pen.calculative.lineGradientColors).colors
    pen.calculative.gradientColorStop = colors
  }
  ctx.strokeStyle = getLinearGradient(ctx, points, colors, pen.calculative.lineWidth / 2)
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  ctx.lineTo(points[1].x, points[1].y)
  ctx.stroke()
}

export function getFromAnchor(pen: Pen) {
  if (!pen || !pen.calculative.worldAnchors) {
    return
  }

  return pen.calculative.worldAnchors[0]
}

export function getToAnchor(pen: Pen) {
  if (!pen || !pen.calculative.worldAnchors) {
    return
  }

  return pen.calculative.worldAnchors[pen.calculative.worldAnchors.length - 1]
}
