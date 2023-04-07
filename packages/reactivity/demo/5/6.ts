// -------------------- 代理数组 - 数组的索引与 length --------------------

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

const bucket = new WeakMap<object, Map<string | symbol, Set<EffectFnInterface>>>()
let activeEffect: EffectFnInterface | undefined
const effectStack: EffectFnInterface[] = []
const ITERATE_KEY = Symbol()
const reactiveMap = new Map()

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
 * 封装创建响应式数据逻辑
 * @param obj 对象
 * @param isShallow 是否为浅响应/浅只读
 * @param isReadonly 是否只读
 */
function createReactive<T extends object>(obj: T, isShallow = false, isReadonly = false): T {
  const existionProxy = reactiveMap.get(obj)
  if (existionProxy) return existionProxy

  const proxy = new Proxy(obj, {
    get(target, key, receiver) {
      if (key === ReactiveFlags.RAW) {
        return target
      }

      if (!isReadonly) {
        track(target, key)
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
      // 判断是在添加新的属性，还是设置已有属性
      let type = TriggerType.SET

      {
        // 如果代理目标是数组并且 key 是索引时，则检测被设置的索引值是否小于数组长度判断
        if (Array.isArray(target) && isIndex(key)) {
          type = Number(key) < target.length ? TriggerType.SET : TriggerType.ADD
        }
        // 其他情况，则根据属性是否存在进行判断
        else {
          type = Object.prototype.hasOwnProperty.call(target, key) ? TriggerType.SET : TriggerType.ADD
        }
      }

      const res = Reflect.set(target, key, newVal, receiver)

      if (target === receiver[ReactiveFlags.RAW]) {
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          // 增加第四个参数，即触发响应的新值
          trigger(target, key, type, newVal)
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
  })

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
  if (!activeEffect) return
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
 */
function trigger<T extends object>(target: T, key: string | symbol, type: TriggerType, newVal?: any) {
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

  if (type === TriggerType.ADD || type === TriggerType.DELETE) {
    iterateEffects &&
      iterateEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToRun.add(effectFn)
        }
      })
  }

  // 当目标对象是数组时
  if (Array.isArray(target)) {
    // 当操作类型为 ADD 并且 key 是索引时，应该取出并执行那些与 length 属性相关联的副作用函数
    if (type === TriggerType.ADD && isIndex(key)) {
      // 取出与 length 相关联的副作用函数
      const lengthEffects = depsMap.get('length')
      // 将这些副作用函数添加到 effectsToRun 中，待执行
      lengthEffects &&
        lengthEffects.forEach((effectFn) => {
          if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn)
          }
        })
    }

    // 修改数组的 length 属性时，应该取出并执行那些大于或等于新 length 值的索引属性相关联的副作用函数
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
// const arr = reactive(['foo'])

// effect(() => {
//   console.log(arr[0])
// })

// arr[0] = 'bar' // 能够触发响应
// -------------------- 测试 2 --------------------
// const arr = reactive(['foo']) // 数组的原长度为 1

// effect(() => {
//   console.log(arr.length) // 1
// })

// // 设置索引 1 的值，会导致数组的长度变为 2
// arr[1] = 'bar' // 能够触发响应
// -------------------- 测试 3 --------------------
const arr = reactive(['foo'])

effect(() => {
  // 访问数组的第 0 个元素
  console.log(arr[0])
})

// 将数组的长度修改为 0，会导致索引在 0 以及之后的元素都被删除，因此应该触发响应
arr.length = 0

export default {}
