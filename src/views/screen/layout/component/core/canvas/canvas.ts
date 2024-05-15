import type { F2d } from '../core'
import { HotkeyType, HoverType, MouseRight, defaultCursors, rotatedCursors } from '../data'
import { getLineR, pointInLine, pointInPolygon, pointInSimpleRect } from '../line'
import {
  CanvasLayer,
  LockState,
  PenType,
  calcInView,
  calcWorldAnchors,
  calcWorldRects,
  calcWorldRectsNode,
  ctxFlip,
  ctxRotate,
  drawImage,
  getFromAnchor,
  getGlobalColor,
  getParent,
  getPensDisableResize,
  getPensDisableRotate,
  getPensLock,
  getToAnchor,
  renderPen,
  setGlobalAlpha,
  setHover,
  translateRect,
  type Pen
} from '../pen'
import {
  PointType,
  TwoWay,
  calcCenter,
  calcCenterNode,
  hitPoint,
  rotatePoint,
  scalePen,
  scalePenNode,
  scalePoint,
  type Point
} from '../point'
import { calcRelativePoint, getRect, pointInRect, rectToPoints, type Rect } from '../rect'
import { globalStore, type Meta2dStore } from '../store'
import { deepClone, formatPadding, rgba, s8 } from '../utils'
import { CanvasImage } from './canvasImage'
import { CanvasTemplate } from './canvasTemplate'
import { createOffscreen } from './offscreen'

export class Canvas {
  canvas = document.createElement('canvas')
  offscreen = createOffscreen() as HTMLCanvasElement
  width: number
  height: number
  activeRect: Rect
  initActiveRect: Rect
  externalElements = document.createElement('div') // 1、 用来控制缩放
  clientRect?: DOMRect
  touchStart = 0
  touchStartTimer: any // 计时器清除
  mousePos: Point = { x: 0, y: 0 }
  timer: any
  resizeIndex = 0
  sizeCPs: Point[]
  pointSize = 8 as const
  canvasTemplate: CanvasTemplate
  canvasImage: CanvasImage
  canvasImageBottom: CanvasImage
  hoverType: HoverType
  mouseRight: any
  drawingLine: any
  lastRotate: number
  hotkeyType: any
  dragRect: Rect
  mouseDown: {
    restore: any
    x: number
    y: number
    clientX: number
    clientY: number
    pageX: number
    pageY: number
    buttons?: number | undefined
    ctrlKey?: boolean | undefined
    shiftKey?: boolean | undefined
    altKey?: boolean | undefined
  }
  // 即将取消活动状态的画笔，用于Ctrl选中/取消选中画笔
  private willInactivePen: Pen

  patchFlags = false
  lastMouseTime: number
  lastOffsetX: number
  lastOffsetY: number

  movingAnchor: Point // 正在移动中的瞄点
  private hoverTimer: number = 0
  constructor(
    public parent: F2d,
    public parentElement: HTMLElement,
    public store: Meta2dStore
  ) {
    this.canvasTemplate = new CanvasTemplate(parentElement, store)
    this.canvasTemplate.canvas.style.zIndex = '1'

    parentElement.appendChild(this.canvas)
    this.canvas.style.position = 'absolute'
    this.canvas.style.backgroundRepeat = 'no-repeat'
    this.canvas.style.backgroundSize = '100% 100%'
    this.canvas.style.zIndex = '3'

    this.canvasImageBottom = new CanvasImage(parentElement, store, true)
    this.canvasImageBottom.canvas.style.zIndex = '2'
    this.canvasImage = new CanvasImage(parentElement, store)
    this.canvasImage.canvas.style.zIndex = '4'

    this.externalElements.style.position = 'absolute'
    this.externalElements.style.left = '0'
    this.externalElements.style.top = '0'
    this.externalElements.style.outline = 'none'
    this.externalElements.style.background = 'transparent'
    this.externalElements.style.zIndex = '5'
    parentElement.style.position = 'relative'
    parentElement.appendChild(this.externalElements)

    this.listen()
    window?.addEventListener('resize', this.onResize)
  }
  listen() {
    this.externalElements.ondragover = (e) => e.preventDefault()
    this.externalElements.ondrop = this.ondrop // 用来监听到达涂层位置
    this.externalElements.oncontextmenu = (e) => e.preventDefault()
    this.externalElements.onwheel = this.onwheel // 滑轮操作
    this.externalElements.ontouchstart = this.ontouchstart
    this.externalElements.onmousedown = (e) => {
      this.onMouseDown({
        x: e.offsetX,
        y: e.offsetY,
        clientX: e.clientX,
        clientY: e.clientY,
        pageX: e.pageX,
        pageY: e.pageY,
        ctrlKey: e.ctrlKey || e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        buttons: e.buttons
      })
    }
    this.externalElements.onmousemove = (e) => {
      if (e.target !== this.externalElements) {
        return
      }
      this.onMouseMove({
        x: e.offsetX,
        y: e.offsetY,
        clientX: e.clientX,
        clientY: e.clientY,
        pageX: e.pageX,
        pageY: e.pageY,
        ctrlKey: e.ctrlKey || e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        buttons: e.buttons
      })
    }
    this.externalElements.onmouseup = (e) => {
      this.onMouseUp({
        x: e.offsetX,
        y: e.offsetY,
        clientX: e.clientX,
        clientY: e.clientY,
        pageX: e.pageX,
        pageY: e.pageY,
        ctrlKey: e.ctrlKey || e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        buttons: e.buttons,
        button: e.button
      })
    }

    // this.render()
  }

  ondrop = async (event: DragEvent) => {
    if (this.store.data.locked) {
      console.warn('canvas is locked, can not drop')
      return
    }
    // Fix bug: 在 firefox 上拖拽图片会打开新页
    event.preventDefault()
    event.stopPropagation()
    const json = event.dataTransfer.getData('Meta2d') || event.dataTransfer.getData('Text') // 获取拖拽数据

    let obj = null
    try {
      if (json) {
        obj = JSON.parse(json)
      }
    } catch (e) {}
    obj = Array.isArray(obj) ? obj : [obj]
    if (obj[0] && obj[0].draggable !== false) {
      const pt = { x: event.offsetX, y: event.offsetY }
      this.calibrateMouse(pt)
      this.dropPens(obj, pt)
      // this.addCaches = [];
    }
  }
  dropPens = async (pens: Pen[], e: Point) => {
    for (const pen of pens) {
      // TODO: randomCombineId 会更改 id， 此处应该不存在空 id
      if (!pen.id) {
        pen.id = s8()
      }
      !pen.calculative && (pen.calculative = { canvas: this })
      this.store.pens[pen.id] = pen
    }
    for (const pen of pens) {
      if (!pen.parentId) {
        pen.width *= this.store.data.scale
        pen.height *= this.store.data.scale
        pen.x = e.x - pen.width / 2
        pen.y = e.y - pen.height / 2

        if (pen.tags && pen.tags.includes('meta3d')) {
          pen.x = this.store.data.origin.x
          pen.y = this.store.data.origin.y
        }
      }
    }

    //大屏区域
    // const width = this.store.data.width || this.store.options.width
    // const height = this.store.data.height || this.store.options.height
    // if (width && height) {
    //   const rect = {
    //     x: this.store.data.origin.x,
    //     y: this.store.data.origin.y,
    //     width: width * this.store.data.scale,
    //     height: height * this.store.data.scale
    //   }
    //   let flag = true
    //   for (const pen of pens) {
    //     if (!pen.parentId) {
    //       const points = [
    //         { x: pen.x, y: pen.y },
    //         { x: pen.x + pen.width, y: pen.y },
    //         { x: pen.x, y: pen.y + pen.height },
    //         { x: pen.x + pen.width, y: pen.y + pen.height },
    //         { x: pen.x + pen.width / 2, y: pen.y + pen.height / 2 }
    //       ] // 四个角 以及中心点
    //       if (
    //         (pen.x === rect.x &&
    //           pen.y === rect.y &&
    //           pen.width === rect.width &&
    //           pen.height === rect.height) ||
    //         points.some((point) => pointInRect(point, rect))
    //       ) {
    //         flag = false
    //         //严格范围模式下对齐大屏边界
    //         if (this.store.options.strictScope) {
    //           if (pen.x < rect.x) {
    //             pen.x = rect.x
    //           }
    //           if (pen.y < rect.y) {
    //             pen.y = rect.y
    //           }
    //           if (pen.x + pen.width > rect.x + rect.width) {
    //             pen.x = rect.x + rect.width - pen.width
    //           }
    //           if (pen.y + pen.height > rect.y + rect.height) {
    //             pen.y = rect.y + rect.height - pen.height
    //           }
    //         }
    //         break
    //       }
    //     }
    //   }
    //   if (flag) {
    //     console.info('画笔在大屏范围外')
    //     return
    //   }
    // }

    await this.addPens(pens, true)
    this.active(pens.filter((pen) => !pen.parentId))
    this.render()
    this.externalElements.focus() // 聚焦
  }

