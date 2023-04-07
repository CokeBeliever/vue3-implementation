// -------------------- 原始值的响应式方案 - 响应丢失问题 --------------------

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
  /** 代理目标是否为原始值 */
  IS_REF = '__v_isRef',
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
/** 用于建立 Map 或 WeakMap 类型与 keys() 迭代器方法相关联的副作用函数的响应式联系 */
const MAP_KEY_ITERATE_KEY = Symbol()
const reactiveMap = new Map()
/** 定义重写数组的原生方法 */
const arrayInstrumentations = {}
/** 定义重写集合类型的原生方法 */
const mutableInstrumentations = {
  has(key) {
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    track(target, key)
    return target.has(key)
  },
  get(key) {
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    const target: Map<any, any> = this[ReactiveFlags.RAW]
    track(target, key)
    return wrap(target.get(key))
  },
  forEach(callback, thisArg) {
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    track(target, ITERATE_KEY)
    target.forEach((value, key) => {
      callback.call(thisArg, wrap(value), wrap(key), this)
    })
  },
  add(key) {
    const target: Set<any> = this[ReactiveFlags.RAW]
    const had = target.has(key)
    const res = target.add(key)
    if (!had) {
      trigger(target, key, TriggerType.ADD)
    }
    return res
  },
  set(key, value) {
    const target: Map<any, any> = this[ReactiveFlags.RAW]
    const had = target.has(key)
    const oldValue = target.get(key)
    target.set(key, value)

    if (!had) {
      trigger(target, key, TriggerType.ADD)
    } else if (oldValue !== value || (oldValue === oldValue && value === value)) {
      trigger(target, key, TriggerType.SET, value, oldValue)
    }
  },
  delete(key) {
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    const had = target.has(key)
    const res = target.delete(key)
    if (had) {
      trigger(target, key, TriggerType.DELETE)
    }
    return res
  },
  clear() {
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    const oldSize = target.size
    target.clear()
    if (oldSize > 0) {
      trigger(target, ITERATE_KEY, TriggerType.DELETE)
    }
  },
  [Symbol.iterator]() {
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    const rawType = toRawType(target)
    const itr = target[Symbol.iterator]()

    track(target, ITERATE_KEY)

    return {
      next() {
        const { value, done } = itr.next()

        if (rawType === 'Set' || rawType === 'WeakSet') {
          return {
            value: wrap(value),
            done,
          }
        } else {
          return {
            value: value ? [wrap(value[0]), wrap(value[1])] : value,
            done,
          }
        }
      },
    }
  },
  keys() {
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    const rawType = toRawType(target)
    const itr = target.keys()

    track(target, rawType === 'Set' || rawType === 'WeakSet' ? ITERATE_KEY : MAP_KEY_ITERATE_KEY)

    return {
      next() {
        const { value, done } = itr.next()

        return {
          value: wrap(value),
          done,
        }
      },
      [Symbol.iterator]() {
        return this
      },
    }
  },
  values() {
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    const itr = target.values()

    track(target, ITERATE_KEY)

    return {
      next() {
        const { value, done } = itr.next()

        return {
          value: wrap(value),
          done,
        }
      },
      [Symbol.iterator]() {
        return this
      },
    }
  },
  entries() {
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    const itr = target.entries()

    track(target, ITERATE_KEY)

    return {
      next() {
        const { value, done } = itr.next()

        return {
          value: value ? [wrap(value[0]), wrap(value[1])] : value,
          done,
        }
      },
      [Symbol.iterator]() {
        return this
      },
    }
  },
}
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
  return Object.prototype.toString.call(target).slice(8, -1)
}

/**
 * 从原始类型到 targetType 的映射
 * @param rawType 原始类型
 */
function targetTypeMap(rawType: string) {
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
 * 创建原始值的响应式数据
 * @param value 原始值
 */
function ref(value: string | number | boolean | bigint | symbol | undefined | null) {
  const wrapper = {
    value,
  }
  Object.defineProperty(wrapper, ReactiveFlags.IS_REF, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  })
  return reactive(wrapper)
}

/**
 * 创建响应式数据指定 key 的引用对象
 * @param obj 对象
 * @param key 键
 */
function toRef<T extends object, K extends keyof T>(obj: T, key: K) {
  const wrapper = {
    get value() {
      return obj[key]
    },
    set value(value) {
      obj[key] = value
    },
  }
  // 定义 ReactiveFlags.IS_REF 属性
  Object.defineProperty(wrapper, ReactiveFlags.IS_REF, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  })
  return wrapper
}

/**
 * 创建响应式数据所有属性的引用对象
 * @param obj 对象
 */
function toRefs<T extends object>(obj: T) {
  const ret = {} as {
    [key in keyof T]: {
      value: T[Extract<keyof T, string>]
    }
  }
  // 使用 for...in 循环遍历对象
  for (const key in obj) {
    // 逐个调用 toRef 添加属性
    ret[key] = toRef(obj, key)
  }
  return ret
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
    (Array.isArray(target) && key === 'length' && newVal < oldVal) ||
    (type === TriggerType.SET && (toRawType(target) === 'Map' || toRawType(target) === 'WeakMap'))
  ) {
    iterateEffects &&
      iterateEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToRun.add(effectFn)
        }
      })
  }

  if (
    (type === TriggerType.ADD || type === TriggerType.DELETE) &&
    (toRawType(target) === 'Map' || toRawType(target) === 'WeakMap')
  ) {
    const mapKeyIterateEffects = depsMap.get(MAP_KEY_ITERATE_KEY)

    mapKeyIterateEffects &&
      mapKeyIterateEffects.forEach((effectFn) => {
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
// -------------------- 测试 1 --------------------
// // 创建响应式数据
// const obj = reactive({ foo: 1, bar: 2 })

// // 将响应式数据展开到一个新的对象 newObj
// const newObj = {
//   ...obj,
// }

// effect(() => {
//   // 在副作用函数内，读取 newObj.foo
//   console.log(newObj.foo)
// })

// obj.foo++ // 不会触发响应
// newObj.foo++ // 不会触发响应

// -------------------- 测试 2 --------------------
// const obj = reactive({ foo: 1, bar: 2 })

// const newObj = {
//   // 访问器属性 foo
//   get foo() {
//     return obj.foo
//   },
//   set foo(value) {
//     obj.foo = value
//   },
//   // 访问器属性 bar
//   get bar() {
//     return obj.bar
//   },
//   set bar(value) {
//     obj.bar = value
//   },
// }

// effect(() => {
//   console.log(newObj.foo)
// })

// obj.foo++ // 会触发响应
// newObj.foo++ // 会触发响应

// -------------------- 测试 3 --------------------
// const obj = reactive({ foo: 1, bar: 2 })

// const newObj = {
//   foo: toRef(obj, 'foo'),
//   bar: toRef(obj, 'bar'),
// }

// effect(() => {
//   // 在副作用函数内，读取 newObj.foo.value
//   console.log(newObj.foo.value)
// })

// obj.foo++ // 会触发响应
// newObj.foo.value++ // 会触发响应

// -------------------- 测试 4 --------------------
const obj = reactive({ foo: 1, bar: 2 })

const newObj = {
  ...toRefs(obj),
}

effect(() => {
  console.log(newObj.foo.value)
})

obj.foo++ // 会触发响应
newObj.foo.value++ // 会触发响应

export default {}
