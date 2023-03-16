// -------------------- 实现计算属性 computed 与懒执行 lazy --------------------

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
    // 将 fn 的执行结果缓存到 res 中
    const res = fn()
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
    // 返回 fn 的执行结果
    return res
  }
  effectFn.options = options
  effectFn.depsList = []
  // 只有非 lazy 的时候，才执行
  if (!options.lazy) {
    effectFn()
  }
  // 将副作用函数作为返回值返回
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
  // value 用来缓存上一次计算的值
  let value: T
  // dirty 标志，用来标识是否需要重新计算，为 true 则意味着 "脏"，需要计算
  let dirty = true

  // 把 getter 作为订阅的副作用函数，创建一个 lazy 的 effectFn
  const effectFn = effect(getter, {
    lazy: true,
    // 添加调度函数，在调度函数中将 dirty 重置为 true
    scheduler() {
      dirty = true
      // 当计算属性依赖的响应式数据变化时，手动调用 trigger 函数触发响应
      trigger(obj, 'value')
    },
  })

  const obj = {
    // 当读取 value 时才执行 effectFn
    get value() {
      // 只有 "脏" 时才计算值，并将得到的值缓存到 value 中
      if (dirty) {
        value = effectFn()
        // 将 dirty 设置为 false，下一次访问直接使用缓存在 value 中的值
        dirty = false
      }
      // 当读取 value 时，手动调用 track 函数进行追踪
      track(obj, 'value')
      return value
    },
  }

  return obj
}

// -------------------- 测试 --------------------
// -------------------- 测试1 --------------------
// const sumRes = computed(() => {
//   console.log('run')
//   return obj.foo + obj.bar
// })

// console.log(sumRes.value)
// console.log(sumRes.value)
// console.log(sumRes.value)

// -------------------- 测试2 --------------------
const sumRes = computed(() => obj.foo + obj.bar)

effect(() => {
  // 在该订阅函数中读取 sumRes.value
  console.log(sumRes.value)
})

// 修改 obj.foo 的值
obj.foo++

export default {}
