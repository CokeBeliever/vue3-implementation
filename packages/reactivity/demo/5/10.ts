// -------------------- 代理 Set 和 Map - 读取 size 属性和方法的代理 --------------------

// -------------------- 类型代码 --------------------
/**
 * 副作用函数接口
 */
interface EffectFnInterface {
  (): any
  /** 依赖副作用函数的集合列表 */
  depsList: Set<EffectFnInterface>[]
  /** 副作用函数的选项 */
  options: EffectOptionsInterface
}

/**
 * effect options 接口
 */
interface EffectOptionsInterface {
  /** 调度函数 */
  scheduler?: (effectFn: EffectFnInterface) => any
  /** 懒执行 */
  lazy?: boolean
}

// -------------------- 逻辑代码 --------------------
/**
 * 触发类型枚举
 */
enum TriggerType {
  /** 修改旧属性 */
  SET = 'SET',
  /** 添加新属性 */
  ADD = 'ADD',
  /** 删除属性 */
  DELETE = 'DELETE',
}

/**
 * 响应式标记
 */
enum ReactiveFlags {
  /** 访问原始数据 */
  RAW = '__v_raw',
}

/**
 * 目标类型
 */
const enum TargetType {
  INVALID = 0,
  COMMON = 1,
  COLLECTION = 2,
}

const bucket = new WeakMap<object, Map<string | symbol, Set<EffectFnInterface>>>()
let activeEffect: EffectFnInterface | undefined
const effectStack: EffectFnInterface[] = []
const ITERATE_KEY = Symbol()
const reactiveMap = new Map()
/** 定义重写数组的原生方法 */
const arrayInstrumentations = {}
/** 一个标记变量，代表是否进行追踪。默认值为 true，即允许追踪 */
let shouldTrack = true
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

/**
 * key 是否为索引
 * @param key 属性键
 */
const isIndex = (key: string | symbol): boolean => {
  if (typeof key === 'symbol') return false
  const index = Number(key)
  return Number.isInteger(index) && index >= 0
}

/**
 * 获取 target 的原始类型
 * @param target 对象
 */
function toRawType(target: object) {
  // 从字符串 "[object RawType]" 中提取 "RawType"
  return Object.prototype.toString.call(target).slice(8, -1)
}

/**
 * 从原始类型到 targetType 的映射
 * @param rawType 原始类型
 */
function targetTypeMap(rawType: string) {
  // 从字符串 "[object RawType]" 中提取 "RawType"
  switch (rawType) {
    case 'Object':
    case 'Array':
      return TargetType.COMMON
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return TargetType.COLLECTION
    default:
      return TargetType.INVALID
  }
}

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
  // 如果 targetType 是 TargetType.INVALID，则不实现响应式，只对特定的值类型实现响应式
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
        // 如果读取的是 ReactiveFlags.RAW 属性，则返回原始数据对象 target
        if (key === ReactiveFlags.RAW) {
          return target
        }

        // 如果读取的是 size 属性，那么由 target 原始对象读取返回
        if (key === 'size') {
          return Reflect.get(target, key, target)
        }

        // 如果读取的是方法，那么由 bind 绑定原始对象返回
        if (typeof target[key] === 'function') {
          return target[key].bind(target)
        }

        // 读取的是其他属性，由 receiver 代理对象读取返回
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
function reactive<T extends object>(obj: T) {
  return createReactive(obj)
}

/**
 * 创建浅响应式数据
 * @param obj 对象
 */
function shallowReactive<T extends object>(obj: T) {
  return createReactive(obj, true)
}

/**
 * 创建深只读数据
 * @param obj 对象
 */
function readonly<T extends object>(obj: T) {
  return createReactive(obj, false, true)
}

/**
 * 创建浅只读数据
 * @param obj 对象
 */
function shallowReadonly<T extends object>(obj: T) {
  return createReactive(obj, true, true)
}

/**
 * 在 get 拦截函数内调用，在响应式数据的指定属性上订阅副作用函数
 * @param target 响应式数据
 * @param key 属性
 */
function track<T extends object>(target: T, key: string | symbol) {
  if (!activeEffect || !shouldTrack) return
  let depsMap = bucket.get(target)
  if (!depsMap) bucket.set(target, (depsMap = new Map()))
  let deps = depsMap.get(key)
  if (!deps) depsMap.set(key, (deps = new Set()))
  deps.add(activeEffect)
  activeEffect.depsList.push(deps)
}

/**
 * 在 set 拦截函数内调用，在响应式数据的指定属性上触发所订阅的副作用函数
 * @param target 响应式数据
 * @param key 属性
 * @param type 操作类型
 * @param newVal 新值
 * @param oldVal 旧值
 */
function trigger<T extends object>(target: T, key: string | symbol, type: TriggerType, newVal?: any, oldVal?: any) {
  const depsMap = bucket.get(target)
  if (!depsMap) return
  const effects = depsMap.get(key)
  const iterateEffects = depsMap.get(ITERATE_KEY)
  const effectsToRun = new Set<EffectFnInterface>()

  effects &&
    effects.forEach((effectFn) => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })

  if (
    type === TriggerType.ADD ||
    type === TriggerType.DELETE ||
    (Array.isArray(target) && key === 'length' && newVal < oldVal)
  ) {
    iterateEffects &&
      iterateEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToRun.add(effectFn)
        }
      })
  }

  if (Array.isArray(target)) {
    if (type === TriggerType.ADD && isIndex(key)) {
      const lengthEffects = depsMap.get('length')
      lengthEffects &&
        lengthEffects.forEach((effectFn) => {
          if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn)
          }
        })
    }

    if (key === 'length') {
      depsMap.forEach((effects, key) => {
        if (isIndex(key) && Number(key) >= newVal) {
          effects.forEach((effectFn) => {
            if (effectFn !== activeEffect) {
              effectsToRun.add(effectFn)
            }
          })
        }
      })
    }
  }

  effectsToRun.forEach((effectFn) => {
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn)
    } else {
      effectFn()
    }
  })
}

/**
 * 副作用副作用函数
 * @param fn 副作用函数
 * @param options 选项
 */
function effect(fn: Function, options: EffectOptionsInterface = {}) {
  const effectFn: EffectFnInterface = () => {
    cleanup(effectFn)
    activeEffect = effectFn
    effectStack.push(effectFn)
    const res = fn()
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }
  effectFn.options = options
  effectFn.depsList = []
  if (!options.lazy) {
    effectFn()
  }
  return effectFn
}

/**
 * 删除所有与该副作用函数关联的依赖集合
 * @param effectFn 副作用函数
 */
function cleanup(effectFn: EffectFnInterface) {
  for (const deps of effectFn.depsList) {
    deps.delete(effectFn)
  }
  effectFn.depsList.length = 0
}

// -------------------- 测试 --------------------
// -------------------- 测试1 --------------------
// const s = new Set([1, 2, 3])
// const p = reactive(s)

// console.log(p.size) // 报错 TypeError: Method get Set.prototype.size called on incompatible receiver #<Set>
// -------------------- 测试2 --------------------
const s = new Set([1, 2, 3])
const p = reactive(s)

console.log(p.delete(1)) // 报错 TypeError: Method Set.prototype.delete called on incompatible receiver #<Set>

export default {}
