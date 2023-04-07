import { track, trigger, TriggerType, ITERATE_KEY } from './effect'
import { isIndex, targetTypeMap, toRawType, TargetType } from './shared'
import { arrayInstrumentations } from './baseHandlers'
import { mutableInstrumentations } from './collectionHandlers'

/**
 * 响应式标记
 */
export enum ReactiveFlags {
  /** 访问原始数据 */
  RAW = '__v_raw',
  /** 代理目标是否为原始值 */
  IS_REF = '__v_isRef',
}

const reactiveMap = new Map()

/**
 * 封装创建响应式数据逻辑
 * @param obj 对象
 * @param isShallow 是否为浅响应/浅只读
 * @param isReadonly 是否只读
 */
function createReactive<T extends object>(obj: T, isShallow = false, isReadonly = false): T {
  const existionProxy = reactiveMap.get(obj)
  if (existionProxy) return existionProxy

  const targetType = targetTypeMap(toRawType(obj))
  if (targetType === TargetType.INVALID) {
    return obj
  }

  const handlers: { [key: string]: ProxyHandler<T> } = {
    /** 基础类型处理器 */
    baseHandler: {
      get(target, key, receiver) {
        if (key === ReactiveFlags.RAW) {
          return target
        }

        if (!isReadonly) {
          track(target, key)
        }

        if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
          return Reflect.get(arrayInstrumentations, key, receiver)
        }

        const res = Reflect.get(target, key, receiver)
        if (isShallow) {
          return res
        } else {
          if (typeof res === 'object' && res !== null) {
            return isReadonly && !isShallow ? createReactive(res, false, true) : createReactive(res)
          }
          return res
        }
      },

      has(target, key) {
        track(target, key)
        return Reflect.has(target, key)
      },

      ownKeys(target) {
        track(target, ITERATE_KEY)
        return Reflect.ownKeys(target)
      },

      set(target, key, newVal, receiver) {
        if (isReadonly) {
          console.warn(`属性 ${key.toString()} 是只读的`)
          return true
        }
        const oldVal = target[key]
        let type = TriggerType.SET

        {
          if (Array.isArray(target) && isIndex(key)) {
            type = Number(key) < target.length ? TriggerType.SET : TriggerType.ADD
          } else {
            type = Object.prototype.hasOwnProperty.call(target, key) ? TriggerType.SET : TriggerType.ADD
          }
        }

        const res = Reflect.set(target, key, newVal, receiver)

        if (target === receiver[ReactiveFlags.RAW]) {
          if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
            trigger(target, key, type, newVal, oldVal)
          }
        }

        return res
      },

      deleteProperty(target, key) {
        if (isReadonly) {
          console.warn(`属性 ${key.toString()} 是只读的`)
          return true
        }
        const hadKey = Object.prototype.hasOwnProperty.call(target, key)
        const res = Reflect.deleteProperty(target, key)

        if (res && hadKey) {
          trigger(target, key, TriggerType.DELETE)
        }

        return res
      },
    },
    /** 集合类型处理器 */
    collectionHandler: {
      get(target, key, receiver) {
        if (key === ReactiveFlags.RAW) {
          return target
        }

        if (key === 'size') {
          track(target, ITERATE_KEY)
          return Reflect.get(target, key, target)
        }

        if (mutableInstrumentations.hasOwnProperty(key)) {
          return Reflect.get(mutableInstrumentations, key, receiver)
        }

        return Reflect.get(target, key, receiver)
      },
    },
  }

  const proxy = new Proxy(obj, targetType === TargetType.COLLECTION ? handlers.collectionHandler : handlers.baseHandler)

  reactiveMap.set(obj, proxy)

  return proxy
}

/**
 * 创建深响应式数据
 * @param obj 对象
 */
export function reactive<T extends object>(obj: T) {
  return createReactive(obj)
}

/**
 * 创建浅响应式数据
 * @param obj 对象
 */
export function shallowReactive<T extends object>(obj: T) {
  return createReactive(obj, true)
}

/**
 * 创建深只读数据
 * @param obj 对象
 */
export function readonly<T extends object>(obj: T) {
  return createReactive(obj, false, true)
}

/**
 * 创建浅只读数据
 * @param obj 对象
 */
export function shallowReadonly<T extends object>(obj: T) {
  return createReactive(obj, true, true)
}
