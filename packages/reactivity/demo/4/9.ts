// -------------------- 实现 watch - 默认 --------------------

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
 */
function watch<T>(source: object | (() => T), cb: (newValue: T, oldValue: T) => any) {
  // 定义 getter
  let getter: Function
  // 如果 source 是函数，说明用户传递的是 getter，所以直接把 source 赋值给 getter
  if (typeof source === 'function') {
    getter = source
  } else {
    // 否则按照原来的实现调用 traverse 递归地读取
    getter = () => traverse(source)
  }

  // 定义旧值与新值
  let oldValue: T, newValue: T
  // 使用 effect 订阅副作用函数时，开启 lazy 选项，并把返回值存储到 effectFn 中以便后续手动调用
  const effectFn = effect(
    // 调用 traverse 递归地读取
    () => getter(),
    {
      lazy: true,
      scheduler() {
        // 在 scheduler 中重新执行副作用函数，得到的是新值
        newValue = effectFn()
        // 将旧值和新值作为回调函数的参数
        cb(newValue, oldValue)
        // 更新旧值，不然下一次会得到错误的旧值
        oldValue = newValue
      },
    }
  )

  // 手动调用副作用函数，拿到的值就是旧值
  oldValue = effectFn()
}

/**
 * 遍历数据
 * @param value 数据
 * @param seen 存储已读取的数据
 */
function traverse(value: any, seen = new Set()) {
  // 如果要读取的数据是原始值，或者是函数，或者已经被读取过了，那么什么都不做
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  // 将数据添加到 seen 中，代表遍历地读取过了，避免循环引用引起的死循环
  seen.add(value)
  // 暂时不考虑数组等其他结构
  // 假设 value 就是一个对象，使用 for...in 读取对象的每一个值，并递归地调用 traverse 进行处理
  for (const k in value) {
    traverse(value[k], seen)
  }
  return value
}

// -------------------- 测试 --------------------
// -------------------- 测试1 --------------------
// watch(obj, () => {
//   console.log('数据变了')
// })

// // 修改响应式数据的值，会导致订阅的副作用函数的执行
// obj.foo++
// obj.bar++

// -------------------- 测试2 --------------------
// watch(
//   // getter 函数
//   () => obj.foo,
//   // 回调函数
//   () => {
//     console.log('obj.foo 的值变了')
//   }
// )

// -------------------- 测试3 --------------------
watch(
  () => obj.foo,
  (newValue, oldValue) => {
    console.log(newValue, oldValue)
  }
)

obj.foo++

export default {}
