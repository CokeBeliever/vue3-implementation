import { ReactiveFlags } from './reactive'

/** 一个标记变量，代表是否进行追踪。默认值为 true，即允许追踪 */
export let shouldTrack = true

/** 定义重写数组的原生方法 */
export const arrayInstrumentations = {}
;['includes', 'indexOf', 'lastIndexOf'].forEach((method) => {
  const originMethod = Array.prototype[method]
  arrayInstrumentations[method] = function (...args) {
    let res = originMethod.apply(this, args)

    if (res === false || res < 0) {
      res = originMethod.apply(this[ReactiveFlags.RAW], args)
    }

    return res
  }
})
;['push', 'pop', 'shift', 'unshift', 'splice'].forEach((method) => {
  const originMethod = Array.prototype[method]
  arrayInstrumentations[method] = function (...args) {
    shouldTrack = false
    const res = originMethod.apply(this, args)
    shouldTrack = true
    return res
  }
})
