// -------------------- 解决硬编码副作用函数的问题 --------------------

// -------------------- 逻辑代码 --------------------
const bucket = new Set<Function>()
// 用一个全局变量存储需要订阅的副作用函数
let activeEffect: Function | undefined
const data = { text: 'hello world' }
const obj = new Proxy(data, {
  get(target, key, receiver) {
    // 如果存在需要订阅的副作用函数，就将副作用函数存储起来
    if (activeEffect) bucket.add(activeEffect)
    return Reflect.get(target, key, receiver)
  },

  set(target, key, newVal, receiver) {
    const res = Reflect.set(target, key, newVal, receiver)
    if (res) bucket.forEach((effectFn) => effectFn())
    return res
  },
})

/**
 * 订阅副作用函数
 * @param fn 副作用函数
 */
function effect(fn: Function) {
  activeEffect = fn
  // 调用函数，让函数订阅在它所依赖的响应式数据上
  fn()
}

// -------------------- 测试 --------------------
// 订阅一个匿名函数
effect(() => {
  document.body.innerText = obj.text
})

setTimeout(() => {
  obj.text = 'hello vue3'
}, 1000)

export default {}
