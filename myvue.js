function genVnode(tmpl) {
    const stack = []
    let word = ''
    for (let i = 0; i < tmpl.length; i += 1) {
        const char = tmpl[i]
        if (char === '>') {
            word += char
            word = word.trim()
            if (word) {
                // 如果 trim 后为空白，直接跳过
                const tagName = word.slice(1, -1).split(' ')[0] // 还需要考虑有attr的情况
                if (tagName[0] === '/') {
                    // 如果是个结束标签
                    const endTag = tagName.slice(1)
                    let node = {
                        tagName: endTag,
                        children: [],
                        attributes: {}
                    }
                    while (stack.length) {
                        const tag = stack.pop()
                        if (typeof tag === 'string' && tag.slice(1, -1).split(' ')[0].trim() === endTag.trim()) {
                            // 找到了对应的开始标签，解析 attributes
                            node = parseAttributes(node, tag)
                                // 完成
                            break
                        } else {
                            // 注意标签的顺序
                            node.children.unshift(tag)
                        }
                    }

                    if (getType(node) === 'Array') {
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
            if (word.trim()) {
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
    for (const char of tag) {
        if (char === ' ') {
            // 出现空白
            if (inQuotes) {
                // 刚刚出现一个没匹配的引号，那不管这个空格
                attr += char
            } else {
                // 过滤掉空的 attr
                attr.trim() && attributes.push(attr.trim())
                attr = '' // 清空
            }
        } else {
            attr += char
            if (char === '"') { // 遇到 " 符号，切换 inQuotes 状态
                inQuotes = !inQuotes
            }
        }
    }
    // 存入最后一个结果
    attr.trim() && attributes.push(attr.trim())
        // 将 attributes 列表存入 node.attributes 属性中
    for (const attr of attributes) {
        if (attr.indexOf('=') === -1) continue
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
    if (getType(vnode) === 'Array') {
        realDom = []
        for (const item of vnode) {
            realDom.push(createRealDom(item))
        }
    } else {
        // 加入 v-for 指令后，这里可能返回一个列表
        realDom = createOneNode(vnode)
        if (vnode.children) {
            // children 返回的是一个列表
            const childlist = createRealDom(vnode.children)
            for (const child of childlist) {
                realDom.appendChild(child)
            }
        }
    }
    return realDom
}

function createOneNode(vnode) {
    // 如果是文本节点，可能没有 tag

    const tag = vnode.tagName
    if (tag) {
        const node = document.createElement(tag)
            // 将 class 加上
        if (vnode.attributes && vnode.attributes.class) {
            node.classList.add(vnode.attributes.class.slice(1, -1))
        }
        // 将 style 加上
        if (vnode.attributes && vnode.attributes.style) {
            node.style.cssText += vnode.attributes.style.slice(1, -1)
        }

        // 将 事件监听 加上
        if (vnode.attributes) {
            for (const key in vnode.attributes) {
                const val = vnode.attributes[key];
                if (key[0] === '@') {
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

    // 就是将会读取变量的函数（会产生副作用的函数）包装一下
    effect(() => {
        const replaced = matchMustache(vnode)
        node.nodeValue = replaced
    })

    return node
}

function matchMustache(w) {
    // 匹配每一对 {{}}，并将其中的字符作为 key，匹配并替换 data 中对应 key 的值
    // /\{\{(.*)\}\}/g 这个不行！
    let word = w
    const exp = /\{\{(.+?)\}\}/g
    const matchs = word.match(exp) ?? []
        // 然后还是用正则的替换咯？
    for (const match of matchs) {
        const key = match.slice(2, -2).trim()

        // 使 mustache 支持表达式，点操作
        function getVal() {
            let res = new Function(`with(data) { return ${key}}`)()
            if (typeof res === 'object') {
                res = JSON.stringify(res)
            }
            return res
        }
        const value = getVal()

        word = word.replace(match, value)
    }
    return word
}

// 响应式原理
function reactiveData(rawData) {
    // 递归地将数据转化为响应式
    const handler = {
        get(obj, property) {
            track(obj, property)
            return obj[property]
        },
        set(obj, property, value) {
            // 通知之前收集的所有依赖：更新一下相关的值啦！
            obj[property] = value
            trigger(obj, property)
            return true
        }
    }

    function deepProxy(data) {
        const newData = new Proxy(data, handler)
        for (const key in newData) {
            const val = newData[key]
            if (typeof val === 'object') {
                newData[key] = deepProxy(newData[key])
            }
        }
        return newData
    }
    return deepProxy(rawData)
}

let activeEffect = '' // 感觉是个闭包

function cleanup(effectFn) {
    for(const deps of effectFn.deps) {
        // 将自己移除
        deps.delete(effectFn)
    }
    // 最后将自己已知的[被添加进去的列表]的列表清空
    effectFn.deps.length = 0
}

function effect(fn, options = {}) {
    const effectFn = ()=> {
        cleanup(effectFn)
        // 新建一个函数effectFn，并初始化属性deps，用来存储所有包含当前副作用函数的依赖的集合
        activeEffect = effectFn
        effectStack.push(effectFn)
        const res = fn.call(data)
        effectStack.pop()
        activeEffect = effectStack[effectStack.length - 1]
        return res
    }
    effectFn.deps = []
    effectFn.options = options
    if(!options.lazy) {
        effectFn()
    }
    return effectFn
}

function track(obj, property) {
    if (typeof property === 'string' && activeEffect) {
        // 为什么是跟 obj 关联的呢
        // 这样就解决了点操作符的问题！
        let depsMap = bucket.get(obj)
        if (!depsMap) {
            bucket.set(obj, (depsMap = new Map()))
        }

        let depsSet = depsMap.get(property)
        if (!depsSet) {
            depsMap.set(property, (depsSet = new Set()))
        }

        // 和这个对象的这个 property 有关系的 fn 就被添加到依赖中了
        depsSet.add(activeEffect)
        activeEffect.deps.push(depsSet)
    }
}

function trigger(obj, property) {
    const depsMap = bucket.get(obj)
    if (depsMap) {
        // 这个对象有被追踪过
        const depsSet = depsMap.get(property)

        // 因为fn执行的时候会把自己从依赖函数列表中删除，并且因为依赖调用而被重新添加到新的有依赖的集合中
        const effectsToRun = new Set()
        depsSet && depsSet.forEach((fn) => {
            // 防止当前执行 set 的与执行 get 的是同一个函数，会导致死循环
            if(fn !== activeEffect) {
                effectsToRun.add(fn)
            }
        })
        effectsToRun && effectsToRun.forEach(fn => {
            // 如果有调度器
            if(fn.options.scheduler) {
                fn.options.scheduler(fn)
            } else {
                fn()
            }
        }) // 执行其中的函数
    }
}

function computed(getter) {
    let value;
    let dirty = true
    const effectFn = effect(getter, {
        lazy: true,
        scheduler() {
            dirty = true
            // 为什么可以在定义前引用?
            trigger(obj, 'value')
        }
    })
    const obj = {
        get value() {
            if(dirty) {
                value = effectFn()
            }
            track(obj, 'value')
            return value
        }
    }
    return obj
}

function traverse(source, seen = new Set()) {
    if(getType(source) !== 'Object' || source === null || seen.has(source)) return
    for(const key in source) {
        seen.add(source[key])
        traverse(source[key], seen)
        console.log(source, key)
    }
}

function watch(source, cb) {
    let oldVal, newVal
    let getter

    // 使得每个字段都被访问
    if(getType(source) === 'Function') {
        getter = source
    } else {
        getter = () => traverse(source)
    }
    const effectFn = effect(() => {
        return getter()
    },{
        lazy: true,
        scheduler() {
            newVal = effectFn()
            cb(oldVal, newVal)
            oldVal = newVal
        }
    })

    oldVal = effectFn()
}

let data = undefined
let methods = undefined
const bucket = new WeakMap() // 用于存放依赖的对象
const domTargetMap = new Map()
const effectStack = []

function myVue(options) {
    // 转成全局变量只是为了便于获取，减少代码量
    data = reactiveData(options.data())
    methods = options.methods
    this.data = data

    // 处理计算属性
    let computedData = options.computed
    if(computedData) {
        const fnKeys = Object.keys(computedData)
        for(const key of fnKeys) {
            data[key] = computed(computedData[key])
        }

    }
    // 处理 watch 属性
    let watchData = options.watch
    if(watchData) {
        const fnKeys = Object.keys(watchData)
        for(const key of fnKeys) {
            watch(()=> {
                // 访问对应的属性
               return data[key]
            }, watchData[key])
        }
    }

    // 获取模板，编译为虚拟 dom
    const tmpl = options.template[0] === '#' ? document.querySelector(options.template).innerHTML : options.template
    // 把html字符串转化虚拟dom
    const vnode = genVnode(tmpl)
    // 使用虚拟dom创建真实dom树
    const fragment = document.createDocumentFragment() // fragment用来接收所有的结果，之后统一挂载到应用根节点上
    const realDom = createRealDom(vnode)
    fragment.appendChild(realDom)

    // 将 fragment 挂载到 app 节点上
    const app = document.querySelector(options.el || '#app')
    app.appendChild(fragment)
    // 调用 mounted 钩子
    if(typeof options.mounted === 'function') {
      options.mounted.apply(data)
    }
    
}