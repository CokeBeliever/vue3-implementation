// -------------------- 解决分支切换的问题 --------------------

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
const data = { ok: true, text: 'hello world' }
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
  // 将其添加到 activeEffect.depsList 数组中
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
  // 避免无限循环，缓存并执行要重新执行的订阅函数
  const effectsToRun = new Set(effects)
  effectsToRun.forEach((effectFn) => effectFn())
}

/**
 * 订阅副作用函数
 * @param fn 副作用函数
 */
function effect(fn: Function) {
  // 创建副作用函数
  const effectFn: EffectFnInterface = () => {
    // 每次副作用函数重新执行时，先删除所有与该副作用函数关联的依赖集合
    cleanup(effectFn)
    activeEffect = effectFn
    fn()
  }
  // effectFn.depsList 用来存储所有与该副作用函数关联的依赖集合
  effectFn.depsList = []
  // 执行副作用函数
  effectFn()
}

/**
 * 删除所有与该副作用函数关联的依赖集合
 * @param effectFn 副作用函数
 */
function cleanup(effectFn: EffectFnInterface) {
  for (const deps of effectFn.depsList) {
    // 将 effectFn 从依赖集合中删除
    deps.delete(effectFn)
  }
  // 最后需要重置 effectFn.depsList 数组
  effectFn.depsList.length = 0
}

// -------------------- 测试 --------------------
effect(function effectFn() {
  console.log('effectFn run')
  document.body.innerText = obj.ok ? obj.text : 'not'
})

obj.text = 'hello vue3' // 打印 'effectFn run'

// 修改 obj.ok 为 false
obj.ok = false // 打印 'effectFn run'

// obj.ok 为 false 时，修改 obj.text 订阅的副作用函数不会重新执行
setTimeout(() => {
  obj.ok = false // 不打印 'effectFn run'
}, 1000)

export default {}
