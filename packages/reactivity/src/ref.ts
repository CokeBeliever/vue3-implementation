import { reactive, ReactiveFlags } from './reactive'

/**
 * 创建原始值的响应式数据
 * @param value 原始值
 */
function ref(value: string | number | boolean | bigint | symbol | undefined | null) {
  const wrapper = {
    value,
  }
  Object.defineProperty(wrapper, ReactiveFlags.IS_REF, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  })
  return reactive(wrapper)
}

/**
 * 创建响应式数据指定 key 的引用对象
 * @param obj 对象
 * @param key 键
 */
function toRef<T extends object, K extends keyof T>(obj: T, key: K) {
  const wrapper = {
    get value() {
      return obj[key]
    },
    set value(value) {
      obj[key] = value
    },
  }
  // 定义 ReactiveFlags.IS_REF 属性
  Object.defineProperty(wrapper, ReactiveFlags.IS_REF, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  })
  return wrapper
}

/**
 * 创建响应式数据所有属性的引用对象
 * @param obj 对象
 */
function toRefs<T extends object>(obj: T) {
  const ret = {} as {
    [key in keyof T]: {
      value: T[Extract<keyof T, string>]
    }
  }
  // 使用 for...in 循环遍历对象
  for (const key in obj) {
    // 逐个调用 toRef 添加属性
    ret[key] = toRef(obj, key)
  }
  return ret
}
