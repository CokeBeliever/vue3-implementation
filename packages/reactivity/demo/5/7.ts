// -------------------- 代理数组 - 遍历数组 --------------------

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
          // 增加第五个参数，即触发响应的旧值
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
    // 修改数组的 length 属性且新值比旧值小时，应该取出并执行与迭代相关联的副作用函数
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
// -------------------- 测试 1 --------------------
// const arr = reactive(['foo', 'bar'])

// effect(() => {
//   for (const key in arr) {
//     console.log(key)
//   }
//   console.log('副作用函数执行结束')
// })

// arr[2] = 'baz' // 可以触发响应
// arr['key1'] = 'qux' // 可以触发响应
// arr.length = 1 // 可以触发响应
// -------------------- 测试 2 --------------------
const arr = reactive(['foo', 'bar'])

effect(() => {
  for (const val of arr) {
    console.log(val)
  }
  console.log('副作用函数执行结束')
})

arr[2] = 'baz' // 可以触发响应
arr['key1'] = 'qux' // 不会触发响应
arr.length = 1 // 可以触发响应

export default {}
