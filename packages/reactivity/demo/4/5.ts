// -------------------- 实现嵌套 effect 的问题 --------------------

// -------------------- 类型代码 --------------------
/**
 * 副作用函数接口
 */
interface EffectFnInterface {
  (): any
  /** 依赖副作用函数的集合列表 */
  depsList: Set<EffectFnInterface>[]
}

// -------------------- 逻辑代码 --------------------
const bucket = new WeakMap<object, Map<string | symbol, Set<EffectFnInterface>>>()
let activeEffect: EffectFnInterface | undefined
// effect 栈
const effectStack: EffectFnInterface[] = []
const data = { foo: true, bar: true }
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
  effectsToRun.forEach((effectFn) => effectFn())
}

/**
 * 订阅副作用函数
 * @param fn 副作用函数
 */
function effect(fn: Function) {
  const effectFn: EffectFnInterface = () => {
    cleanup(effectFn)
    activeEffect = effectFn
    // 当调用订阅的副作用函数之前，将当前 effectFn 压入栈中
    effectStack.push(effectFn)
    fn()
    // 在当前订阅的副作用函数执行完毕后，将当前 effectFn 弹出栈
    effectStack.pop()
    // activeEffect 指向栈顶
    activeEffect = effectStack[effectStack.length - 1]
  }
  effectFn.depsList = []
  effectFn()
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
effect(function effectFn1() {
  console.log('effectFn1 执行')
  effect(function effectFn2() {
    console.log('effectFn2 执行')
    // 在 effectFn2 中读取 obj.bar 属性
    obj.bar
  })
  // 在 effectFn1 中读取 obj.foo 属性
  obj.foo
})

// 修改 obj.foo 值，希望重新执行 effectFn1 和 effectFn2
setTimeout(() => {
  obj.foo = !obj.foo
}, 1000)

export default {}
