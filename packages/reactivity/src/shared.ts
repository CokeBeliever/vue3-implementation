/**
 * 目标类型
 */
export const enum TargetType {
  INVALID = 0,
  COMMON = 1,
  COLLECTION = 2,
}

/**
 * key 是否为索引
 * @param key 属性键
 */
export const isIndex = (key: string | symbol): boolean => {
  if (typeof key === 'symbol') return false
  const index = Number(key)
  return Number.isInteger(index) && index >= 0
}

/**
 * 获取 target 的原始类型
 * @param target 对象
 */
export function toRawType(target: object) {
  return Object.prototype.toString.call(target).slice(8, -1)
}

/**
 * 从原始类型到 targetType 的映射
 * @param rawType 原始类型
 */
export function targetTypeMap(rawType: string) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return TargetType.COMMON
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return TargetType.COLLECTION
    default:
      return TargetType.INVALID
  }
}
