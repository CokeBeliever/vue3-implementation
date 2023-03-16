// -------------------- 实现 watch - 立即执行的 watch + 回调函数的执行时机 --------------------

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

/**
 * watch options 接口
 */
interface WatchOptionsInterface {
  /** 立即执行 */
  immediate?: boolean
  /** 执行时机 */
  flush?: 'pre' | 'post' | 'sync'
}

// -------------------- 逻辑代码 --------------------
const bucket = new WeakMap<object, Map<string | symbol, Set<EffectFnInterface>>>()
let activeEffect: EffectFnInterface | undefined
const effectStack: EffectFnInterface[] = []
const data = { foo: 1, bar: 2 }
const obj = new Proxy(data, {
  get(target, key, receiver) {
    track(target, key)
    return Reflect.get(target, key, receiver)
  },

  set(target, key, newVal, receiver) {
    const res = Reflect.set(target, key, newVal, receiver)
    if (res) trigger(target, key)
    return res
  },
})

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
 */
function trigger<T extends object>(target: T, key: string | symbol) {
  const depsMap = bucket.get(target)
  if (!depsMap) return
  const effects = depsMap.get(key)
  const effectsToRun = new Set(effects)
  effectsToRun.forEach((effectFn) => {
    if (effectFn !== activeEffect) {
      if (effectFn.options.scheduler) {
        effectFn.options.scheduler(effectFn)
      } else {
        effectFn()
      }
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

/**
 * 计算属性
 * @param getter 获取器函数
 */
function computed<T>(getter: () => T): { readonly value: T } {
  let value: T
  let dirty = true

  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      dirty = true
      trigger(obj, 'value')
    },
  })

  const obj = {
    get value() {
      if (dirty) {
        value = effectFn()
        dirty = false
      }
      track(obj, 'value')
      return value
    },
  }

  return obj
}

/**
 * watch 函数
 * @param source 响应式数据或 getter 函数
 * @param cb 回调函数
 * @param options 选项
 */
function watch<T>(
  source: object | (() => T),
  cb: (newValue: T, oldValue: T) => any,
  options: WatchOptionsInterface = {}
) {
  let getter: Function
  if (typeof source === 'function') {
    getter = source
  } else {
    getter = () => traverse(source)
  }

  let oldValue: T, newValue: T

  // 提取 scheduler 调度函数为一个独立的 job 函数
  const job = () => {
    newValue = effectFn()
    cb(newValue, oldValue)
    oldValue = newValue
  }

  const effectFn = effect(() => getter(), {
    lazy: true,
    scheduler: () => {
      // 在调度函数中判断 flush 的值
      if (options.flush === 'pre') {
        // pre: 暂时先不模拟，涉及到组件的更新时机
      } else if (options.flush === 'post') {
        // post: 放到微任务队列中执行
        const p = Promise.resolve()
        p.then(job)
      } else {
        // sync: 立即执行
        job()
      }
    },
  })

  if (options.immediate) {
    // 当 immediate 为 true 时立即执行 job，从而触发回调函数
    job()
  } else {
    oldValue = effectFn()
  }
}

/**
 * 遍历数据
 * @param value 数据
 * @param seen 存储已读取的数据
 */
function traverse(value: any, seen = new Set()) {
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  seen.add(value)
  for (const k in value) {
    traverse(value[k], seen)
  }
  return value
}

// -------------------- 测试 --------------------
// -------------------- 测试1 --------------------
// watch(
//   obj,
//   () => {
//     console.log('变化了')
//   },
//   {
//     // 回调函数会在 watch 创建时立即执行一次
//     immediate: true,
//   }
// )

// -------------------- 测试2 --------------------
watch(
  obj,
  () => {
    console.log('变化了')
  },
  {
    flush: 'pre',
  }
)

export default {}
