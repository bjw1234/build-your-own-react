// const element = (
//   <div id="foo">
//     <a href="https://www.baidu.com">bar</a>
//     <hr />
//   </div>
// );

// jsx 会被转换为 React.createElement 调用
// React.createElement 接收三个参数：type, props, children

// const element = React.createElement(
//   "div",
//   {
//     id: "foo"
//   },
//   React.createElement("a", { href: "https://www.baidu.com" }, "bar"),
//   React.createElement("hr")
// );

function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object"
          ? child // 创建文本节点
          : createTextElement(child)
      )
    }
  };
}

function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: []
    }
  };
}

function createDom(fiber) {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);
  // const isProperty = (key) => key !== "children";
  // Object.keys(fiber.props)
  //   .filter(isProperty)
  //   .forEach((key) => {
  //     dom[key] = fiber.props[key];
  //   });
  updateDom(dom, {}, fiber.props);

  return dom;
}

// 渲染函数
// element 是具有 type props 的对象
function render(element, container) {
  // 初始的任务，创建根 fiber 节点
  wipRoot = {
    dom: container,
    props: {
      children: [element]
    },
    // 指向上次更新的 fiber 节点
    alternate: currentRoot
  };
  nextUnitOfWork = wipRoot;
  deletions = [];
}

// 超过这个时间，如果任务还未执行则强制执行
const options = { timeout: 50 };
let nextUnitOfWork = null;
// work in progress 节点，表示正在循环更新节点，根 fiber 节点
let wipRoot = null;
// 上次我们更新到DOM中的fiber树
let currentRoot = null;
// 记录删除的数组
let deletions = [];

function workLoop(deadline) {
  let shouldYield = false;
  // 工作单元存在 并且 存在剩余时间 则不断执行工作单元
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  // 一次性提交
  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }
  requestIdleCallback(workLoop, options);
}

// 不断的利用剩余时间去执行 workLoop
requestIdleCallback(workLoop, options);

function performUnitOfWork(fiber) {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    if (!fiber.dom) {
      fiber.dom = createDom(fiber);
    }
    const elements = fiber.props.children;
    // 协调过程 - 每一个fiber节点都需要调和
    reconncileChildren(fiber, elements);
  }
  // 之所以删除，是因为不想让用户看到不完整的UI，当完成渲染后统一提交
  // if (fiber.parent) {
  //   fiber.parent.dom.appendChild(fiber.dom);
  // }

  // TODO return next unit of work
  // 先是子节点
  // 然后是兄弟节点
  // 最后是父节点的兄弟节点
  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}

let wipFiber = null;
let hookIndex = 0;

function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];
  // 注意这里必须为一个数组
  const children = [fiber.type(fiber.props)];
  reconncileChildren(fiber, children);
}

function reconncileChildren(fiber, elements) {
  let index = 0;
  let prevSibling = null;
  // 如果 mount 时，oldFiber 为 null
  let oldFiber = fiber.alternate?.child;
  // elemnets
  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    // const newFiber = {
    //   type: element.type,
    //   props: element.props,
    //   dom: null,
    //   parent: fiber
    // };
    let newFiber = null;
    const sameType = oldFiber?.type === element?.type;
    if (sameType) {
      // update the node
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: fiber,
        alternate: oldFiber,
        effectTag: "UPDATE"
      };
    }
    if (element && !sameType) {
      // add this node
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: fiber,
        alternate: null,
        effectTag: "PLACEMENT"
      };
    }
    if (oldFiber && !sameType) {
      // delete oldFiber's node
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }

    // 添加
    if (oldFiber) {
      // 去到下一个兄弟节点
      oldFiber = oldFiber.sibling;
    }

    if (index === 0) {
      // 子节点
      fiber.child = newFiber;
    } else {
      // 前一个节点的兄弟节点
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}

function commitRoot() {
  // 删除节点操作
  deletions.forEach(commitWork);

  commitWork(wipRoot.child);
  // 添加 currentRoot
  currentRoot = wipRoot;
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) return;

  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
  }

  // 递归提交
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent);
  }
}

function updateDom(dom, prevProps, nextProps) {
  const isEvent = (key) => key.startsWith("on");
  const isProperty = (key) => key !== "children" && !isEvent(key);
  const isNew = (prev, next) => (key) => prev[key] !== next[key];
  const isGone = (next) => (key) => !(key in next);

  // 移除或者更改eventListener
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => isGone(nextProps)(key) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // 设置或更改属性
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => (dom[name] = nextProps[name]));

  // 添加事件监听
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}

function useState(initial) {
  const oldHook = wipFiber.alternate?.hooks?.[hookIndex];
  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: []
  };

  // 执行 actions，更新state
  const actions = oldHook ? oldHook.queue : [];
  actions.forEach((action) => {
    hook.state = action(hook.state);
  });

  const setState = (action) => {
    hook.queue.push(action);
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot
    };
    nextUnitOfWork = wipRoot;
    deletions = [];
  };
  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}

const Didact = {
  createElement,
  render,
  useState
};

const rootElement = document.getElementById("root");

/** @jsx Didact.createElement */
// -----1------
// const element = (
//   <div id="foo">
//     <a href="https://www.baidu.com">bar</a>
//     <div>bjw--hello work</div>
//   </div>
// );

// Didact.render(element, rootElement);

// -----2------
// const updateValue = (e) => {
//   rerender(e.target.value);
// };

// const rerender = (value) => {
//   const element = (
//     <div>
//       <input onInput={updateValue} value={value} />
//       <h2>Hello {value}</h2>
//     </div>
//   );
//   Didact.render(element, rootElement);
// };

// rerender("World");

// -----3------
// const App = function (props) {
//   return <h1>hello {props.name}</h1>;
// };

// Didact.render(<App name="jake" />, rootElement);

function Counter(props) {
  const [count, setCount] = Didact.useState(1);
  return (
    <h1>
      <button onClick={() => setCount((c) => c + 1)}>点击</button>
      <br />
      Count: {count}
      <div>hello {props.name}</div>
    </h1>
  );
}

const element = <Counter name="world" />;

Didact.render(element, rootElement);
