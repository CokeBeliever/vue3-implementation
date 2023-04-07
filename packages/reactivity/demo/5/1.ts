// -------------------- 代理 Object --------------------

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

const bucket = new WeakMap<object, Map<string | symbol, Set<EffectFnInterface>>>()
let activeEffect: EffectFnInterface | undefined
const effectStack: EffectFnInterface[] = []

const obj: { foo: number; bar?: number } = { foo: 1 }
const ITERATE_KEY = Symbol()

const p = new Proxy(obj, {
  get(target, key, receiver) {
    // 建立联系
    track(target, key)
    // 返回属性值
    return Reflect.get(target, key, receiver)
  },

  has(target, key) {
    track(target, key)
    return Reflect.has(target, key)
  },

  ownKeys(target) {
    // 将副作用函数与 ITERATE_KEY 关联
    track(target, ITERATE_KEY)
    return Reflect.ownKeys(target)
  },

  set(target, key, newVal, receiver) {
    // 如果属性不存在，则说明是在添加新属性，否则是设置已有属性
    const type = Object.prototype.hasOwnProperty.call(target, key) ? TriggerType.SET : TriggerType.ADD
    // 设置属性值
    const res = Reflect.set(target, key, newVal, receiver)

    // 将 type 作为第三个参数传递给 trigger 函数
    if (res) trigger(target, key, type)

    return res
  },

  deleteProperty(target, key) {
    // 检查被操作的属性是否是对象自己的属性
    const hadKey = Object.prototype.hasOwnProperty.call(target, key)
    // 使用 Reflect.deleteProperty 完成属性的删除
    const res = Reflect.deleteProperty(target, key)

    if (res && hadKey) {
      // 只有当被删除的属性是对象自己的属性并且成功删除时，才触发更新
      trigger(target, key, TriggerType.DELETE)
    }

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
 * @param type 操作类型
 */
function trigger<T extends object>(target: T, key: string | symbol, type: TriggerType) {
  const depsMap = bucket.get(target)
  if (!depsMap) return
  // 取得与 key 相关联的副作用函数
  const effects = depsMap.get(key)
  // 取得与 ITERATE_KEY 相关联的副作用函数
  const iterateEffects = depsMap.get(ITERATE_KEY)
  const effectsToRun = new Set<EffectFnInterface>()

  // 将与 key 相关联的副作用函数添加到 effectsToRun
  effects &&
    effects.forEach((effectFn) => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })

  // 当操作类型为 TriggerType.ADD 或 TriggerType.DELETE 时，需要触发与 ITERATE_KEY 相关联的副作用函数重新执行
  if (type === TriggerType.ADD || type === TriggerType.DELETE) {
    iterateEffects &&
      iterateEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToRun.add(effectFn)
        }
      })
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
effect(() => {
  // for...in 循环
  for (const key in p) {
    console.log(key) // foo
  }
})

// ADD 添加：会触发与 ITERATE_KEY 相关联当副作用函数重新执行
console.log('ADD 添加：p.bar')
p.bar = 2

// SET 修改：不会触发与 ITERATE_KEY 相关联当副作用函数重新执行
console.log('SET 修改：p.bar')
p.bar = 3

// DELETE 删除：会触发与 ITERATE_KEY 相关联当副作用函数重新执行
console.log('DELETE 删除：p.bar')
delete p.bar

export default {}
