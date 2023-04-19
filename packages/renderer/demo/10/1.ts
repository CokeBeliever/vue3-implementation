// -------------------- 双端 Diff 算法 - 在头尾部分寻找可复用节点 --------------------

// -------------------- 类型代码 --------------------
/**
 * 基础虚拟节点
 * @template Type 节点类型类型
 * @template Children 子节点类型
 * @template El 虚拟节点对应的真实节点类型
 */
interface BasicVnode<Type, Children, El> {
  /** 节点类型 */
  type: Type
  /** 子节点 */
  children?: Children
  /** 虚拟节点对应的真实节点 */
  el?: El
  /** 节点标识 */
  key?: any
}

/**
 * 元素虚拟节点
 * @template ElementNode 真实元素节点类型
 * @template TextNode 真实文本节点类型
 * @template CommentNode 真实注释节点类型
 */
interface ElementVnode<ElementNode, TextNode, CommentNode>
  extends BasicVnode<string, string | Vnode<ElementNode, TextNode, CommentNode>[] | undefined, ElementNode> {
  /** 节点属性的键值对映射 */
  props?: { [key: string]: any }
}

/**
 * 文本虚拟节点
 * @template TextNode 真实文本节点类型
 */
interface TextVnode<TextNode> extends BasicVnode<VnodeTypeEnum.TEXT, string, TextNode> {}

/**
 * 注释虚拟节点
 * @template CommentNode 真实注释节点类型
 */
interface CommentVnode<CommentNode> extends BasicVnode<VnodeTypeEnum.COMMENT, string, CommentNode> {}

/**
 * Fragment (片段) 虚拟节点
 * @template ElementNode 真实元素节点类型
 * @template TextNode 真实文本节点类型
 * @template CommentNode 真实注释节点类型
 */
interface FragmentVnode<ElementNode, TextNode, CommentNode>
  extends BasicVnode<VnodeTypeEnum.FRAGMENT, Vnode<ElementNode, TextNode, CommentNode>[] | undefined, undefined> {}

/**
 * 虚拟节点
 * @template ElementNode 真实元素节点类型
 * @template TextNode 真实文本节点类型
 * @template CommentNode 真实注释节点类型
 */
type Vnode<ElementNode, TextNode, CommentNode> =
  | ElementVnode<ElementNode, TextNode, CommentNode>
  | TextVnode<TextNode>
  | CommentVnode<CommentNode>
  | FragmentVnode<ElementNode, TextNode, CommentNode>

/**
 * 元素容器
 * @template ElementNode 真实元素节点类型
 * @template TextNode 真实文本节点类型
 * @template CommentNode 真实注释节点类型
 * @example _vnode 虚拟节点类型：
 * ```html
 * 元素虚拟节点：例如：<div class="container"><input /></div>
 * 文本虚拟节点：例如：<div class="container">我是文本节点</div>
 * 注释虚拟节点：例如：<div class="container"><!-- 我是注释节点 --></div>
 * ```
 */
type ElementContainer<ElementNode, TextNode, CommentNode> = ElementNode & {
  /** 容器上挂载的真实节点所对应的虚拟节点 */
  _vnode?: Vnode<ElementNode, TextNode, CommentNode> | null
}

/**
 * 挂载容器
 * @template ElementNode 真实元素节点类型
 * @template TextNode 真实文本节点类型
 * @template CommentNode 真实注释节点类型
 * @example 容器类型：
 * ```html
 * 元素容器，例如：<div class="container"></div>
 * ````
 */
type Container<ElementNode, TextNode, CommentNode> = ElementContainer<ElementNode, TextNode, CommentNode>

/**
 * 创建渲染器配置项
 * @template ElementNode 平台的真实元素节点类型
 * @template TextNode 平台的真实文本节点类型
 * @template CommentNode 平台的真实注释节点类型
 * @template ChildNode 平台的真实的 ChildNode 类型
 */
interface CreateRendererOptions<ElementNode, TextNode, CommentNode, ChildNode> {
  /**
   * 创建元素节点
   * @param tag 标签名称
   */
  createElement: (tag: string) => ElementNode

