import type { Options } from './options'
import { Canvas } from './canvas'
import { register, useStore } from './store'
import { s8 } from './utils'
import type { Pen } from './pen'
import { commonPens } from './diagrams'
export class F2d {
  canvas: Canvas
  store: import('/Users/fuqinghui/design/design_screen/src/views/screen/layout/component/core/store/store').Meta2dStore
  register = register
  constructor(parent: string | HTMLElement, opts: Options = {}) {
    this.store = useStore(s8())
    this.store.dpiRatio = globalThis.devicePixelRatio || 1

    if (this.store.dpiRatio < 1) {
      this.store.dpiRatio = 1
    } else if (this.store.dpiRatio > 1 && this.store.dpiRatio < 1.5) {
      this.store.dpiRatio = 1.5
    }
    this.setOptions(opts)
    this.init(parent)
    this.register(commonPens())
  }
  private init(parent: string | HTMLElement) {
    if (typeof parent === 'string') {
      this.canvas = new Canvas(this, document.getElementById(parent) as HTMLElement, this.store)
    } else {
      this.canvas = new Canvas(this, parent, this.store)
    }
    this.resize()
  }
  resize(width?: number, height?: number) {
    this.canvas.resize(width, height)
    this.render()
    this.store.emitter.emit('resize', { width, height })

    if (this.canvas.scroll && this.canvas.scroll.isShow) {
      this.canvas.scroll.init()
    }
  }

  setOptions(opts: Options = {}) {
    if (opts.grid !== undefined || opts.gridColor !== undefined || opts.gridSize !== undefined) {
      this.canvas && (this.canvas.canvasTemplate.bgPatchFlags = true)
    }
    if (opts.width !== undefined || opts.height !== undefined) {
      this.canvas && (this.canvas.canvasTemplate.bgPatchFlags = true)
    }
    if (opts.rule !== undefined || opts.ruleColor !== undefined || opts.ruleOptions !== undefined) {
      this.store.patchFlagsTop = true
      if (opts.ruleOptions) {
        if (this.store.options?.ruleOptions) {
          Object.assign(this.store.options.ruleOptions, opts.ruleOptions)
          opts.ruleOptions = this.store.options.ruleOptions
        }
      }
    }
    this.store.options = Object.assign(this.store.options, opts)
  }
  render(patchFlags?: boolean | number) {
    this.canvas?.render(patchFlags)
  }
  isCombine(pen: Pen) {
    if (pen.name === 'combine') {
      return true
    }
    if (pen.children && pen.children.length > 0) {
      return true
    }
    return false
  }
}