  async addPens(pens: Pen[], history?: boolean): Promise<Pen[]> {
    // if (this.beforeAddPens && (await this.beforeAddPens(pens)) != true) {
    //   return [];
    // }
    const list: Pen[] = []
    for (const pen of pens) {
      // if (this.beforeAddPen && this.beforeAddPen(pen) != true) {
      //   continue;
      // }
      this.makePen(pen)
      list.push(pen)
    }

    const pen = list[0]
    // console.log(pen, 'pen', this.store.data.scale)

    const div = document.createElement('div')
    div.style.position = 'absolute'
    div.style.width = `${pen.width}px`
    div.style.height = `${pen.height}px`
    div.className = 'dragitem'
    div.style.left = pen.x + this.store.data.x + 'px'
    div.style.top = pen.y + this.store.data.y + 'px'
    div.style.outline = 'none'
    div.style.background = 'transparent'
    div.style.zIndex = '5'
    div.style.pointerEvents = 'none'
    // div.style.scale = this.store.data.scale as any
    div.setAttribute('draggable', true)
    div.setAttribute('data-x', pen.x)
    div.setAttribute('data-y', pen.y)
    div.setAttribute('data-w', pen.width)
    div.setAttribute('data-h', pen.height)
    this.parentElement.appendChild(div)
    this.render()
    // this.store.emitter.emit('add', list);
    if (history) {
      // this.pushHistory({ type: EditType.Add, pens: deepClone(list, true) });
    }
    return list
  }

  makePen(pen: Pen) {
    if (!pen.id) {
      pen.id = s8()
    }
    if (
      Math.abs(this.store.lastScale - this.store.data.scale) < 0.0001 &&
      this.store.sameTemplate &&
      this.store.templatePens[pen.id] &&
      // pen.template
      pen.canvasLayer === CanvasLayer.CanvasTemplate
    ) {
      pen = this.store.templatePens[pen.id]
      this.store.data.pens.push(pen)
      this.updatePenRect(pen)
      return
    }
    this.store.data.pens.push(pen)
    this.store.pens[pen.id] = pen

    // 集中存储path，避免数据冗余过大
    if (pen.path) {
      !pen.pathId && (pen.pathId = s8())
      const paths = this.store.data.paths
      !paths[pen.pathId] && (paths[pen.pathId] = pen.path)

      pen.path = undefined
    }
    // end

    if (pen.lineWidth == undefined) {
      pen.lineWidth = 1
    }
    const { fontSize, lineHeight } = this.store.options
    if (!pen.fontSize) {
      pen.fontSize = fontSize
    }
    if (!pen.lineHeight) {
      pen.lineHeight = lineHeight
    }
    if (pen.image && pen.name !== 'gif' && pen.canvasLayer === undefined) {
      if (pen.isBottom) {
        pen.canvasLayer = CanvasLayer.CanvasImageBottom
      } else {
        pen.canvasLayer = CanvasLayer.CanvasImage
      }
      delete pen.isBottom
    }
    if (pen.template) {
      pen.canvasLayer = CanvasLayer.CanvasTemplate
    }
    pen.calculative = { canvas: this, singleton: pen.calculative?.singleton }
    if (pen.video || pen.audio) {
      pen.calculative.onended = (pen: Pen) => {
        // this.nextAnimate(pen);
      }
    }
    for (const k in pen) {
      if (typeof pen[k] !== 'object' || k === 'lineDash') {
        pen.calculative[k] = pen[k]
      }
    }
    pen.calculative.image = undefined
    pen.calculative.backgroundImage = undefined
    pen.calculative.strokeImage = undefined
    if (!pen.anchors && globalStore.anchors[pen.name]) {
      if (!pen.anchors) {
        pen.anchors = []
      }
      globalStore.anchors[pen.name](pen)
    }

    this.updatePenRect(pen)
    if (!pen.anchors && pen.calculative.worldAnchors) {
      pen.anchors = pen.calculative.worldAnchors.map((pt) => {
        return calcRelativePoint(pt, pen.calculative.worldRect)
      })
    }
    !pen.rotate && (pen.rotate = 0)
    // this.loadImage(pen);
    // this.parent.penNetwork(pen);
  }