  /**
   * 创建文本节点
   * @param text 文本内容
   */
  createText: (text: string) => TextNode

  /**
   * 创建注释节点
   * @param text 注释内容
   */
  createComment: (text: string) => CommentNode

  /**
   * 设置元素节点的文本内容
   * @param el 元素节点
   * @param text 文本内容
   */
  setElementText: (el: ElementNode, text: string) => void

  /**
   * 设置文本节点的文本内容
   * @param el 文本节点
   * @param text 文本内容
   */
  setTextText: (el: TextNode, text: string) => void

  /**
   * 设置注释节点的注释内容
   * @param el 注释节点
   * @param text 注释内容
   */
  setCommentText: (el: CommentNode, text: string) => void

  /**
   * 在给定的 parent 元素节点下添加指定的 el 子节点
   * @param el 子节点
   * @param parent 父元素节点
   * @param anchor 如果是节点，则添加在 anchor 之前
   */
  insert: (el: ElementNode | TextNode | CommentNode, parent: ElementNode, anchor?: ChildNode | null) => void

  /**
   * 移除指定的 el 节点
   * @param el 节点
   */
  remove: (el: ElementNode | TextNode | CommentNode) => void

  /**
   * 更新元素节点的属性
   * @param el 元素节点
   * @param key 属性键
   * @param prevValue 旧属性值
   * @param nextValue 新属性值
   */
  patchProps: (el: ElementNode, key: string, prevValue: any, nextValue: any) => void

  /**
   * 获取节点的下一个兄弟节点
   * @param el 节点
   */
  nextSibling: (el: ElementNode | TextNode | CommentNode) => ChildNode | null

  /**
   * 获取元素节点的第一个子节点
   */
  firstChild: (el: ElementNode) => ChildNode | null
}

// -------------------- 逻辑代码 --------------------
/**
 * 虚拟节点类型枚举 (不表示元素虚拟节点)
 */
enum VnodeTypeEnum {
  /** 文本节点的 type 标识 */
  TEXT,
  /** 注释节点的 type 标识 */
  COMMENT,
  /** Fragment 的 type 标识 */
  FRAGMENT,
}

/**
 * 创建跨平台的渲染器函数
 * @template ElementNode 平台的真实元素节点类型
 * @template TextNode 平台的真实文本节点类型
 * @template CommentNode 平台的真实注释节点类型
 * @template ChildNode 平台的真实的 ChildNode 类型
 */
