import { track, trigger, ITERATE_KEY, MAP_KEY_ITERATE_KEY, TriggerType } from './effect'
import { reactive, ReactiveFlags } from './reactive'
import { toRawType } from './shared'

/** 定义重写集合类型的原生方法 */
export const mutableInstrumentations = {
  has(key) {
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    track(target, key)
    return target.has(key)
  },
  get(key) {
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    const target: Map<any, any> = this[ReactiveFlags.RAW]
    track(target, key)
    return wrap(target.get(key))
  },
  forEach(callback, thisArg) {
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    track(target, ITERATE_KEY)
    target.forEach((value, key) => {
      callback.call(thisArg, wrap(value), wrap(key), this)
    })
  },
  add(key) {
    const target: Set<any> = this[ReactiveFlags.RAW]
    const had = target.has(key)
    const res = target.add(key)
    if (!had) {
      trigger(target, key, TriggerType.ADD)
    }
    return res
  },
  set(key, value) {
    const target: Map<any, any> = this[ReactiveFlags.RAW]
    const had = target.has(key)
    const oldValue = target.get(key)
    target.set(key, value)

    if (!had) {
      trigger(target, key, TriggerType.ADD)
    } else if (oldValue !== value || (oldValue === oldValue && value === value)) {
      trigger(target, key, TriggerType.SET, value, oldValue)
    }
  },
  delete(key) {
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    const had = target.has(key)
    const res = target.delete(key)
    if (had) {
      trigger(target, key, TriggerType.DELETE)
    }
    return res
  },
  clear() {
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    const oldSize = target.size
    target.clear()
    if (oldSize > 0) {
      trigger(target, ITERATE_KEY, TriggerType.DELETE)
    }
  },
  [Symbol.iterator]() {
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    const rawType = toRawType(target)
    const itr = target[Symbol.iterator]()

    track(target, ITERATE_KEY)

    return {
      next() {
        const { value, done } = itr.next()

        if (rawType === 'Set' || rawType === 'WeakSet') {
          return {
            value: wrap(value),
            done,
          }
        } else {
          return {
            value: value ? [wrap(value[0]), wrap(value[1])] : value,
            done,
          }
        }
      },
    }
  },
  keys() {
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    const rawType = toRawType(target)
    const itr = target.keys()

    track(target, rawType === 'Set' || rawType === 'WeakSet' ? ITERATE_KEY : MAP_KEY_ITERATE_KEY)

    return {
      next() {
        const { value, done } = itr.next()

        return {
          value: wrap(value),
          done,
        }
      },
      [Symbol.iterator]() {
        return this
      },
    }
  },
  values() {
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    const itr = target.values()

    track(target, ITERATE_KEY)

    return {
      next() {
        const { value, done } = itr.next()

        return {
          value: wrap(value),
          done,
        }
      },
      [Symbol.iterator]() {
        return this
      },
    }
  },
  entries() {
    const wrap = (val) => (typeof val === 'object' && val !== null ? reactive(val) : val)
    const target: Set<any> | Map<any, any> = this[ReactiveFlags.RAW]
    const itr = target.entries()

    track(target, ITERATE_KEY)

    return {
      next() {
        const { value, done } = itr.next()

        return {
          value: value ? [wrap(value[0]), wrap(value[1])] : value,
          done,
        }
      },
      [Symbol.iterator]() {
        return this
      },
    }
  },
}