  updatePenRect(
    pen: Pen,
    {
      worldRectIsReady,
      playingAnimate
    }: {
      worldRectIsReady?: boolean
      playingAnimate?: boolean
      noChildren?: boolean
    } = {}
  ) {
    if (worldRectIsReady) {
      // calcPenRect(pen);
    } else {
      calcWorldRects(pen)
    }

    if (!playingAnimate) {
      // this.setCalculativeByScale(pen);
    }
    calcWorldAnchors(pen)
    // calcIconRect(this.store.pens, pen);
    // calcTextRect(pen);
    calcInView(pen)

    if (globalStore.path2dDraws[pen.name]) {
      this.store.path2dMap.set(pen, globalStore.path2dDraws[pen.name](pen))
    }

    console.log(this.store.path2dMap)

    pen.calculative.patchFlags = true
    this.patchFlags = true

    if (pen.children) {
      pen.children.forEach((id) => {
        const child: Pen = this.store.pens[id]
        child && this.updatePenRect(child, { worldRectIsReady: false })
      })
    }
    pen.type && this.initLineRect(pen)
    if (pen.calculative.gradientTimer) {
      clearTimeout(pen.calculative.gradientTimer)
    }
    pen.calculative.gradientTimer = setTimeout(() => {
      if (pen.calculative.lineGradient) {
        pen.calculative.lineGradient = null
      }
      if (pen.calculative.gradient) {
        pen.calculative.gradient = null
      }
      if (pen.calculative.radialGradient) {
        pen.calculative.radialGradient = null
      }
      this.patchFlags = true
      pen.calculative.gradientTimer = undefined
    }, 50)
  }
  onwheel = (e: WheelEvent) => {
    if (this.store.hover) {
      if (this.store.hover.onWheel) {
        this.store.hover.onWheel(this.store.hover, e)
        return
      }
    }
    if (this.store.options.disableScale) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    const { offsetX: x, offsetY: y } = e

    if (
      !e.ctrlKey &&
      Math.abs((e as any).wheelDelta) < 100 &&
      e.deltaY.toString().indexOf('.') === -1
    ) {
      // if (this.store.options.scroll && !e.metaKey && this.scroll) {
      //   this.scroll.wheel(e.deltaY < 0);
      //   return;
      // }
      const scale = this.store.data.scale || 1
      this.translate(-e.deltaX / scale, -e.deltaY / scale, {
        x,
        y
      }) // 当前scale下的 鼠标滚动距离
      return
    }
    if (Math.abs((e as any).wheelDelta) > 100) {
      //鼠标滚轮滚动 scroll模式下是上下滚动而不是缩放
      // if (this.store.options.scroll && this.scroll) {
      // this.scroll.wheel(e.deltaY < 0)
      // return
      // }
    }

    //禁止触摸屏双指缩放操作
    if (this.store.options.disableTouchPadScale) {
      return
    }

    let scaleOff = 0.015
    const isMac = /mac os /i.test(navigator.userAgent)
    if (isMac) {
      if (!e.ctrlKey) {
        scaleOff *= (e as any).wheelDeltaY / 240
      } else if (e.deltaY > 0) {
        scaleOff *= -1
      }
    } else {
      let offset = 0.2
      if (e.deltaY.toString().indexOf('.') !== -1) {
        offset = 0.01
      }
      if (e.deltaY > 0) {
        scaleOff = -offset
      } else {
        scaleOff = offset
      }
    }

    this.scale(this.store.data.scale + scaleOff, { x, y })
    this.externalElements.focus() // 聚焦
  }
  ontouchstart = (e: TouchEvent) => {
    if (this.store.data.locked === LockState.Disable) {
      return
    }
    if (this.touchStartTimer) {
      clearTimeout(this.touchStartTimer)
    }
    this.touchStartTimer = setTimeout(() => {
      this.touchStart = performance.now()
      const x = e.touches[0].pageX - this.clientRect.x
      const y = e.touches[0].pageY - this.clientRect.y
      const pos: Point = { x, y }
      this.calibrateMouse(pos)
      // this.getHover(pos)
      this.onMouseDown({
        x,
        y,
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY,
        pageX: e.touches[0].pageX,
        pageY: e.touches[0].pageY,
        ctrlKey: e.ctrlKey || e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        buttons: 1
      })

      if (e.touches.length === 2) {
        this.initTouchDis = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        )
        this.initScale = this.store.data.scale
        this.startTouches = e.touches
        this.touchCenter = {
          x: e.touches[0].pageX + (e.touches[1].pageX - e.touches[0].pageX) / 2 - this.clientRect.x,
          y: e.touches[0].pageY + (e.touches[1].pageY - e.touches[0].pageY) / 2 - this.clientRect.y
        }

        return
      } else if (e.touches.length === 3) {
        this.store.emitter.emit('contextmenu', {
          e: {
            x,
            y,
            clientX: e.touches[0].clientX,
            clientY: e.touches[0].clientY,
            pageX: e.touches[0].pageX,
            pageY: e.touches[0].pageY
          },
          clientRect: this.clientRect
        })

        e.preventDefault()
        e.stopPropagation()
      }

      this.touchStartTimer = undefined
    }, 50)
  }
  onMouseDown = (e: {
    x: number
    y: number
    clientX: number
    clientY: number
    pageX: number
    pageY: number
    buttons?: number
    ctrlKey?: boolean
    shiftKey?: boolean
    altKey?: boolean
  }) => {
    if (e.buttons === 2 && !this.drawingLine) {
      this.mouseRight = MouseRight.Down
    }
    // this.hideInput()
    if (this.store.data.locked === LockState.Disable || (e.buttons !== 1 && e.buttons !== 2)) {
      this.hoverType = HoverType.None
      return
    }

    // if (this.magnifierCanvas.magnifier) {
    //   return
    // }

    this.calibrateMouse(e)
    this.mousePos.x = e.x
    this.mousePos.y = e.y

    this.mouseDown = e
    this.lastMouseTime = performance.now()

    // Set anchor of pen.
    // if (this.hotkeyType === HotkeyType.AddAnchor) {
    //   this.setAnchor(this.store.pointAt)
    //   return
    // }

    //shift 快捷添加锚点并连线
    // if (!this.store.options.autoAnchor && !this.drawingLine) {
    //   if (e.shiftKey && e.ctrlKey && e.altKey) {
    //     this.setAnchor(this.store.pointAt)
    //     this.drawingLineName = this.store.options.drawingLineName
    //     const anchor = this.store.activeAnchor
    //     if (!anchor) {
    //       return
    //     }
    //     const pt: Point = {
    //       id: s8(),
    //       x: anchor.x,
    //       y: anchor.y
    //     }
    //     this.drawingLine = this.createDrawingLine(pt)
    //     const _pt = getFromAnchor(this.drawingLine)
    //     this.drawingLine.calculative.activeAnchor = _pt
    //     connectLine(this.store.hover, anchor, this.drawingLine, pt)
    //     this.drawline()
    //     return
    //   }
    // }

    // Translate
    if (
      this.hotkeyType === HotkeyType.Translate ||
      (this.mouseRight === MouseRight.Down && !this.store.options.mouseRightActive)
    ) {
      return
    }

    // 正在连线
    // if (this.drawingLine) {
    //   // 单击在锚点上，完成绘画
    //   if (this.store.hoverAnchor) {
    //     const to = getToAnchor(this.drawingLine)
    //     if (this.store.hoverAnchor.type === PointType.Line) {
    //       getDistance(to, this.store.hoverAnchor, this.store)
    //     } else {
    //       to.x = this.store.hoverAnchor.x
    //       to.y = this.store.hoverAnchor.y
    //     }
    //     connectLine(this.store.hover, this.store.hoverAnchor, this.drawingLine, to)
    //     this.drawline()
    //     this.finishDrawline(true)
    //     return
    //   }

    //   //shift快捷添加锚点并完成连线
    //   if (!this.store.options.autoAnchor) {
    //     if (e.shiftKey && e.altKey && e.ctrlKey) {
    //       this.setAnchor(this.store.pointAt)
    //       const to = getToAnchor(this.drawingLine)
    //       const anchor = this.store.activeAnchor
    //       if (!anchor) {
    //         return
    //       }
    //       to.x = anchor.x
    //       to.y = anchor.y
    //       connectLine(this.store.hover, anchor, this.drawingLine, to)
    //       this.drawline()
    //       this.finishDrawline(true)
    //       return
    //     }
    //   }

    //   // 右键，完成绘画
    //   if (
    //     e.buttons === 2 ||
    //     (this.drawingLineName === 'mind' &&
    //       this.drawingLine?.calculative.worldAnchors.length > 1) ||
    //     (this.store.options.drawingLineLength &&
    //       this.drawingLine?.calculative.worldAnchors.length > this.store.options.drawingLineLength)
    //   ) {
    //     this.finishDrawline(true)
    //     if (this.store.active[0]?.anchors[0].connectTo || this.store.active.length == 0) {
    //       this.drawingLineName = ''
    //     } else {
    //       this.drawingLineName = this.store.options.drawingLineName
    //     }
    //     return
    //   }

    //   // 自动锚点（单击节点），完成绘画
    //   if (this.store.options.autoAnchor && this.hoverType === HoverType.Node) {
    //     const to = getToAnchor(this.drawingLine)
    //     const anchor = nearestAnchor(this.store.hover, e)
    //     to.x = anchor.x
    //     to.y = anchor.y
    //     this.drawingLine.autoTo = true
    //     connectLine(this.store.hover, anchor, this.drawingLine, to)
    //     this.drawline()
    //     this.finishDrawline(true)

    //     return
    //   }

    //   // 添加点
    //   const to = getToAnchor(this.drawingLine)

    //   if (to.isTemp) {
    //     this.drawingLine.calculative.activeAnchor =
    //       this.drawingLine.calculative.worldAnchors[
    //         this.drawingLine.calculative.worldAnchors.length - 2
    //       ]
    //     to.isTemp = undefined
    //   } else {
    //     this.drawingLine.calculative.activeAnchor = to
    //     this.drawingLine.calculative.worldAnchors.push({
    //       x: to.x,
    //       y: to.y,
    //       penId: to.penId
    //     })
    //   }
    //   this.drawingLine.calculative.drawlineH = undefined
    //   this.drawingLineName !== 'polyline' && this.drawline()
    // }

    // 单击在节点上，通过自动锚点连线
    // if (this.drawingLineName) {
    //   if (this.hoverType === HoverType.Node) {
    //     if (this.store.options.autoAnchor) {
    //       this.inactive(true)
    //       const anchor = nearestAnchor(this.store.hover, e)
    //       this.store.hoverAnchor = anchor
    //       const pt: Point = { id: s8(), x: anchor.x, y: anchor.y }
    //       this.drawingLine = this.createDrawingLine(pt)
    //       this.drawingLine.autoFrom = true
    //       connectLine(this.store.hover, anchor, this.drawingLine, pt)
    //     } else {
    //       this.inactive()
    //       this.hoverType = HoverType.None
    //     }
    //   } else if (this.hoverType === HoverType.NodeAnchor) {
    //     //钢笔模式下 可以连节点锚点
    //     this.drawingLineName = this.store.options.drawingLineName
    //     const pt: Point = {
    //       id: s8(),
    //       x: this.store.hoverAnchor.x,
    //       y: this.store.hoverAnchor.y
    //     }
    //     this.drawingLine = this.createDrawingLine(pt)
    //     this.drawingLine.calculative.activeAnchor = pt
    //     connectLine(this.store.hover, this.store.hoverAnchor, this.drawingLine, pt)

    //     // this.drawline();
    //   } else if (!this.drawingLine && this.drawingLineName !== 'curve') {
    //     this.inactive(true)
    //     const pt: Point = { id: s8(), x: e.x, y: e.y }
    //     this.drawingLine = this.createDrawingLine(pt)
    //     this.drawingLine.calculative.activeAnchor = pt
    //   }
    // } else if (this.pencil) {
    //   this.inactive(true)
    //   const penId = s8()
    //   const pt: Point = { x: e.x, y: e.y, id: s8(), penId }
    //   this.pencilLine = this.getInitPencilLine(pt)
    // } else {

    switch (this.hoverType) {
      case HoverType.None:
        // ;(this.store.data.rule || this.store.options.rule) &&
        //   !this.store.options.disableRuleLine &&
        //   this.addRuleLine(e)
        // if (this.store.options.resizeMode) {
        //   this.hotkeyType = HotkeyType.None
        // }
        this.inactive()
        break
      case HoverType.Node:
      case HoverType.Line:
        if (this.store.hover) {
          const pen = getParent(this.store.hover, true) || this.store.hover
          if (e.ctrlKey && !e.shiftKey) {
            if (pen.calculative.active) {
              this.willInactivePen = pen
            } else {
              pen.calculative.active = true
              // setChildrenActive(pen) // 子节点也设置为active
              this.store.active.push(pen)
              // this.store.emitter.emit('active', this.store.active)
            }
            this.patchFlags = true
          } else if (e.ctrlKey && e.shiftKey && this.store.hover.parentId) {
            this.active([this.store.hover])
          } else {
            if (!pen.calculative.active) {
              this.active([pen])
              if (this.store.options.resizeMode) {
                this.hotkeyType = HotkeyType.Resize
              }
            }
          }

          this.calcActiveRect()
        }
        break
      case HoverType.LineAnchor:
        this.store.activeAnchor = this.store.hoverAnchor
        this.store.hover.calculative.activeAnchor = this.store.hoverAnchor
        this.active([this.store.hover])
        break
      case HoverType.LineAnchorPrev:
      case HoverType.LineAnchorNext:
        if (this.store.activeAnchor) {
          // 备份，方便移动锚点方向
          // this.prevAnchor = { ...this.store.activeAnchor.prev }
          // this.nextAnchor = { ...this.store.activeAnchor.next }
        }
        break
      case HoverType.Resize:
        // this.activeInitPos = []
        // this.store.active.forEach((pen) => {
        //   this.activeInitPos.push({
        //     x: (pen.calculative.worldRect.x - this.activeRect.x) / this.activeRect.width,
        //     y: (pen.calculative.worldRect.y - this.activeRect.y) / this.activeRect.height
        //   })
        // })
        break
    }
    //   this.store.emitter.emit('mousedown', {
    //     x: e.x,
    //     y: e.y,
    //     pen: this.store.hover
    //   })
    // }

    this.render()
  }

  onMouseMove = (e: {
    x: number
    y: number
    clientX: number
    clientY: number
    pageX: number
    pageY: number
    buttons?: number
    ctrlKey?: boolean
    shiftKey?: boolean
    altKey?: boolean
  }) => {
    if (this.store.data.locked === LockState.Disable) {
      this.hoverType = HoverType.None
      return
    }
    // 防止异常情况导致mouseup事件没有触发
    if (this.mouseDown && !this.mouseDown.restore && e.buttons !== 1 && e.buttons !== 2) {
      this.onMouseUp(e)
      return
    }
    // 避免鼠标点击和移动一起触发，误抖动
    if (this.lastMouseTime) {
      const now = performance.now()
      if (now - this.lastMouseTime < 50) {
        this.lastMouseTime = 0
        return
      }
      this.lastMouseTime = 0
    }

    this.calibrateMouse(e)
    this.mousePos.x = e.x
    this.mousePos.y = e.y
    // if (this.magnifierCanvas.magnifier) {
    //   this.render()
    //   return
    // }

    if (this.mouseDown && !this.store.options.disableTranslate) {
      // 画布平移前提
      if (this.mouseRight === MouseRight.Down) {
        this.mouseRight = MouseRight.Translate
      }
      // Translate
      if (
        this.store.data.locked === LockState.DisableEdit ||
        this.store.data.locked === LockState.DisableScale ||
        this.hotkeyType === HotkeyType.Translate ||
        this.mouseRight === MouseRight.Translate
      ) {
        const { scale } = this.store.data
        // if (Math.abs(e.x - this.mouseDown.x) > 30) {
        //   return;
        // }
        let x = (e.x - this.mouseDown.x) / scale
        let y = (e.y - this.mouseDown.y) / scale
        e.shiftKey && !e.ctrlKey && (y = 0)
        e.ctrlKey && (x = 0)
        this.translate(x, y, {
          x,
          y
        })
        return
      }

      if (this.store.data.locked) {
        return
      }

      // if (!this.drawingLine && !this.pencil) {
      //   if (!this.drawingLineName && !this.movingAnchor) {
      //     // 在锚点上开始连线
      //     if (this.hoverType === HoverType.NodeAnchor) {
      //       if (!this.store.hoverAnchor) {
      //         return
      //       }
      //       this.drawingLineName = this.store.options.drawingLineName
      //       const pt: Point = {
      //         id: s8(),
      //         x: this.store.hoverAnchor.x,
      //         y: this.store.hoverAnchor.y
      //       }
      //       this.drawingLine = this.createDrawingLine(pt)
      //       this.drawingLine.calculative.activeAnchor = pt
      //       connectLine(this.store.hover, this.store.hoverAnchor, this.drawingLine, pt)

      //       this.drawline()

      //       return
      //     }
      //   }
      //   // 钢笔画线
      //   else if (this.drawingLineName && this.hoverType === HoverType.None) {
      //     const pt: Point = { id: s8(), x: e.x, y: e.y }
      //     this.drawingLine = this.createDrawingLine(pt)
      //     this.drawingLine.calculative.activeAnchor = pt
      //     this.drawline()
      //     return
      //   }

      // 框选
      // if (e.buttons === 1 && !this.hoverType && !this.hotkeyType) {
      //   this.dragRect = {
      //     x: Math.min(this.mouseDown.x, e.x),
      //     y: Math.min(this.mouseDown.y, e.y),
      //     ex: Math.max(this.mouseDown.x, e.x),
      //     ey: Math.max(this.mouseDown.y, e.y),
      //     width: Math.abs(e.x - this.mouseDown.x),
      //     height: Math.abs(e.y - this.mouseDown.y)
      //   }
      //   this.render()
      //   return
      // }

      //   // 移动节点锚点
      //   if (this.movingAnchor) {
      //     const x = e.x - this.movingAnchor.x
      //     const y = e.y - this.movingAnchor.y
      //     this.translateAnchor(x, y)
      //     this.render()
      //     return
      //   } else if (!this.store.active[0]?.locked) {
      //     const pt = { x: e.x, y: e.y }
      //     // Move line anchor
      //     if (this.hoverType === HoverType.LineAnchor) {
      //       if (
      //         (this.dockInAnchor(e) || this.store.active[0]?.lineName === 'line') &&
      //         !this.store.options.disableDock &&
      //         !this.store.options.disableLineDock
      //       ) {
      //         this.clearDock()

      //         this.dock = calcAnchorDock(this.store, pt, this.store.activeAnchor)
      //         this.dock?.xDock && (pt.x += this.dock.xDock.step)
      //         this.dock?.yDock && (pt.y += this.dock.yDock.step)
      //       }
      //       this.moveLineAnchor(pt, e)
      //       return
      //     }

      //     // Move line anchor prev
      //     if (this.hoverType === HoverType.LineAnchorPrev) {
      //       this.moveLineAnchorPrev(e)
      //       return
      //     }

      //     // Move line anchor next
      //     if (this.hoverType === HoverType.LineAnchorNext) {
      //       this.moveLineAnchorNext(e)
      //       return
      //     }
      //   }

      //   // Rotate
      //   if (this.hoverType === HoverType.Rotate) {
      //     this.rotatePens({ x: e.x, y: e.y })
      //     return
      //   }

      //   // Resize
      //   if (this.hoverType === HoverType.Resize) {
      //     this.resizePens(e)
      //     return
      //   }

      //   // Move
      //   if (this.hoverType === HoverType.Node || this.hoverType === HoverType.Line) {
      //     const x = e.x - this.mouseDown.x
      //     const y = e.y - this.mouseDown.y
      //     const shake = 20
      //     if (e.ctrlKey && !e.shiftKey && (Math.abs(x) >= shake || Math.abs(y) >= shake)) {
      //       this.willInactivePen = undefined
      //     }
      //     if (this.store.active.length === 1) {
      //       const activePen = this.store.active[0]
      //       if (activePen.locked < LockState.DisableMove) {
      //         activePen?.onMouseMove?.(activePen, this.mousePos)
      //       }
      //     }
      //     this.movePens(e)
      //     return
      //   }
      // } else if (this.pencil) {
      //   const pt: Point = { ...e }
      //   pt.id = s8()
      //   pt.penId = this.pencilLine.id
      //   this.pencilLine.calculative.worldAnchors.push(pt)
      //   this.store.path2dMap.set(
      //     this.pencilLine,
      //     globalStore.path2dDraws[this.pencilLine.name](this.pencilLine)
      //   )
      //   this.patchFlags = true
      // }
    }

    if (this.drawingLine) {
      const pt: Point = { ...e }
      pt.id = s8()
      pt.penId = this.drawingLine.id

      // dock
      if (!this.store.options.disableDock && !this.store.options.disableLineDock) {
        this.clearDock()
        this.dock = calcAnchorDock(this.store, pt)
        this.dock?.xDock && (pt.x += this.dock.xDock.step)
        this.dock?.yDock && (pt.y += this.dock.yDock.step)
      }
      if (
        this.mouseDown &&
        this.drawingLineName === 'curve' &&
        !this.drawingLine.calculative.worldAnchors[0].connectTo
      ) {
        this.drawline(pt)
      } else {
        let to: Point
        if (this.drawingLine.calculative.worldAnchors.length > 1) {
          to = getToAnchor(this.drawingLine)
        }

        if (to) {
          to.prev = undefined
          to.next = undefined
          if (!to.id) {
            to.id = s8()
          }
          to.x = pt.x
          to.y = pt.y
          to.connectTo = undefined
        } else {
          to = { ...pt }
          this.drawingLine.calculative.worldAnchors.push(to)
        }
        if (this.hoverType === HoverType.NodeAnchor || this.hoverType === HoverType.LineAnchor) {
          if (this.store.hoverAnchor.type !== PointType.Line) {
            to.x = this.store.hoverAnchor.x
            to.y = this.store.hoverAnchor.y
          }
          to.connectTo = this.store.hoverAnchor.penId
          if (this.drawingLineName === 'polyline') {
            to.isTemp = false
          }
        }

        if (this.drawingLineName === 'line') {
          if (e.ctrlKey && !e.shiftKey) {
            to.x =
              this.drawingLine.calculative.worldAnchors[
                this.drawingLine.calculative.worldAnchors.length - 2
              ].x
          } else if (e.shiftKey && !e.ctrlKey) {
            to.y =
              this.drawingLine.calculative.worldAnchors[
                this.drawingLine.calculative.worldAnchors.length - 2
              ].y
          } else if (e.shiftKey && e.ctrlKey) {
            const last =
              this.drawingLine.calculative.worldAnchors[
                this.drawingLine.calculative.worldAnchors.length - 2
              ]
            this.getSpecialAngle(to, last)
          }
        }

        this.drawline()
      }
    }

    globalThis.debug && console.time('hover')
    const now = performance.now()
    if (now - this.hoverTimer > 50) {
      this.hoverTimer = now

      this.getHover(e)
    }
    globalThis.debug && console.timeEnd('hover')
    if (this.hotkeyType === HotkeyType.AddAnchor) {
      this.patchFlags = true
    }
    this.render(false)
  }

  onMouseUp = (e: {
    x: number
    y: number
    clientX: number
    clientY: number
    pageX: number
    pageY: number
    buttons?: number
    ctrlKey?: boolean
    shiftKey?: boolean
    altKey?: boolean
    button?: number
  }) => {
    if (this.store.data.locked === LockState.Disable) {
      this.hoverType = HoverType.None
      return
    }

    if (!this.mouseDown) {
      return
    }

    // if (this.mouseRight === MouseRight.Down) {
    //   this.store.emitter.emit('contextmenu', {
    //     e,
    //     clientRect: this.clientRect,
    //     pen: this.store.hover
    //   })
    // }
    this.mouseRight = MouseRight.None

    this.calibrateMouse(e)
    this.mousePos.x = e.x
    this.mousePos.y = e.y
    // this.pencil && this.finishPencil()

    // if (this.drawingLine) {
    //   // 在锚点上，完成绘画
    //   if (this.store.hoverAnchor) {
    //     const to = getToAnchor(this.drawingLine)
    //     if (this.store.hoverAnchor.type === PointType.Line) {
    //       getDistance(to, this.store.hoverAnchor, this.store)
    //     } else {
    //       to.x = this.store.hoverAnchor.x
    //       to.y = this.store.hoverAnchor.y
    //     }
    //     connectLine(this.store.hover, this.store.hoverAnchor, this.drawingLine, to)
    //     this.drawline()
    //     this.finishDrawline(true)

    //     return
    //   }

    //   // 自动锚点（单击节点），完成绘画
    //   if (this.store.options.autoAnchor && this.hoverType === HoverType.Node) {
    //     const to = getToAnchor(this.drawingLine)
    //     const anchor = nearestAnchor(this.store.hover, e)
    //     to.x = anchor.x
    //     to.y = anchor.y
    //     this.drawingLine.autoTo = true
    //     connectLine(this.store.hover, anchor, this.drawingLine, to)
    //     this.drawline()
    //     this.finishDrawline(true)

    //     return
    //   }
    // }

    // 拖拽连线锚点
    if (
      this.hoverType === HoverType.LineAnchor &&
      this.store.hover &&
      this.store.active[0] &&
      this.store.active[0].name === 'line' &&
      this.store.active[0] !== this.store.hover
    ) {
      const line = this.store.active[0]
      const from = getFromAnchor(line)
      const to = getToAnchor(line)
      // console.log(this.store.hoverAnchor, '/this.store.hoverAnchor')

      if (this.store.hoverAnchor) {
        const hover = this.store.hover
        const isHoverFrom = getFromAnchor(hover) === this.store.hoverAnchor
        const isHoverTo = getToAnchor(hover) === this.store.hoverAnchor
        const isActiveFrom = from === this.store.activeAnchor
        const isActiveTo = to === this.store.activeAnchor
        if (
          (e.ctrlKey || e.altKey) &&
          hover.type === PenType.Line &&
          (isHoverFrom || isHoverTo) &&
          (isActiveFrom || isActiveTo)
        ) {
          // 合并连线
          const hoverAnchors: Point[] = hover.calculative.worldAnchors.map((anchor) => {
            return {
              ...anchor,
              penId: line.id
            }
          })
          if (isHoverFrom) {
            hoverAnchors.shift()
          } else if (isHoverTo) {
            hoverAnchors.pop()
          }
          if ((isHoverFrom && isActiveFrom) || (isHoverTo && isActiveTo)) {
            hoverAnchors.reverse()
          }
          if (isActiveFrom) {
            line.calculative.worldAnchors[0].connectTo = undefined
            line.calculative.worldAnchors.unshift(...hoverAnchors)
          } else if (isActiveTo) {
            line.calculative.worldAnchors[line.calculative.worldAnchors.length - 1].connectTo =
              undefined
            line.calculative.worldAnchors.push(...hoverAnchors)
          }
          this.delete([hover])
          // TODO: 历史记录

          this.render()
        } else {
          // 连接连线
          // if (this.store.activeAnchor) {
          //   /**
          //    * 线的锚点需要存所连接锚点的位置
          //    */
          //   if (this.store.hoverAnchor.type === PointType.Line) {
          //     getDistance(this.store.activeAnchor, this.store.hoverAnchor, this.store)
          //   } else {
          //     this.store.activeAnchor.x = this.store.hoverAnchor.x
          //     this.store.activeAnchor.y = this.store.hoverAnchor.y
          //   }
          //   connectLine(this.store.hover, this.store.hoverAnchor, line, this.store.activeAnchor)
          // }
        }
        if (this[line.lineName] && line.lineName !== 'polyline') {
          this[line.lineName](this.store, line)
        }
        this.store.path2dMap.set(line, globalStore.path2dDraws.line(line))
        // this.initLineRect(line)
      } else {
        // 连线起始点自动关联 到 pen
        // if (from === this.store.activeAnchor && line.autoFrom) {
        //   this.calcAutoAnchor(line, from, this.store.hover)
        // } else if (to === this.store.activeAnchor && line.autoTo) {
        //   this.calcAutoAnchor(line, to, this.store.hover)
        // }
      }
    }

    // // Add pen
    // if (this.addCaches && this.addCaches.length) {
    //   if (!this.store.data.locked) {
    //     if (this.dragRect) {
    //       // 只存在一个缓存图元
    //       if (this.addCaches.length === 1) {
    //         const target = this.addCaches[0]
    //         target.width = this.dragRect.width / this.store.data.scale
    //         target.height = this.dragRect.height / this.store.data.scale
    //         e.x = (this.dragRect.x + this.dragRect.ex) / 2
    //         e.y = (this.dragRect.y + this.dragRect.ey) / 2
    //       }
    //     }
    //     this.dropPens(this.addCaches, e)
    //   }
    //   this.addCaches = undefined
    // }

    // Rotate
    // if (this.hoverType === HoverType.Rotate) {
    //   this.getSizeCPs()
    //   this.store.active.forEach((pen) => {
    //     pen.rotate = pen.calculative.rotate
    //   })
    // }

    // this.patchFlagsLines.forEach((pen) => {
    //   if (pen.type) {
    //     this.initLineRect(pen)
    //   }
    // })
    // this.patchFlagsLines.clear()

    // if (this.dragRect) {
    //   const pens = this.store.data.pens.filter((pen) => {
    //     if (
    //       pen.visible === false ||
    //       pen.locked >= LockState.DisableMove ||
    //       pen.parentId ||
    //       pen.isRuleLine
    //     ) {
    //       return false
    //     }
    //     if (rectInRect(pen.calculative.worldRect, this.dragRect, this.store.options.dragAllIn)) {
    //       // 先判断在区域内，若不在区域内，则锚点肯定不在框选区域内，避免每条连线过度计算
    //       if (pen.type === PenType.Line && !this.store.options.dragAllIn) {
    //         return lineInRect(pen, this.dragRect)
    //       }
    //       return true
    //     }
    //   })
    //   //框选
    //   this.active(pens)
    // }

    // if (e.button !== 2) {
    //   if (distance(this.mouseDown, e) < 2) {
    //     if (this.store.hover && this.store.hover.input) {
    //       this.showInput(this.store.hover)
    //     }
    //     this.store.emitter.emit('click', {
    //       x: e.x,
    //       y: e.y,
    //       pen: this.store.hover
    //     })
    //   }

    //   this.store.emitter.emit('mouseup', {
    //     x: e.x,
    //     y: e.y,
    //     pen: this.store.hover
    //   })
    // }

    // if (this.willInactivePen) {
    //   this.willInactivePen.calculative.active = undefined
    //   setChildrenActive(this.willInactivePen, false) // 子节点取消激活
    //   this.store.active.splice(
    //     this.store.active.findIndex((p) => p === this.willInactivePen),
    //     1
    //   )
    //   this.calcActiveRect()
    //   this.willInactivePen = undefined
    //   this.store.emitter.emit('inactive', [this.willInactivePen])
    //   this.render()
    // }

    // if (this.movingPens) {
    //   if (e.altKey && !e.shiftKey) {
    //     this.copyMovedPens()
    //   } else {
    //     this.movedActivePens(e.ctrlKey && e.shiftKey)
    //   }
    //   this.getAllByPens(this.movingPens).forEach((pen) => {
    //     this.store.pens[pen.id] = undefined
    //   })
    //   this.movingPens = undefined
    // }

    if (this.store.active && this.store.active[0]) {
      this.store.active[0].calculative.h = undefined
    }

    ;(this.mouseDown as any) = undefined
    this.lastOffsetX = 0
    this.lastOffsetY = 0
    // this.clearDock()
    // this.dragRect = undefined
    // this.initActiveRect = undefined
    this.render()
  }
  /**
   * 缩放整个画布
   * @param scale 缩放比例，最终的 data.scale
   * @param center 中心点，引用类型，存在副作用，会更改原值
   */
  scale(scale: number, center = { x: 0, y: 0 }) {
    const minScale = this.store.data.minScale || this.store.options.minScale
    const maxScale = this.store.data.maxScale || this.store.options.maxScale
    if (!(scale >= minScale && scale <= maxScale)) {
      return
    }
    // console.log(center)

    this.calibrateMouse(center)
    const itemArr = document.querySelectorAll('.dragitem')

    const s = scale / this.store.data.scale
    this.store.data.pens.forEach((pen) => {
      if (pen.parentId) {
        return
      }
      // scalePen(pen, s, center)
      // pen.onScale && pen.onScale(pen)
      if (pen.isRuleLine) {
        // 扩大线的比例，若是放大，即不缩小，若是缩小，会放大
        const lineScale = 1 / s //s > 1 ? 1 : 1 / s / s;
        // 中心点即为线的中心
        const lineCenter = pen.calculative.worldRect.center
        if (!pen.width) {
          // 垂直线
          scalePen(pen, lineScale, lineCenter)
        } else if (!pen.height) {
          // 水平线
          scalePen(pen, lineScale, lineCenter)
        }
      }
      this.updatePenRect(pen, { worldRectIsReady: true })
      // this.execPenResize(pen);
    })
    this.calcActiveRect()
    scalePoint(this.store.data.origin, s, center)
    this.store.data.scale = scale
    this.store.data.center = center
    // 应用缩放和位置调整
    Array.from(itemArr).forEach((f, fi) => {
      const pens = this.store.data.pens[fi]
      scalePenNode(pens, s, center, f, {
        x: this.store.data.x,
        y: this.store.data.y
      })
      f.style.left = pens.calculative.worldRect.x + this.store.data.x + 'px'
      f.style.top = pens.calculative.worldRect.y + this.store.data.y + 'px'
    })

    this.canvasImage.init()
    this.canvasTemplate.init()
    this.canvasImageBottom.init()
    this.render()
  }
  calibrateMouse = (pt: Point) => {
    pt.x -= this.store.data.x
    pt.y -= this.store.data.y
    return pt
  }

  renderHoverPoint = () => {
    if (this.store.data.locked) {
      return
    }
    const ctx = this.offscreen.getContext('2d')
    ctx.save()
    ctx.translate(0.5, 0.5)

    if (
      !this.store.options.disableAnchor &&
      this.store.hover &&
      !this.store.hover.disableAnchor &&
      (this.hotkeyType !== HotkeyType.Resize ||
        this.store.active.length !== 1 ||
        this.store.active[0] !== this.store.hover)
    ) {
      const anchors = [...this.store.hover.calculative.worldAnchors]

      if (this.store.pointAt && this.hotkeyType === HotkeyType.AddAnchor) {
        anchors.push(this.store.pointAt)
      }
      if (anchors) {
        ctx.strokeStyle = this.store.hover.anchorColor || this.store.options.anchorColor
        ctx.fillStyle = this.store.hover.anchorBackground || this.store.options.anchorBackground
        anchors.forEach((anchor) => {
          if (anchor.hidden && anchor.locked > LockState.DisableEdit) {
            return
          }
          if (anchor === this.store.hoverAnchor) {
            ctx.save()
            const hoverAnchorColor =
              this.store.hover.hoverAnchorColor || this.store.options.hoverAnchorColor
            ctx.strokeStyle = hoverAnchorColor
            ctx.fillStyle = hoverAnchorColor
          }
          ctx.beginPath()
          let size =
            anchor.radius || this.store.hover.anchorRadius || this.store.options.anchorRadius
          if (this.store.hover.type && !anchor.radius && !this.store.hover.anchorRadius) {
            size = 3
            if (this.store.hover.calculative.lineWidth > 3) {
              size = this.store.hover.calculative.lineWidth
            }
          }
          if (anchor.type === PointType.Line) {
            //旋转的情况
            let _rotate = this.store.pens[anchor.penId].rotate || 0
            if (this.store.pens[anchor.penId].calculative.flipX) {
              _rotate *= -1
            }
            if (this.store.pens[anchor.penId].calculative.flipY) {
              _rotate *= -1
            }
            let rotate = anchor.rotate + _rotate
            if (this.store.pens[anchor.penId].calculative.flipX) {
              rotate *= -1
            }
            if (this.store.pens[anchor.penId].calculative.flipY) {
              rotate *= -1
            }
            ctx.save()
            ctx.translate(anchor.x, anchor.y)
            ctx.rotate((rotate * Math.PI) / 180)
            ctx.translate(-anchor.x, -anchor.y)
            ctx.rect(
              anchor.x - (anchor.length * this.store.data.scale) / 2,
              anchor.y - size,
              anchor.length * this.store.data.scale,
              size * 2
            )
            ctx.restore()
          } else {
            ctx.arc(anchor.x, anchor.y, size, 0, Math.PI * 2)
          }
          if (this.store.hover.type && this.store.hoverAnchor === anchor) {
            ctx.save()
            ctx.strokeStyle = this.store.hover.activeColor || this.store.options.activeColor
            ctx.fillStyle = ctx.strokeStyle
          } else if (anchor.color || anchor.background) {
            ctx.save()
            ctx.strokeStyle = anchor.color
            ctx.fillStyle = anchor.background
          }
          ctx.fill()
          ctx.stroke()
          if (anchor === this.store.hoverAnchor) {
            ctx.restore()
          }

          if (this.store.hover.type && this.store.hoverAnchor === anchor) {
            ctx.restore()
          } else if (anchor.color || anchor.background) {
            ctx.restore()
          }
          //根父节点
          if (
            !this.store.hover.parentId &&
            this.store.hover.children &&
            this.store.hover.children.length > 0
          ) {
            if (anchor === this.store.hoverAnchor) {
              ctx.save()
              ctx.beginPath()
              ctx.lineWidth = 3
              const hoverAnchorColor =
                this.store.hover.hoverAnchorColor || this.store.options.hoverAnchorColor
              if ((globalThis as any).pSBC) {
                ctx.strokeStyle = (globalThis as any).pSBC(0.5, hoverAnchorColor)
              }
              ctx.arc(anchor.x, anchor.y, size + 1.5, 0, Math.PI * 2)
              ctx.stroke()
              ctx.restore()
            }
          }
        })
      }
    }

    // Draw size control points.
    if (
      this.hotkeyType !== HotkeyType.AddAnchor &&
      !this.movingPens && // 不在移动中
      this.activeRect &&
      !(this.store.active.length === 1 && this.store.active[0].type)
    ) {
      if (
        !getPensLock(this.store.active) &&
        !getPensDisableResize(this.store.active) &&
        !this.store.options.disableSize
      ) {
        ctx.strokeStyle = this.store.options.activeColor
        ctx.fillStyle = '#ffffff'
        this.sizeCPs.forEach((pt, i) => {
          if (this.activeRect.rotate) {
            ctx.save()
            ctx.translate(pt.x, pt.y)
            ctx.rotate((this.activeRect.rotate * Math.PI) / 180)
            ctx.translate(-pt.x, -pt.y)
          }
          if (i < 4 || this.hotkeyType === HotkeyType.Resize) {
            ctx.beginPath()
            ctx.fillRect(pt.x - 4.5, pt.y - 4.5, 8, 8)
            ctx.strokeRect(pt.x - 5.5, pt.y - 5.5, 10, 10)
          }
          if (this.activeRect.rotate) {
            ctx.restore()
          }
        })
      }
    }

    if (!this.store.data.locked && this.dragRect) {
      ctx.save()
      ctx.fillStyle = rgba(this.store.options.dragColor, 0.2)
      ctx.strokeStyle = this.store.options.dragColor
      ctx.beginPath()
      ctx.strokeRect(this.dragRect.x, this.dragRect.y, this.dragRect.width, this.dragRect.height)
      ctx.fillRect(this.dragRect.x, this.dragRect.y, this.dragRect.width, this.dragRect.height)
      ctx.restore()
    }

    if (this.dock) {
      ctx.strokeStyle = this.store.options.dockColor
      if (this.dock.xDock) {
        ctx.beginPath()
        ctx.moveTo(this.dock.xDock.x, this.dock.xDock.y)
        ctx.lineTo(this.dock.xDock.x, this.dock.xDock.prev.y)
        ctx.stroke()
      }

      if (this.dock.yDock) {
        ctx.beginPath()
        ctx.moveTo(this.dock.yDock.x, this.dock.yDock.y)
        ctx.lineTo(this.dock.yDock.prev.x, this.dock.yDock.y)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  translate(x: number = 0, y: number = 0, center: { x: 0; y: 0 }) {
    this.store.data.x += x * this.store.data.scale
    this.store.data.y += y * this.store.data.scale
    this.store.data.x = Math.round(this.store.data.x)
    this.store.data.y = Math.round(this.store.data.y)
    this.store.data.distance.x = x
    this.store.data.distance.y = y
    if (this.store.options.padding) {
      const p = formatPadding(this.store.options.padding)
      const width = this.store.data.width || this.store.options.width
      const height = this.store.data.height || this.store.options.height
      if (this.width < (width + p[1] + p[3]) * this.store.data.scale) {
        if (this.store.data.x + this.store.data.origin.x > p[3] * this.store.data.scale) {
          this.store.data.x = p[3] * this.store.data.scale - this.store.data.origin.x
        }

        if (
          this.store.data.x + this.store.data.origin.x + width * this.store.data.scale <
          this.width - p[1] * this.store.data.scale
        ) {
          this.store.data.x =
            this.width -
            p[1] * this.store.data.scale -
            (this.store.data.origin.x + width * this.store.data.scale)
        }
      }
      if (this.height < (height + p[0] + p[2]) * this.store.data.scale) {
        if (this.store.data.y + this.store.data.origin.y > p[0] * this.store.data.scale) {
          this.store.data.y = p[0] * this.store.data.scale - this.store.data.origin.y
        }
        if (
          this.store.data.y + this.store.data.origin.y + height * this.store.data.scale <
          this.height - p[2] * this.store.data.scale
        ) {
          this.store.data.y =
            this.height -
            p[2] * this.store.data.scale -
            (this.store.data.origin.y + height * this.store.data.scale)
        }
      }
    }
    const itemArr = document.querySelectorAll('.dragitem')
    Array.from(itemArr).forEach((f, fi) => {
      const pens = this.store.data.pens[fi]
      scalePenNode(pens, 1, center, f)
      f.style.left = pens.calculative.worldRect.x + this.store.data.x + 'px'
      f.style.top = pens.calculative.worldRect.y + this.store.data.y + 'px'
    })
    //TODO 当初为什么加异步
    // setTimeout(() => {
    this.canvasTemplate.init()
    this.canvasImage.init()
    this.canvasImageBottom.init()
    this.render()
    // });
    // this.store.emitter.emit('translate', {
    //   x: this.store.data.x,
    //   y: this.store.data.y,
    // });
    // this.tooltip.translate(x, y);
    // if (this.scroll && this.scroll.isShow) {
    //   this.scroll.translate(x, y);
    // }
    // this.onMovePens()
  }

  inactive(drawing?: boolean) {
    if (!this.store.active.length) {
      return
    }
    this.initTemplateCanvas(this.store.active)
    this.store.active.forEach((pen) => {
      pen.calculative.active = undefined
      pen.calculative.activeAnchor = undefined
      pen.calculative.hover = false
      // setChildrenActive(pen, false);
    })
    // !drawing && this.store.emitter.emit('inactive', this.store.active);
    this.store.active = []
    this.activeRect = undefined
    this.sizeCPs = undefined
    this.store.activeAnchor = undefined
    this.patchFlags = true
  }

  active(pens: Pen[], emit = true) {
    if (this.store.active) {
      // emit && this.store.emitter.emit('inactive', this.store.active);
      for (const pen of this.store.active) {
        pen.calculative.active = undefined
        pen.calculative.hover = false
        // setChildrenActive(pen, false);
      }
    }
    this.store.active = [] // 先清空active的元素

    pens.forEach((pen) => {
      pen.calculative.active = true // 设置元素为active状态
      // setChildrenActive(pen); // 目前不支持chidldren画笔
    })
    this.store.active.push(...pens)
    this.activeRect = undefined
    this.calcActiveRect()
    this.initTemplateCanvas(pens)
    this.patchFlags = true
  }

  initTemplateCanvas(pens: Pen[]) {
    // pens.some((pen) => pen.template !== undefined) &&
    //   this.canvasTemplate.init();
    pens.some((pen) => pen.canvasLayer === CanvasLayer.CanvasTemplate) && this.canvasTemplate.init()
  }

  calcActiveRect() {
    // TODO: visible 不可见， 目前只是不计算 activeRect，考虑它是否进入活动层 store.active
    const canMovePens = this.store.active.filter(
      (pen: Pen) => (!pen.locked || pen.locked < LockState.DisableMove) && pen.visible != false
    )
    if (!canMovePens.length) {
      return
    } else if (canMovePens.length === 1) {
      this.activeRect = deepClone(canMovePens[0].calculative.worldRect)
      this.activeRect.rotate = canMovePens[0].calculative.rotate || 0
      calcCenter(this.activeRect)
    } else {
      this.activeRect = getRect(canMovePens)
      this.activeRect.rotate = 0
    }
    this.lastRotate = 0
    this.getSizeCPs()
  }
  getSizeCPs() {
    this.sizeCPs = rectToPoints(this.activeRect)
    // 正上 正右 正下 正左
    const pts = [
      { x: 0.5, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.5, y: 1 },
      { x: 0, y: 0.5 }
    ] as const
    const { x, y, width, height, rotate, center } = this.activeRect
    pts.forEach((pt) => {
      const p = {
        x: pt.x * width + x,
        y: pt.y * height + y
      }
      rotatePoint(p, rotate, center)
      this.sizeCPs.push(p)
    })
  }
  onMovePens() {
    // 有移动操作的 画笔 需要执行移动
    for (const pen of this.store.data.pens) {
      // calcInView(pen);
      pen.onMove?.(pen)
      if (pen.isRuleLine) {
        if (!pen.width) {
          // 垂直线，移动 y 即可
          pen.y = -this.store.data.y
        } else if (!pen.height) {
          // 水平线
          pen.x = -this.store.data.x
        }
        this.updatePenRect(pen)
      }
    }
  }
  onResize = () => {
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      this.resize()
      this.timer = undefined
    }, 100)
  }

  private getHover = (pt: Point) => {
    if (this.dragRect) {
      return
    }
    let hoverType = HoverType.None
    this.store.hover = undefined
    this.store.hoverAnchor = undefined
    // this.title.hide();
    this.store.pointAt = undefined
    this.store.pointAtIndex = undefined
    const activeLine = this.store.active.length === 1 && this.store.active[0].type

    if (
      // !this.drawingLineName &&
      this.hotkeyType !== HotkeyType.AddAnchor &&
      this.activeRect &&
      !activeLine &&
      !this.store.data.locked
    ) {
      const activePensLock = getPensLock(this.store.active)
      const activePensDisableRotate =
        getPensDisableRotate(this.store.active) || this.store.options.disableRotate
      const activePensDisableResize =
        getPensDisableResize(this.store.active) || this.store.options.disableSize
      if (!activePensLock && !activePensDisableRotate) {
        const rotatePt = {
          x: this.activeRect.center.x,
          y: this.activeRect.y - 30
        }
        if (this.activeRect.rotate) {
          rotatePoint(rotatePt, this.activeRect.rotate, this.activeRect.center)
        }
        // 旋转控制点
        if (!this.hotkeyType && hitPoint(pt, rotatePt, this.pointSize)) {
          hoverType = HoverType.Rotate
          this.externalElements.style.cursor = `url("${this.store.options.rotateCursor}"), auto`
        }
      }

      // 大小控制点
      if (!activePensLock && !activePensDisableResize) {
        for (let i = 0; i < 8; i++) {
          const firstFour = i < 4
          const hotKeyIsResize =
            this.hotkeyType === HotkeyType.Resize || (firstFour && !this.hotkeyType)
          if (hotKeyIsResize && hitPoint(pt, this.sizeCPs[i], this.pointSize)) {
            let cursors = firstFour ? defaultCursors : rotatedCursors
            let offset = 0
            if (Math.abs((this.activeRect.rotate % 90) - 45) < 25) {
              cursors = firstFour ? rotatedCursors : defaultCursors
              offset = Math.round((this.activeRect.rotate - 45) / 90) + (firstFour ? 0 : 1)
            } else {
              offset = Math.round(this.activeRect.rotate / 90)
            }
            hoverType = HoverType.Resize
            this.resizeIndex = i
            this.externalElements.style.cursor = cursors[(i + offset) % 4]
            break
          }
        }
      }
    }
    if (hoverType === HoverType.None) {
      hoverType = this.inPens(pt, this.store.data.pens)
    }

    if (!hoverType && !activeLine && pointInRect(pt, this.activeRect)) {
      hoverType = HoverType.Node
      this.externalElements.style.cursor = 'move'
    }
    this.hoverType = hoverType
    // if (hoverType === HoverType.None) {
    //   if (this.drawingLineName || this.pencil) {
    //     this.externalElements.style.cursor = 'crosshair'
    //   } else if (!this.mouseDown) {
    //     this.externalElements.style.cursor = 'default'
    //   }
    //   this.store.hover = undefined
    // }

    if (this.store.lastHover !== this.store.hover) {
      this.patchFlags = true
      if (this.store.lastHover) {
        this.store.lastHover.calculative.hover = false
        setHover(getParent(this.store.lastHover, true) || this.store.lastHover, false)
        // this.store.emitter.emit('leave', this.store.lastHover)
        // this.tooltip.hide()
      }
      if (this.store.hover) {
        this.store.hover.calculative.hover = true
        setHover(getParent(this.store.hover, true) || this.store.hover)
        // this.store.emitter.emit('enter', this.store.hover)
        // this.tooltip.show(this.store.hover, pt)
      }
      this.store.lastHover = this.store.hover
    }

    this.store.hover?.onMouseMove?.(this.store.hover, this.mousePos)
  }

  private inPens = (pt: Point, pens: Pen[]) => {
    let hoverType = HoverType.None
    outer: for (let i = pens.length - 1; i >= 0; --i) {
      const pen = pens[i]
      if (
        pen.visible == false ||
        pen.calculative.inView == false ||
        pen.locked === LockState.Disable
      ) {
        continue
      }

      const r = getLineR(pen)
      if (
        !pen.calculative.active &&
        !pointInSimpleRect(pt, pen.calculative.worldRect, r) &&
        !pointInRect(pt, pen.calculative.worldRect)
      ) {
        continue
      }
      //anchor title
      // if (this.store.data.locked) {
      //   // locked>0
      //   if (pen.calculative.worldAnchors) {
      //     for (const anchor of pen.calculative.worldAnchors) {
      //       if (
      //         hitPoint(
      //           pt,
      //           anchor,
      //           this.pointSize,
      //           anchor.penId ? this.store.pens[anchor.penId] : undefined
      //         )
      //       ) {
      //         this.title.show(anchor, pen);
      //         if (anchor.title) {
      //           break outer;
      //         }
      //       }
      //     }
      //   }
      // }
      // 锚点
      if (!this.store.data.locked && this.hotkeyType !== HotkeyType.Resize) {
        if (pen.calculative.worldAnchors) {
          for (const anchor of pen.calculative.worldAnchors) {
            hoverType = this.inAnchor(pt, pen, anchor)
            if (hoverType) {
              //title显示
              const _anchor = deepClone(anchor)
              Object.assign(_anchor, pt)
              // this.title.show(_anchor, pen)
              break outer
            }
          }
        }
      }
      // 图形
      if (pen.type) {
        if (pen.isRuleLine) {
          const ruleH = this.store.options.ruleOptions?.height || 20
          if (pt.x + this.store.data.x > ruleH && pt.y + this.store.data.y > ruleH) {
            break
          }
        }
        const pos = pointInLine(pt, pen)
        if (pos) {
          if (!this.store.data.locked && !pen.locked) {
            if (this.hotkeyType === HotkeyType.AddAnchor) {
              this.externalElements.style.cursor = 'pointer'
            } else {
              this.externalElements.style.cursor = 'move'
            }
          } else {
            this.externalElements.style.cursor = this.store.options.hoverCursor
          }

          this.store.hover = pen
          this.store.pointAt = pos.point
          this.store.pointAtIndex = pos.i
          this.initTemplateCanvas([this.store.hover])
          hoverType = HoverType.Line
          break
        }
      } else {
        if (pen.children) {
          const pens = [] // TODO: 只考虑了一级子
          pen.children.forEach((id) => {
            this.store.pens[id] && pens.push(this.store.pens[id])
          })
          hoverType = this.inPens(pt, pens)
          if (hoverType) {
            break
          }
        }

        let isIn = false
        if (pen.name === 'line') {
          isIn = pointInSimpleRect(pt, pen.calculative.worldRect, pen.lineWidth)
        } else {
          isIn = pointInRect(pt, pen.calculative.worldRect)
        }

        if (isIn) {
          if (pen.type === PenType.Node && pen.name === 'line') {
            const pIn = pointInPolygon(pt, pen.calculative.worldAnchors)
            if (!pIn) {
              continue
            }
          }
          if (!this.store.data.locked && !pen.locked) {
            if (this.hotkeyType === HotkeyType.AddAnchor) {
              this.externalElements.style.cursor = 'pointer'
            } else {
              this.externalElements.style.cursor = 'move'
            }
          } else {
            this.externalElements.style.cursor = this.store.options.hoverCursor
          }

          this.store.hover = pen
          this.initTemplateCanvas([this.store.hover])
          hoverType = HoverType.Node
          this.store.pointAt = pt
          // 锚点贴边吸附
          if (!(pt as any).ctrlKey) {
            const { x, y, ex, ey, rotate, center } = this.store.hover.calculative.worldRect
            if (rotate) {
              const pts: Point[] = [
                { x, y },
                { x: ex, y: y },
                { x: ex, y: ey },
                { x: x, y: ey }
              ]
              pts.forEach((item: Point) => {
                rotatePoint(item, rotate, center)
              })
              let last = pts[pts.length - 1]
              for (const item of pts) {
                if (last.y > pt.y !== item.y > pt.y) {
                  const tempx = item.x + ((pt.y - item.y) * (last.x - item.x)) / (last.y - item.y)
                  if (Math.abs(tempx - this.store.pointAt.x) < 10) {
                    this.store.pointAt.x = tempx
                  }
                }
                last = item
              }
            } else {
              if (this.store.pointAt.x - 10 < x) {
                this.store.pointAt.x = x
              } else if (this.store.pointAt.x + 10 > ex) {
                this.store.pointAt.x = ex
              }
              if (this.store.pointAt.y - 10 < y) {
                this.store.pointAt.y = y
              } else if (this.store.pointAt.y + 10 > ey) {
                this.store.pointAt.y = ey
              }
            }
          }
          break
        }
      }
    }

    return hoverType
  }

  inAnchor(pt: Point, pen: Pen, anchor: Point): HoverType {
    this.store.hoverAnchor = undefined
    this.movingAnchor = undefined
    if (!anchor || anchor.locked > LockState.DisableEdit) {
      return HoverType.None
    }

    if (
      (!(pen.type && pen.calculative.active) && this.store.options.disableAnchor) ||
      pen.disableAnchor
    ) {
      return HoverType.None
    }

    if ((this.mouseDown || this.drawingLine) && pen.name === 'line' && anchor.connectTo) {
      const connectPen = this.findOne(anchor.connectTo)
      if (connectPen?.calculative && !connectPen?.calculative.active) {
        pen = connectPen
        const connectAnchor = connectPen.calculative.worldAnchors.find(
          (item) => item.id === anchor.anchorId
        )
        connectAnchor && (anchor = connectAnchor)
      }
    }

    if (anchor.twoWay === TwoWay.Disable && pen.name !== 'line') {
      return HoverType.None
    }
    if (pen.name === 'line' && anchor.connectTo) {
      const _anchor = this.findOne(anchor.connectTo)?.anchors.find(
        (item) => item.id === anchor.anchorId
      )
      if (_anchor && _anchor.twoWay) {
        return HoverType.None
      }
    }
    if (this.drawingLine) {
      if (anchor.twoWay === TwoWay.Out) {
        return HoverType.None
      }
    } else {
      if (this.mouseDown && this.hoverType === HoverType.LineAnchor) {
      } else if (anchor.twoWay === TwoWay.In) {
        return HoverType.None
      }
    }
    if (
      hitPoint(pt, anchor, this.pointSize, anchor.penId ? this.store.pens[anchor.penId] : undefined)
    ) {
      if (anchor !== this.store.hoverAnchor) {
        this.patchFlags = true
      }
      this.store.hoverAnchor = anchor
      this.store.hover = pen

      if (pen.type) {
        if (anchor.connectTo && !pen.calculative.active) {
          this.store.hover = this.store.pens[anchor.connectTo]
          if (this.store.hover) {
            this.store.hoverAnchor = this.store.hover.calculative.worldAnchors.find(
              (a) => a.id === anchor.anchorId
            )
            if (!this.store.hoverAnchor) {
              return HoverType.None
            }
            this.externalElements.style.cursor = 'crosshair'
            return HoverType.NodeAnchor
          }
        }
        if (this.hotkeyType === HotkeyType.AddAnchor) {
          this.externalElements.style.cursor = 'vertical-text'
        } else {
          this.externalElements.style.cursor = 'pointer'
        }

        return HoverType.LineAnchor
      }

      if (this.hotkeyType === HotkeyType.AddAnchor) {
        this.externalElements.style.cursor = 'vertical-text'
      } else {
        this.externalElements.style.cursor = 'crosshair'
      }

      return HoverType.NodeAnchor
    }

    if (!this.mouseDown && pen.type) {
      if (pen.calculative.active && anchor.prev && hitPoint(pt, anchor.prev, this.pointSize)) {
        this.store.hoverAnchor = anchor
        this.store.hover = pen
        this.externalElements.style.cursor = 'pointer'
        return HoverType.LineAnchorPrev
      }

      if (pen.calculative.active && anchor.next && hitPoint(pt, anchor.next, this.pointSize)) {
        this.store.hoverAnchor = anchor
        this.store.hover = pen
        this.externalElements.style.cursor = 'pointer'
        return HoverType.LineAnchorNext
      }
    }

    return HoverType.None
  }

  findOne(idOrTag: string): Pen | undefined {
    return this.store.data.pens.find((pen) => {
      return pen.id == idOrTag || (pen.tags && pen.tags.indexOf(idOrTag) > -1)
    })
  }

  renderPens = () => {
    const ctx = this.offscreen.getContext('2d') as CanvasRenderingContext2D
    ctx.strokeStyle = getGlobalColor(this.store)

    for (const pen of this.store.data.pens) {
      if (!isFinite(pen.x)) {
        continue
      }
      // if (pen.template) {
      if (pen.canvasLayer === CanvasLayer.CanvasTemplate) {
        continue
      }
      if (pen.calculative.inView) {
        if (
          pen.canvasLayer === CanvasLayer.CanvasMain &&
          pen.name !== 'gif' &&
          pen.image &&
          pen.calculative.img
        ) {
          ctx.save()
          ctxFlip(ctx, pen)
          if (pen.calculative.rotate) {
            ctxRotate(ctx, pen)
          }
          setGlobalAlpha(ctx, pen)
          drawImage(ctx, pen)
          ctx.restore()
        }

        renderPen(ctx, pen)
      }
    }

    if (this.drawingLine) {
      renderPen(ctx, this.drawingLine)
    }
    if (this.pencilLine) {
      renderPen(ctx, this.pencilLine)
    }
    // if (this.movingPens) {
    //   this.movingPens.forEach((pen) => {
    //     this.renderPenContainChild(ctx, pen)
    //   })
    // }
  }

  resize(w?: number, h?: number) {
    w = w || this.parentElement.clientWidth
    h = h || this.parentElement.clientHeight

    this.width = w
    this.height = h

    this.canvasRect = {
      x: 0,
      y: 0,
      width: w,
      height: h
    }
    // calcRightBottom(this.canvasRect);

    this.canvas.style.width = w + 'px'
    this.canvas.style.height = h + 'px'

    this.externalElements.style.width = w + 'px'
    this.externalElements.style.height = h + 'px'

    this.canvasTemplate.resize(w, h)
    this.canvasImage.resize(w, h)
    this.canvasImageBottom.resize(w, h)
    // this.magnifierCanvas.resize(w, h);

    w = (w * this.store.dpiRatio) | 0
    h = (h * this.store.dpiRatio) | 0

    this.canvas.width = w
    this.canvas.height = h

    this.offscreen.width = w
    this.offscreen.height = h

    this.clientRect = this.externalElements.getBoundingClientRect()

    this.canvas.getContext('2d').scale(this.store.dpiRatio, this.store.dpiRatio)
    this.offscreen.getContext('2d').scale(this.store.dpiRatio, this.store.dpiRatio)
    this.offscreen.getContext('2d').textBaseline = 'middle'

    // TODO 窗口大小变化没有刷新图纸
    for (const pen of this.store.data.pens) {
      if (pen.isRuleLine) {
        if (!pen.width) {
          pen.height = this.height
        } else if (!pen.height) {
          pen.width = this.width
        }
      }
    }
    this.render()
  }

  render() {
    const offscreenCtx = this.offscreen.getContext('2d')
    offscreenCtx.clearRect(0, 0, this.offscreen.width, this.offscreen.height)
    offscreenCtx.save()

    offscreenCtx.translate(this.store.data.x, this.store.data.y)
    this.renderPens()
    this.renderHoverPoint() // 绘制放大缩小边框
    offscreenCtx.restore()
    const ctx = this.canvas.getContext('2d')
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.drawImage(this.offscreen, 0, 0, this.width, this.height)
    this.canvasImage.render()
    this.canvasTemplate.render()
  }
}
