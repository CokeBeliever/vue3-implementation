// -------------------- 挂载操作和更新操作 (patch) --------------------

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
 * 虚拟节点
 * @template ElementNode 真实元素节点类型
 * @template TextNode 真实文本节点类型
 * @template CommentNode 真实注释节点类型
 */
type Vnode<ElementNode, TextNode, CommentNode> =
  | ElementVnode<ElementNode, TextNode, CommentNode>
  | TextVnode<TextNode>
  | CommentVnode<CommentNode>

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
   * 设置元素节点的文本内容
   * @param el 元素节点
   * @param text 文本内容
   */
  setElementText: (el: ElementNode, text: string) => void

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

  const { createElement, setElementText, insert, remove } = options

  /**
   * 挂载元素节点
   * @param vnode 元素虚拟节点
   * @param container 挂载容器
   */
  function mountElement(vnode: CreateRendererElementVnode, container: CreateRendererContainer) {}

  /**
   * 更新元素节点
   * @param n1 旧的元素虚拟节点
   * @param n2 新的元素虚拟节点
   */
  function patchElement(n1: CreateRendererElementVnode, n2: CreateRendererElementVnode) {}

  /**
   * 挂载文本节点
   * @param vnode 文本虚拟节点
   * @param container 挂载容器
   */
  function mountText(vnode: CreateRendererTextVnode, container: CreateRendererContainer) {}

  /**
   * 更新文本节点
   * @param n1 旧的文本虚拟节点
   * @param n2 新的文本虚拟节点
   */
  function patchText(n1: CreateRendererTextVnode, n2: CreateRendererTextVnode) {}

  /**
   * 挂载注释节点
   * @param vnode 注释虚拟节点
   * @param container 挂载容器
   */
  function mountComment(vnode: CreateRendererCommentVnode, container: CreateRendererContainer) {}

  /**
   * 更新注释节点
   * @param n1 旧的注释虚拟节点
   * @param n2 新的注释虚拟节点
   */
  function patchComment(n1: CreateRendererCommentVnode, n2: CreateRendererCommentVnode) {}

  /**
   * 更新操作、挂载操作
   * @param n1 旧的虚拟节点、null、undefined
   * @param n2 新的虚拟节点
   * @param container 挂载容器
   */
  function patch(
    n1: CreateRendererVnode | null | undefined,
    n2: CreateRendererVnode,
    container: CreateRendererContainer
  ) {
    // 如果旧 vnode 的存在，并且新旧 vnode 是不同类型，那么卸载旧节点
    if (n1 && n1.type !== n2.type) {
      unmount(n1, container)
      n1 = null
    }

    const { type } = n2
    // 如果新 vnode 的类型是 string，则说明该 vnode 描述的是元素节点
    if (typeof type === 'string') {
      // 如果旧的 vnode 不存在，则进行挂载操作
      if (!n1) {
        mountElement(n2, container)
      }
      // 如果旧的 vnode 存在，则进行更新操作
      else {
        patchElement(n1 as CreateRendererElementVnode, n2)
      }
    }
    // 如果新 vnode 的类型是 VnodeTypeEnum.TEXT，则说明该 vnode 描述的是文本节点
    else if (type === VnodeTypeEnum.TEXT) {
      // 如果旧的 vnode 不存在，则进行挂载操作
      if (!n1) {
        mountText(n2, container)
      }
      // 如果旧的 vnode 存在，则进行更新操作
      else {
        patchText(n1 as CreateRendererTextVnode, n2)
      }
    }
    // 如果新 vnode 的类型是 VnodeTypeEnum.COMMENT，则说明该 vnode 描述的是注释节点
    else if (type === VnodeTypeEnum.COMMENT) {
      // 如果旧的 vnode 不存在，则进行挂载操作
      if (!n1) {
        mountComment(n2, container)
      }
      // 如果旧的 vnode 存在，则进行更新操作
      else {
        patchComment(n1 as CreateRendererCommentVnode, n2)
      }
    }
  }

  /**
   * 卸载操作
   * @param vnode 虚拟节点
   * @param container 挂载容器
   */
  function unmount(vnode: CreateRendererVnode, container: CreateRendererContainer) {
    remove(vnode.el!)
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
const renderer = createRenderer<HTMLElement, Text, Comment, ChildNode>({
  createElement(tag) {
    return document.createElement(tag)
  },
  setElementText(el, text) {
    el.textContent = text
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
})

export default {}
