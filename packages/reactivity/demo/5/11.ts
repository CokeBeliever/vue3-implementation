// -------------------- 代理 Set 和 Map - 实现响应式数据 --------------------

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
/** 用于建立 Map 或 WeakMap 类型与 keys() 迭代器方法相关联的副作用函数的响应式联系 */
const MAP_KEY_ITERATE_KEY = Symbol()
const reactiveMap = new Map()
/** 定义重写数组的原生方法 */
const arrayInstrumentations = {}
/** 定义重写集合类型的原生方法 */
const mutableInstrumentations = {
  has(key) {
    // 获取原始数据对象
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    // 调用 track 函数建立响应式联系
    track(target, key)
    return target.has(key)
  },
  get(key) {
    // wrap 函数用来把可代理对象转换为响应式数据
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    // 获取原始数据对象
    const target: Map<any, any> = this[ReactiveFlags.RAW]
    // 建立响应式联系
    track(target, key)
    // 返回调用 wrap 函数包装的结果
    return wrap(target.get(key))
  },
  forEach(callback, thisArg) {
    // wrap 函数用来把可代理对象转换为响应式数据
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    // 获取原始数据对象
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    // 与 ITERATE_KEY 建立响应式联系
    track(target, ITERATE_KEY)
    // 通过原始数据对象调用 forEach 方法，并把 callback 和 thisArg 传递过去
    target.forEach((value, key) => {
      // 手动调用 callback，用 wrap 函数包裹 value 和 key 后再传给 callback，这样就实现了深响应
      callback.call(thisArg, wrap(value), wrap(key), this)
    })
  },
  add(key) {
    // this 仍然指向的是代理对象，通过 ReactiveFlags.RAW 属性获取原始数据对象
    const target: Set<any> = this[ReactiveFlags.RAW]
    // 先判断 key 是否已经存在
    const had = target.has(key)
    // 通过原始数据对象执行 add 方法删除具体的值
    const res = target.add(key)
    // 只有在值不存在的情况下，才需要触发响应
    if (!had) {
      // 调用 trigger 函数触发响应，并指定操作类型为 TriggerType.ADD
      trigger(target, key, TriggerType.ADD)
    }
    // 返回操作结果
    return res
  },
  set(key, value) {
    // 获取原始数据对象
    const target: Map<any, any> = this[ReactiveFlags.RAW]
    // 判断设置的 key 是否存在
    const had = target.has(key)
    // 获取旧值
    const oldValue = target.get(key)
    // 设置新值
    target.set(key, value)

    // 如果不存在，则说明是 TriggerType.ADD 类型的操作，否则说明是 TriggerType.SET 类型的操作
    if (!had) {
      trigger(target, key, TriggerType.ADD)
    }
    // 代码运行到这里，说明是 TriggerType.SET 类型的操作，如果新旧值不相同，则触发响应
    else if (oldValue !== value || (oldValue === oldValue && value === value)) {
      trigger(target, key, TriggerType.SET, value, oldValue)
    }
  },
  delete(key) {
    // 获取原始数据对象
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    // 判断 key 是否存在
    const had = target.has(key)
    const res = target.delete(key)
    // 只有在值存在的情况下，才需要触发响应
    if (had) {
      // 调用 trigger 函数触发响应，并指定操作类型为 TriggerType.DELETE
      trigger(target, key, TriggerType.DELETE)
    }
    return res
  },
  clear() {
    // 获取原始数据对象
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    // 获取清除之前的 size 值
    const oldSize = target.size
    target.clear()
    // 只有在 oldSize > 0 的情况下，才需要触发响应
    if (oldSize > 0) {
      // 调用 trigger 函数触发响应，并指定操作类型为 TriggerType.DELETE
      trigger(target, ITERATE_KEY, TriggerType.DELETE)
    }
  },
  [Symbol.iterator]() {
    // wrap 函数用来把可代理对象转换为响应式数据
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    // 获取原始数据对象
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    // 获取原始类型
    const rawType = toRawType(target)
    // 获取原始默认迭代器
    const itr = target[Symbol.iterator]()

    // 调用 track 函数建立响应式联系
    track(target, ITERATE_KEY)

    // 返回自定义迭代器
    return {
      next() {
        // 调用迭代器的 next 方法获取 value 和 done
        const { value, done } = itr.next()

        // Set 和 WeakSet
        if (rawType === 'Set' || rawType === 'WeakSet') {
          return {
            value: wrap(value),
            done,
          }
        }
        // Map 和 WeakMap
        else {
          return {
            // 如果 value 不是 undefined，则对其 key 和 value 进行包装
            value: value ? [wrap(value[0]), wrap(value[1])] : value,
            done,
          }
        }
      },
    }
  },
  keys() {
    // wrap 函数用来把可代理对象转换为响应式数据
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    // 获取原始数据对象
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    // 获取原始类型
    const rawType = toRawType(target)
    // 获取原始 keys 迭代器
    const itr = target.keys()

    // 调用 track 函数建立响应式联系
    track(target, rawType === 'Set' || rawType === 'WeakSet' ? ITERATE_KEY : MAP_KEY_ITERATE_KEY)

    // 返回自定义迭代器
    return {
      next() {
        // 调用迭代器的 next 方法获取 value 和 done
        const { value, done } = itr.next()

        return {
          value: wrap(value),
          done,
        }
      },
      // 实现可迭代协议
      [Symbol.iterator]() {
        return this
      },
    }
  },
  values() {
    // wrap 函数用来把可代理对象转换为响应式数据
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    // 获取原始数据对象
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    // 获取原始 valuse 迭代器
    const itr = target.values()

    // 调用 track 函数建立响应式联系
    track(target, ITERATE_KEY)

    // 返回自定义迭代器
    return {
      next() {
        // 调用迭代器的 next 方法获取 value 和 done
        const { value, done } = itr.next()

        return {
          value: wrap(value),
          done,
        }
      },
      // 实现可迭代协议
      [Symbol.iterator]() {
        return this
      },
    }
  },
  entries() {
    // wrap 函数用来把可代理对象转换为响应式数据
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    // 获取原始数据对象
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    // 获取原始 entries 迭代器
    const itr = target.entries()

    // 调用 track 函数建立响应式联系
    track(target, ITERATE_KEY)

    // 返回自定义迭代器
    return {
      next() {
        // 调用迭代器的 next 方法获取 value 和 done
        const { value, done } = itr.next()

        return {
          // 如果 value 不是 undefined，则对其 key 和 value 进行包装
          value: value ? [wrap(value[0]), wrap(value[1])] : value,
          done,
        }
      },
      // 实现可迭代协议
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
  // 从字符串 "[object RawType]" 中提取 "RawType"
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
          // 调用 track 函数建立响应式联系
          track(target, ITERATE_KEY)
          return Reflect.get(target, key, target)
        }

        // 如果 mutableInstrumentations 对象中存在这个属性
        if (mutableInstrumentations.hasOwnProperty(key)) {
          // 返回定义在 mutableInstrumentations 对象下的方法
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
    // 如果触发类型为 TriggerType.SET 且 target 是 Map 或 WeakMap 类型时，那么触发相关联的副作用函数重新执行
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
    // 如果触发类型为 TriggerType.ADD 或 TriggerType.DELETE 且 target 是 Map 或 WeakMap 类型时，那么触发 MAP_KEY_ITERATE_KEY 相关联的副作用函数重新执行
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
// const p = reactive(new Set([1, 2, 3]))

// effect(() => {
//   // 在副作用函数内读取 size 属性
//   console.log(p.size)
// })

// -------------------- 测试 2 --------------------
const p = reactive(
  new Map([
    ['key1', 'value1'],
    ['key2', 'value2'],
  ])
)

effect(() => {
  for (const key of p.keys()) {
    console.log('keys', key)
  }
})

p.set('key2', 'value3') // 不会触发响应
p.set('key3', 'value3') // 能够触发响应

export default {}
