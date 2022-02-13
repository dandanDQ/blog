function genVnode(tmpl) {
  const stack = []
  let word = ''
  for(let i = 0; i < tmpl.length; i += 1) {
    const char = tmpl[i]
    if (char === '>') {
      word += char
      word = word.trim()
      if(word) {
        // 如果 trim 后为空白，直接跳过
        const tagName = word.slice(1, -1).split(' ')[0] // 还需要考虑有attr的情况
        if(tagName[0] === '/') {
          // 如果是个结束标签
          const endTag = tagName.slice(1)
          let node = {
            tagName: endTag,
            children: [],
            attributes: {}
          }
          while(stack.length) {
            const tag = stack.pop()
            if(typeof tag === 'string' && tag.slice(1, -1).split(' ')[0].trim()  === endTag.trim()) {
              // 找到了对应的开始标签，解析 attributes
              node = parseAttributes(node, tag)
              // 完成
              break
            } else {
              // 注意标签的顺序
              node.children.unshift(tag)
            }
          }

          if(getType(node) === 'Array') {
            stack.push(...node)
          } else {
            stack.push(node)
          }
          
        } else {
          stack.push(word)
        }
      }
      word = ''
      // 那就结束一个标签啦
    } else if (char === '<') {
      if(word.trim()) {
        stack.push(word.trim())
      }
      // 把之前的内容压入栈中
      word = char
    } else {
      word += char
    }
  }
  return stack[0] // 因为返回的是一个列表。根据 vue 模板只有一个根节点的要求，返回第一个节点即可
}

function parseAttributes(node, rawTag) {
  const tag = rawTag.slice(1, -1)
  // 不能使用空格作为分割符，因为需要忽略双引号内的空格 quetos
  // 错误写法：const attributes = tag.slice(1, -1).split(' ').slice(1).filter((attr) => attr.trim())

  let inQuotes = false // 是否出现一个未闭合的引号
  let attr = ''
  const attributes = []
  for(const char of tag) {
    if(char === ' ') {
      // 出现空白
      if(inQuotes) {
        // 刚刚出现一个没匹配的引号，那不管这个空格
        attr += char
      } else {
        // 过滤掉空的 attr
        attr.trim() && attributes.push(attr.trim())
        attr = '' // 清空
      }
    } else {
      attr += char
      if(char === '"') { // 遇到 " 符号，切换 inQuotes 状态
        inQuotes = !inQuotes
      }
    }
  }
  // 存入最后一个结果
  attr.trim() && attributes.push(attr.trim())
  // 将 attributes 列表存入 node.attributes 属性中
  for(const attr of attributes) {
    if(attr.indexOf('=') === -1) continue
    const key = attr.split('=')[0]
    const val = attr.split('=')[1]
    node.attributes[key] = val
  }
  return node
}

function getType(target) {
  return Object.prototype.toString.call(target).slice(8, -1)
}

function createRealDom(vnode) {
  // 可能是对象，也可能是数组
  let realDom = undefined
  if(getType(vnode) === 'Array') {
    realDom = []
    for(const item of vnode) {
      realDom.push(createRealDom(item))
    }
  } else {
    // 加入 v-for 指令后，这里可能返回一个列表
    realDom = createOneNode(vnode)
    if(vnode.children) {
      // children 返回的是一个列表
      const childlist = createRealDom(vnode.children)
      for(const child of childlist) {
        realDom.appendChild(child)
      }
    }
  } 
  return realDom
}

