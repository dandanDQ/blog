      // 看网上的模板编译方法：词法分析，句法分析
      function genVnode(tmpl) {
        console.log(tmpl)
        const stack = []
        // 左标签 <header> 右标签 </header>
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
                    // debug: 增加 trim 操作
                    // 找到了对应的开始标签，解析 attributes
                    // 如果是 v-for 可能产生多个节点，返回的是一个 array
                    // 先不处理指令
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
        console.log(stack)
        return stack[0] // 因为返回的是一个列表。根据 vue 模板只有一个根节点的要求，返回第一个节点即可
      }

      function parseAttributes(node, rawTag) {
        const tag = rawTag.slice(1, -1)

        // 不能使用空格作为分割符
        // 忽略双引号内的空格 quetos
        // const attributes = tag.slice(1, -1).split(' ').slice(1).filter((attr) => attr.trim())

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
              
              inQuotes = false
              attr = '' // 清空
            }
          } else {
            attr += char
            if(char === '"') {
              inQuotes = !inQuotes
            }
            
          }
        }
        // 存入最后一个结果
        attr.trim() && attributes.push(attr.trim())
        
        for(const attr of attributes) {
          if(attr.indexOf('=') === -1) continue
          const key = attr.split('=')[0]
          const val = attr.split('=')[1]
          node.attributes[key] = val

          switch (key) {
            case 'v-for2': {   
              // transformFor()
              // v-for 节点，就是要根据数据克隆出一样的节点，而且还需要把数据填入

              const nodeList = []
              const [name, op, arrName] = val.slice(1, -1).split(' ').filter( v => v.trim())
              const arr = new Function(`with(data) { return ${arrName} }`)()

              function processChild(children, before, after) {
                console.log(children)
                for(let i = 0; i < children.length; i += 1) {
                  const child = children[i]
                  if(typeof child === 'string') {
                    if(child.indexOf(before) > -1) {
                      children[i] = child.replace(before, after)
                    }
                  } else {
                    if(child.children) {
                      processChild(child.children, before, after)
                    }
                  }
                }
              }


              for(const idx in arr) {
                const replacedNode = JSON.parse(JSON.stringify(node))
                // 处理可能存在的 mustache 语法
                if(replacedNode.children) {
                  const children = replacedNode.children
                  for(let i = 0; i < children.length; i += 1) {
                  const child = children[i]
                  if(typeof child === 'string') {
                    if(child.indexOf(name) > -1) {
                      children[i] = child.replace(name, `${arrName}[${idx}]`)
                    }
                  } else {
                    if(child.children) {
                      processChild(child.children, name, `${arrName}[${idx}]`)
                    }
                  }
                }
                }
                nodeList.push(replacedNode)
              }

              return nodeList

              // 需要把 name 转换为 objName[0] 这样  以及将{{}}里的内容替换
              break;
            }
            case ':class': {
              // 动态 class
              console.log('动态class', key, val)
              break;
            }
          }
        }


        return node
      }

      function transform(key) {
        // 转换指令
        // 也是跟 data 绑定的，数据发生变化，需要相应产生变化
        // 应该在哪里处理 attributes 呢

      }

      function matchMustache(w, data, realDom, track) {
        // 匹配每一对 {{}}，并将其中的字符作为 key，匹配并替换 data 中对应 key 的值
        // /\{\{(.*)\}\}/g 这个不行！
        let word = w
        const exp = /\{\{(.+?)\}\}/g
        const matchs = word.match(exp) ?? []
        // 然后还是用正则的替换咯？
        for(const match of matchs) {
          const key = match.slice(2,-2).trim()
          // 需要收集依赖，当 key 对应的值更新时，调用 diff 算法更新 dom
  
          // 有个问题，为什么不在数据层面，即data层面去追踪变化&更新渲染，而要在html层级上去做很多繁琐的比较呢
          // data 如果能跟 dom 直接匹配，会方便很多。也就是需要存下 data -> dom 的哈希表 ？

          if(track) {
            realDomTarget = realDom
            wTarget = w
          }


          // 使 mustache 支持表达式，点操作
          function getVal(){
            // with(data) {
            //   console.log(key, 'key是什么啦')
            //   const res = new Function(`with(data) { return ${key}}`)()
            //   console.log('试试这个呢', res)
            //   return eval(key)
            // }    

            let res = new Function(`with(data) { return ${key}}`)()
            if(typeof res === 'object'){
              res = JSON.stringify(res)
            }
            return res
          }

          const value = getVal()


          if(track) {
            // 全局变量归位
            realDomTarget = null
            wTarget = ''
          }


          word = word.replace(match, value)
        }
        // console.log(word)
        return word
      }
  
      // 根据 vnode 进行渲染
      function getType(target) {
        return Object.prototype.toString.call(target).slice(8, -1)
      }
  
      function createOneNode (vnode, track = true) {
        // 如果是文本节点，可能是空的
        const tag = vnode.tagName

        if(tag) {
          const node = document.createElement(tag)

          // 将 class 加上
          if(vnode.attributes && vnode.attributes.class) {
            node.classList.add(vnode.attributes.class.slice(1, -1))
          }
          // 将 style 加上
          if(vnode.attributes && vnode.attributes.style) {
            // 啊啊啊啊啊啊啊啊多了双引号！！！！
            node.style.cssText += vnode.attributes.style.slice(1, -1)
            // node.style.setAttribute("style", vnode.attributes.style)
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
        // 文本节点，可能涉及到 mustache 转换了
        // 如果在这里转化 mustache 语法，会不会更好收集依赖
        
        const replaced = matchMustache(vnode, data, node, track)
        node.nodeValue = replaced
        return node
      }
  
      function createRealDom(vnode) {
        // 可能是对象，也可能是数组
        let realDom = undefined
        if(getType(vnode) === 'Array') {
          // console.log('数组')
          realDom = []
          for(const item of vnode) {
            realDom.push(createRealDom(item))
          }
        } else {
          // console.log('对象或文本')
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

      let path = ''

      let realDomTarget = null
      let wTarget = ''
  
      function reactiveData(rawData) {
        // 将数据转化为响应式

        // proxy 只支持一层

        const handler = {
          get(obj, property, receiver) {
            // 在这里收集依赖，怎么知道是哪一方调用的呢，所以不在这里收集
            track(property)
            return obj[property]
          },
          set(obj, property, value) {

            // 通知之前收集的所有依赖：更新一下相关的值啦！
            if(!obj.hasOwnProperty(property)) {
              console.log(`没有${property}啦`)
            }
            obj[property] = value

            notify(property)
            return true
          }
        }

        function track(property) {
          if(typeof property === 'string' && realDomTarget) {
            
              if(!Dep[property]) {
                Dep[property] = []
              }
              // 使用 map 减少重复操作
              let target = domTargetMap.get(realDomTarget)
              console.log(target, '没拿到啊', domTargetMap)
              if(!target) {
                target = { w: wTarget,realDom: realDomTarget }
                domTargetMap.set(realDomTarget, target)
              }
              // 而且是没存储过的依赖
              if(Dep[property].indexOf(target) === -1) {
                Dep[property].push(target)
                console.log(Dep[property], Dep)
              }
          }
        }

        function notify(property) {
          if(Dep[property]) {
              const deps = Dep[property].slice()
              // Dep[property] = []
              // dom 和 data 是多对多的关系，更新一个，必须更新其他
  
              for(const dep of deps) {
                const oldNode = dep.realDom
                const newNode = createOneNode(dep.w, false) // 这里就不收集依赖了
  
                // 更新nodevalue
                oldNode.nodeValue = newNode.nodeValue
                // oldNode.parentNode.replaceChild(newNode, oldNode)

                // more：如果依赖被删除，需要移除对应的节点
              }
            }
        }





        const data = new Proxy(rawData, handler)

        function deepProxy(data) {
          for(const key in data) {
            const val = data[key]
            if(typeof val === 'object') {
              data[key] = new Proxy(val, handler)
              deepProxy(data[key])
            }
          }
        }

        deepProxy(data)


        return data
      }

  
      let data = undefined
      const Dep = {} // 用于存放依赖的对象
      const domTargetMap = new Map()
      class dep {
        constructor() {
          this.subs = []
        }
        addSub(sub) {
          this.subs.push(sub)
        }
        notify() {
          this.subs.forEach((sub) => {
            sub.update()
          })
        }
      }
  
      function myVue(options) { 
        data = reactiveData(options.data())
        methods = options.methods
        this.data = data
        // 获取模板，编译为虚拟 dom
        
        const tmpl = options.template[0] === '#' ?  document.querySelector(options.template).innerHTML : options.template
        const vnode = genVnode(tmpl) // 要把这些文本数据，转化并创建为真实的dom树，append到应用根节点上
        // 使用虚拟dom创建真实dom树
        const fragment = document.createDocumentFragment() // fragment用来接收所有的结果，之后统一挂载到应用根节点上
        const realDom = createRealDom(vnode) 
        fragment.appendChild(realDom)
  
        // 将 fragment 挂载到 app 节点上
        const app = document.querySelector(options.el || '#app')
        app.appendChild(fragment)
      }
  