function createRenderer<ElementNode, TextNode, CommentNode, ChildNode>(
  options: CreateRendererOptions<ElementNode, TextNode, CommentNode, ChildNode>
) {
  /** 虚拟节点 */
  type CreateRendererVnode = Vnode<ElementNode, TextNode, CommentNode>
  /** 容器 */
  type CreateRendererContainer = Container<ElementNode, TextNode, CommentNode>
  /** 元素虚拟节点 */
  type CreateRendererElementVnode = ElementVnode<ElementNode, TextNode, CommentNode>
  /** 文本虚拟节点 */
  type CreateRendererTextVnode = TextVnode<TextNode>
  /** 注释虚拟节点 */
  type CreateRendererCommentVnode = CommentVnode<CommentNode>
  /** Fragment 虚拟节点 */
  type CreateRendererFragmentVnode = FragmentVnode<ElementNode, TextNode, CommentNode>

  const {
    createElement,
    createText,
    createComment,
    setElementText,
    setTextText,
    setCommentText,
    insert,
    remove,
    patchProps,
    nextSibling,
    firstChild,
  } = options

  /**
   * 挂载元素节点
   * @param vnode 元素虚拟节点
   * @param container 挂载容器
   * @param anchor 锚点节点
   */
  function mountElement(
    vnode: CreateRendererElementVnode,
    container: CreateRendererContainer,
    anchor?: ChildNode | null
  ) {
    const el = (vnode.el = createElement(vnode.type))
    if (typeof vnode.children === 'string') {
      setElementText(el, vnode.children)
    } else if (Array.isArray(vnode.children)) {
      vnode.children.forEach((child) => {
        patch(null, child, el as CreateRendererContainer)
      })
    }

    if (vnode.props) {
      for (const key in vnode.props) {
        patchProps(el, key, null, vnode.props[key])
      }
    }

    insert(el, container, anchor)
  }

  /**
   * 更新元素节点
   * @param n1 旧的元素虚拟节点
   * @param n2 新的元素虚拟节点
   */
  function patchElement(n1: CreateRendererElementVnode, n2: CreateRendererElementVnode) {
    const el = (n2.el = n1.el) as ElementNode
    const oldProps = n1.props || {}
    const newProps = n2.props || {}

    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProps(el, key, oldProps[key], newProps[key])
      }
    }
    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProps(el, key, oldProps[key], null)
      }
    }

    patchChildren(n1, n2, el as CreateRendererContainer)
  }

  /**
   * 更新元素或 Fragment 的子节点
   * @param n1 旧的元素或 Fragment 虚拟节点
   * @param n2 新的元素或 Fragment 虚拟节点
   * @param container 挂载容器
   */
  function patchChildren(
    n1: CreateRendererElementVnode | CreateRendererFragmentVnode,
    n2: CreateRendererElementVnode | CreateRendererFragmentVnode,
    container: CreateRendererContainer
  ) {
    if (typeof n2.children === 'string') {
      if (Array.isArray(n1.children)) {
        n1.children.forEach((c) => unmount(c, container))
      }
      setElementText(container, n2.children)
    } else if (Array.isArray(n2.children)) {
      if (Array.isArray(n1.children)) {
        // 封装 patchKeyedChildren 函数处理新旧两组子节点
        patchKeyedChildren(n1, n2, container)
      } else {
        setElementText(container, '')
        n2.children.forEach((c) => patch(null, c, container))
      }
    } else {
      if (Array.isArray(n1.children)) {
        n1.children.forEach((c) => unmount(c, container))
      } else if (typeof n1.children === 'string') {
        setElementText(container, '')
      }
    }
  }

  /**
   * 更新新旧两组子节点的可复用的节点
   * @param n1 旧的元素或 Fragment 虚拟节点
   * @param n2 新的元素或 Fragment 虚拟节点
   * @param container 挂载容器
   */
  function patchKeyedChildren(
    n1: CreateRendererElementVnode | CreateRendererFragmentVnode,
    n2: CreateRendererElementVnode | CreateRendererFragmentVnode,
    container: CreateRendererContainer
  ) {
    const oldChildren = n1.children as CreateRendererVnode[]
    const newChildren = n2.children as CreateRendererVnode[]
    // 四个索引值
    let oldStartIdx = 0
    let oldEndIdx = oldChildren.length - 1
    let newStartIdx = 0
    let newEndIdx = newChildren.length - 1
    // 四个索引值指向的 vnode 节点
    let oldStartVnode = oldChildren[oldStartIdx]
    let oldEndVnode = oldChildren[oldEndIdx]
    let newStartVnode = newChildren[newStartIdx]
    let newEndVnode = newChildren[newEndIdx]

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      // 第一步：oldStartVnode 和 newStartVnode 比较
      if (oldStartVnode.key === newStartVnode.key) {
        // 调用 patch 函数，在 oldStartVnode 和 newStartVnode 之间更新内容
        patch(oldStartVnode, newStartVnode, container)
        // 更新相关索引，指向下一个位置
        oldStartVnode = oldChildren[++oldStartIdx]
        newStartVnode = newChildren[++newStartIdx]
      }
      // 第二步：oldEndVnode 和 newEndVnode 比较
      else if (oldEndVnode.key === newEndVnode.key) {
        // 调用 patch 函数，在 oldEndVnode 和 newEndVnode 之间更新内容
        patch(oldEndVnode, newEndVnode, container)
        // 更新相关索引，指向下一个位置
        oldEndVnode = oldChildren[--oldEndIdx]
        newEndVnode = newChildren[--newEndIdx]
      }
      // 第三步：oldStartVnode 和 newEndVnode 比较
      else if (oldStartVnode.key === newEndVnode.key) {
        // 调用 patch 函数，在 oldStartVnode 和 newEndVnode 之间更新内容
        patch(oldStartVnode, newEndVnode, container)
        // 调用 insert 函数，移动 DOM 操作，更新位置
        insert(oldStartVnode.el!, container, nextSibling(oldEndVnode.el!))
        // 更新相关索引，指向下一个位置
        oldStartVnode = oldChildren[++oldStartIdx]
        newEndVnode = newChildren[--newEndIdx]
      }
      // 第四步：oldEndVnode 和 newStartVnode 比较
      else if (oldEndVnode.key === newStartVnode.key) {
        // 调用 patch 函数，在 oldEndVnode 和 newStartVnode 之间更新内容
        patch(oldEndVnode, newStartVnode, container)
        // 调用 insert 函数，移动 DOM 操作，更新位置
        insert(oldEndVnode.el!, container, oldStartVnode.el as ChildNode)
        // 更新相关索引，指向下一个位置
        oldEndVnode = oldChildren[--oldEndIdx]
        newStartVnode = newChildren[++newStartIdx]
      }
    }
  }

  /**
   * 挂载文本节点
   * @param vnode 文本虚拟节点
   * @param container 挂载容器
   */
  function mountText(vnode: CreateRendererTextVnode, container: CreateRendererContainer) {
    const el = (vnode.el = createText(vnode.children || ''))
    insert(el, container)
  }

  /**
   * 更新文本节点
   * @param n1 旧的文本虚拟节点
   * @param n2 新的文本虚拟节点
   */
  function patchText(n1: CreateRendererTextVnode, n2: CreateRendererTextVnode) {
    const el = (n2.el = n1.el) as TextNode
    if (n2.children !== n1.children) {
      setTextText(el, n2.children || '')
    }
  }

  /**
   * 挂载注释节点
   * @param vnode 注释虚拟节点
   * @param container 挂载容器
   */
  function mountComment(vnode: CreateRendererCommentVnode, container: CreateRendererContainer) {
    const el = (vnode.el = createComment(vnode.children || ''))
    insert(el, container)
  }

  /**
   * 更新注释节点
   * @param n1 旧的注释虚拟节点
   * @param n2 新的注释虚拟节点
   */
  function patchComment(n1: CreateRendererCommentVnode, n2: CreateRendererCommentVnode) {
    const el = (n2.el = n1.el) as CommentNode
    if (n2.children !== n1.children) {
      setCommentText(el, n2.children || '')
    }
  }

  /**
   * 挂载 Fragment
   * @param vnode Fragment 虚拟节点
   * @param container 挂载容器
   */
  function mountFragment(vnode: CreateRendererFragmentVnode, container: CreateRendererContainer) {
    vnode.children?.forEach((c) => patch(null, c, container))
  }

  /**
   * 更新 Fragment
   * @param n1 旧的 Fragment 虚拟节点
   * @param n2 新的 Fragment 虚拟节点
   */
  function patchFragment(
    n1: CreateRendererFragmentVnode,
    n2: CreateRendererFragmentVnode,
    container: CreateRendererContainer
  ) {
    patchChildren(n1, n2, container)
  }

  /**
   * 更新操作、挂载操作
   * @param n1 旧的虚拟节点、null、undefined
   * @param n2 新的虚拟节点
   * @param container 挂载容器
   * @param anchor 锚点节点
   */
  function patch(
    n1: CreateRendererVnode | null | undefined,
    n2: CreateRendererVnode,
    container: CreateRendererContainer,
    anchor?: ChildNode | null
  ) {
    if (n1 && n1.type !== n2.type) {
      unmount(n1, container)
      n1 = null
    }

    const { type } = n2
    if (typeof type === 'string') {
      if (!n1) {
        mountElement(n2, container, anchor)
      } else {
        patchElement(n1 as CreateRendererElementVnode, n2)
      }
    } else if (type === VnodeTypeEnum.TEXT) {
      if (!n1) {
        mountText(n2, container)
      } else {
        patchText(n1 as CreateRendererTextVnode, n2)
      }
    } else if (type === VnodeTypeEnum.COMMENT) {
      if (!n1) {
        mountComment(n2, container)
      } else {
        patchComment(n1 as CreateRendererCommentVnode, n2)
      }
    } else if (type === VnodeTypeEnum.FRAGMENT) {
      if (!n1) {
        mountFragment(n2, container)
      } else {
        patchFragment(n1 as CreateRendererFragmentVnode, n2, container)
      }
    }
  }

  /**
   * 卸载操作
   * @param vnode 虚拟节点
   * @param container 挂载容器
   */
  function unmount(vnode: CreateRendererVnode, container: CreateRendererContainer) {
    if (vnode.type === VnodeTypeEnum.FRAGMENT) {
      vnode.children?.forEach((c) => unmount(c, container))
    } else {
      remove(vnode.el!)
    }
  }

  /**
   * 挂载操作、更新操作、卸载操作
   * @param vnode 虚拟节点、null
   * @param container 挂载容器
   */
  function render(vnode: CreateRendererVnode | null, container: CreateRendererContainer) {
    if (vnode) {
      patch(container._vnode, vnode, container)
    } else {
      if (container._vnode) {
        unmount(container._vnode, container)
      }
    }

    container._vnode = vnode
  }

  return {
    render,
  }
}

