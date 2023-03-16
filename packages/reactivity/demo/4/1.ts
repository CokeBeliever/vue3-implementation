// -------------------- 响应式系统的基本实现 --------------------

// -------------------- 逻辑代码 --------------------
// 存储函数的 "桶"
const bucket = new Set<Function>()
// 原始数据
const data = { text: 'hello world' }
// 响应式数据
const obj = new Proxy(data, {
  // 拦截读取操作
  get(target, key, receiver) {
    // 将 effect 存储起来
    bucket.add(effect)
    // 返回属性值
    return Reflect.get(target, key, receiver)
  },

  // 拦截设置操作
  set(target, key, newVal, receiver) {
    // 设置属性值
    const res = Reflect.set(target, key, newVal, receiver)
    // 如果设置操作成功，就把存储的函数取出来执行
    if (res) bucket.forEach((effectFn) => effectFn())
    // 返回设置操作是否成功
    return res
  },
})

function effect() {
  document.body.innerText = obj.text
}

// -------------------- 测试 --------------------effect()

setTimeout(() => {
  obj.text = 'hello vue3'
}, 1000)

export default {}