function createOneNode (vnode) {
  // 如果是文本节点，可能没有 tag
  
  const tag = vnode.tagName
  if(tag) {
    const node = document.createElement(tag)
    // 将 class 加上
    if(vnode.attributes && vnode.attributes.class) {
      node.classList.add(vnode.attributes.class.slice(1, -1))
    }
    // 将 style 加上
    if(vnode.attributes && vnode.attributes.style) {
      node.style.cssText += vnode.attributes.style.slice(1, -1)
    }

    // 将 事件监听 加上
    if(vnode.attributes) {
      for(const key in vnode.attributes) {
        const val = vnode.attributes[key];
        if(key[0] === '@') {
          const handlerName = val.slice(1, -1)
          node.addEventListener(key.slice(1), function() {
            methods[handlerName].call(data)
          })
        }
      }
    }
    return node
  }

  const node = document.createTextNode(vnode)
  // 文本节点，可能涉及到 mustache 转换了;如果在这里转化 mustache 语法，会不会更好收集依赖
  
  realDomTarget = node
  wTarget = vnode

  const replaced = matchMustache(vnode)
  node.nodeValue = replaced

  // 全局变量归位
  realDomTarget = null
  wTarget = ''
  
  return node
}

function matchMustache(w) {
  // 匹配每一对 {{}}，并将其中的字符作为 key，匹配并替换 data 中对应 key 的值
  // /\{\{(.*)\}\}/g 这个不行！
  let word = w
  const exp = /\{\{(.+?)\}\}/g
  const matchs = word.match(exp) ?? []
  // 然后还是用正则的替换咯？
  for(const match of matchs) {
    const key = match.slice(2,-2).trim()

    // 使 mustache 支持表达式，点操作
    function getVal(){
      let res = new Function(`with(data) { return ${key}}`)()
      if(typeof res === 'object'){
        res = JSON.stringify(res)
      }
      return res
    }
    const value = getVal()

    word = word.replace(match, value)
  }
  return word
}

let realDomTarget = null
let wTarget = ''

function reactiveData(rawData) {
  // 递归地将数据转化为响应式
  const handler = {
    get(obj, property) {
      track(property)
      return obj[property]
    },
    set(obj, property, value) {
      // 通知之前收集的所有依赖：更新一下相关的值啦！
      obj[property] = value
      notify(property)
      return true
    }
  }

  function deepProxy(data) {
    const newData = new Proxy(data, handler)
    for(const key in newData) {
      const val = newData[key]
      if(typeof val === 'object') {
        newData[key] = deepProxy(newData[key])
      }
    }
    return newData
  }
  return deepProxy(rawData)
}

function track(property) {
  if(typeof property === 'string' && realDomTarget) {
      if(!Dep[property]) {
        Dep[property] = []
      }
      // 使用 map 减少重复操作
      let target = domTargetMap.get(realDomTarget)
      if(!target) {
        target = { w: wTarget,realDom: realDomTarget }
        domTargetMap.set(realDomTarget, target)
      }
      // 而且是没存储过的依赖
      if(Dep[property].indexOf(target) === -1) {
        Dep[property].push(target)
      }
  }
}

function notify(property) {
  if(Dep[property]) {
      const deps = Dep[property].slice()
      // Dep[property] = []
      for(const dep of deps) {
        const realDom = dep.realDom
        const replaced = matchMustache(dep.w)
        // 更新nodevalue
        realDom.nodeValue = replaced
      }
    }
}

let data = undefined
let methods = undefined
const Dep = {} // 用于存放依赖的对象
const domTargetMap = new Map()

function myVue(options) { 
  // 转成全局变量只是为了便于获取，减少代码量
  data = reactiveData(options.data())
  methods = options.methods
  this.data = data
  // 获取模板，编译为虚拟 dom
  const tmpl = options.template[0] === '#' ?  document.querySelector(options.template).innerHTML : options.template
  // 把html字符串转化虚拟dom
  const vnode = genVnode(tmpl)
  // 使用虚拟dom创建真实dom树
  const fragment = document.createDocumentFragment() // fragment用来接收所有的结果，之后统一挂载到应用根节点上
  const realDom = createRealDom(vnode) 
  fragment.appendChild(realDom)

  // 将 fragment 挂载到 app 节点上
  const app = document.querySelector(options.el || '#app')
  app.appendChild(fragment)
}
