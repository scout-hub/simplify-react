/*
 * @Author: Zhouqi
 * @Date: 2022-05-16 19:59:04
 * @LastEditors: Zhouqi
 * @LastEditTime: 2022-06-14 14:51:50
 */
import { createContainer } from "packages/react-reconciler/src/ReactFiberReconciler";
import { updateContainer } from "packages/react-reconciler/src/ReactFiberReconciler";
import { ConcurrentRoot } from "packages/react-reconciler/src/ReactRootTags";
import { listenToAllSupportedEvents } from "../events/DOMPluginEventSystem";

export function createRoot(container) {
  // 创建根容器
  const root = createContainer(container, ConcurrentRoot);
  // 开启事件委托，监听root上所有的事件
  listenToAllSupportedEvents(container)
  return new ReactDOMRoot(root);
}

class ReactDOMRoot {
  public _internalRoot;
  constructor(internalRoot) {
    this._internalRoot = internalRoot;
  }

  // 通过ReactDOM.render将jsx渲染到页面上
  render(children) {
    const root = this._internalRoot;
    updateContainer(children, root);
  }
}
