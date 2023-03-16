// -------------------- 解决存储副作用函数数据结构的问题 --------------------

// -------------------- 逻辑代码 --------------------
/**
 * 存储副作用函数的 "桶"
 * bucket
 * ├── obj-1 (响应式数据 object 类型)
 * │   └── key-1 (属性 string 或 symbol 类型)
 * │       │── fn-1 (副作用函数 Function 类型)
 * │       └── fn-2
 * └── obj-2
 *     └── key-2
 *         └── fn-1
 */
const bucket = new WeakMap<object, Map<string | symbol, Set<Function>>>()
let activeEffect: Function | undefined
const data: { text: string; notExist?: any } = { text: 'hello world' }
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
  effects && effects.forEach((effectFn) => effectFn())
}

/**
 * 订阅副作用函数
 * @param fn 副作用函数
 */
function effect(fn: Function) {
  activeEffect = fn
  fn()
}

// -------------------- 测试 --------------------
effect(() => {
  console.log('effect run')
  document.body.innerText = obj.text
})

setTimeout(() => {
  // 订阅的副作用函数中并没有读取 notExist 属性的值
  obj.notExist = 'hello vue3'
}, 1000)

export default {}