// -------------------- 测试 --------------------
/**
 * 是否应该作为 DOM Properties 设置
 * @param el 元素节点
 * @param key 属性键
 * @param value 属性值
 */
function shouldSetAsProps(el: ExtendedHTMLElement, key: string, value: any) {
  if (key === 'form' && el.tagName === 'INPUT') return false
  return key in el
}

/**
 * 扩展 HTMLElement
 */
interface ExtendedHTMLElement extends HTMLElement {
  /** 事件名到伪造的事件处理函数的映射对象 */
  _vei?: {
    [key: string]: {
      /** 伪造的事件处理函数 */
      (e: Event): void
      /** 真正的事件处理函数 */
      value: (e: Event) => void
      /** 事件处理函数绑定的时间 */
      attached: number
    }
  }
}

const renderer = createRenderer<ExtendedHTMLElement, Text, Comment, ChildNode>({
  createElement(tag) {
    return document.createElement(tag)
  },
  createText(text) {
    return document.createTextNode(text)
  },
  createComment(text) {
    return document.createComment(text)
  },
  setElementText(el, text) {
    el.textContent = text
  },
  setTextText(el, text) {
    el.nodeValue = text
  },
  setCommentText(el, text) {
    el.nodeValue = text
  },
  insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor)
  },
  remove(el) {
    const parent = el.parentNode
    if (parent) {
      parent.removeChild(el)
    }
  },
  patchProps(el, key, prevValue, nextValue) {
    if (/^on/.test(key)) {
      const invokers = el._vei || (el._vei = {})
      let invoker = invokers[key]
      const name = key.slice(2).toLocaleLowerCase()

      if (nextValue) {
        if (!invoker) {
          const eventHandler = (e: Event) => {
            if (!invoker) return
            if (e.timeStamp < invoker.attached) return
            if (Array.isArray(invoker.value)) {
              invoker.value.forEach((fn) => fn(e))
            } else {
              invoker.value(e)
            }
          }
          eventHandler.value = nextValue
          eventHandler.attached = performance.now()
          invoker = el._vei[key] = eventHandler
          el.addEventListener(name, invoker)
        } else {
          invoker.value = nextValue
        }
      } else if (invoker) {
        el.removeEventListener(name, invoker)
      }
    } else if (key === 'class') {
      el.className = nextValue || ''
    } else if (shouldSetAsProps(el, key, nextValue)) {
      const type = typeof el[key]
      if (type === 'boolean' && nextValue === '') {
        el[key] = true
      } else {
        el[key] = nextValue
      }
    } else {
      el.setAttribute(key, nextValue)
    }
  },
  nextSibling(el) {
    return el.nextSibling
  },
  firstChild(el) {
    return el.firstChild
  },
})

export default {}
