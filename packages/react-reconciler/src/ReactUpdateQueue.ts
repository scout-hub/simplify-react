/*
 * @Author: Zhouqi
 * @Date: 2022-05-26 14:43:08
 * @LastEditors: Zhouqi
 * @LastEditTime: 2022-06-14 10:43:31
 */
import { assign } from "packages/shared/src";
import { Lane, Lanes, NoLanes } from "./ReactFiberLane";
import type { Fiber } from "./ReactInternalTypes";

export type Update<State> = {
  eventTime?: number; // 任务时间，通过performance.now()获取的毫秒数
  lane?: Lane; // 优先级
  tag: 0 | 1 | 2 | 3; // 更新类型 UpdateState | ReplaceState | ForceUpdate | CaptureUpdate
  payload: any; // 更新挂载的数据，不同类型组件挂载的数据不同。对于ClassComponent，payload为this.setState的第一个传参。对于HostRoot，payload为ReactDOM.render的第一个传参。
  callback: (() => {}) | null; // 更新的回调函数 commit layout子阶段中有使用
  next: Update<State> | null; // 连接其他update，构成一个链表
};

export type SharedQueue<State> = {
  pending: Update<State> | null; // 指向Update环状链表的最后一个Update
  lanes: Lanes;
};

export type UpdateQueue<State> = {
  baseState: State; // 本次更新前该Fiber节点的state，Update基于该state计算更新后的state
  // 本次更新前该Fiber节点已保存的Update。以链表形式存在，链表头为firstBaseUpdate，链表尾为lastBaseUpdate。
  firstBaseUpdate: Update<State> | null;
  lastBaseUpdate: Update<State> | null;
  // 触发更新时，产生的Update会保存在shared.pending中形成单向环状链表。当由Update计算state时这个环会被剪开并连接在lastBaseUpdate后面。
  shared: SharedQueue<State>;
  effects: Array<Update<State>> | null; // 数组。保存update.callback !== null的Update
};

export const UpdateState = 0;

/**
 *
 * @returns update的情况
 * 1、ReactDOM.render —— HostRoot
 * 2、this.setState —— ClassComponent
 * 3、this.forceUpdate —— ClassComponent
 * 4、useState —— FunctionComponent
 * 5、useReducer —— FunctionComponent
 */

/**
 * @description: 初始化当前fiber的updateQueue
 * @param fiber
 */
export function initializeUpdateQueue<State>(fiber: Fiber): void {
  const queue: UpdateQueue<State> = {
    baseState: fiber.memoizedState,
    firstBaseUpdate: null,
    lastBaseUpdate: null,
    shared: {
      pending: null,
      lanes: NoLanes,
    },
    effects: null,
  };
  // 保存到fiber的updateQueue中
  fiber.updateQueue = queue;
}

/**
 * @description: 创建Update，保存更新状态相关内容的对象
 * 注：每一个fiber可能都存在多个Update的情况，这些Update通过next连接形成链表并保存在fiber的updateQueue中，
 * 比如一个class component调用多次setState就会产生多个Update
 */
export function createUpdate(): Update<any> {
  const update: Update<any> = {
    eventTime: 0,
    payload: null,
    callback: null,
    next: null,
    tag: UpdateState,
  };
  return update;
}

/**
 * @description: 向当前fiber节点的updateQueue中添加Update
 */
export function enqueueUpdate(fiber, update) {
  const updateQueue = fiber.updateQueue;
  if (updateQueue === null) return;
  const sharedQueue = updateQueue.shared;
  const pending = sharedQueue.pending;
  // 构建循环链表
  if (pending === null) {
    // 这是第一个update，自身和自身形成环状链表
    update.next = update;
  } else {
    // 1、将当前插入的Update的next赋值为第一个Update
    update.next = pending.next;
    // 2、将当前最后一个Update的next赋值为插入的Update
    pending.next = update;
  }
  // shared.pending 会保证始终指向最后一个插入的update
  sharedQueue.pending = update;
}

export function processUpdateQueue(workInProgress) {
  const queue = workInProgress.updateQueue;

  let firstBaseUpdate = queue.firstBaseUpdate;
  let lastBaseUpdate = queue.lastBaseUpdate;

  // pending始终指向的是最后一个添加进来的Update
  let pendingQueue = queue.shared.pending;

  // 检测shared.pending是否存在进行中的update将他们转移到baseQueue
  if (pendingQueue !== null) {
    queue.shared.pending = null;
    const lastPendingUpdate = pendingQueue;
    // 获取第一个Update
    const firstPendingUpdate = lastPendingUpdate.next;
    // pendingQueye队列是循环的。断开第一个和最后一个之间的指针，使其是非循环的
    lastPendingUpdate.next = null;
    // 将shared.pending上的update接到baseUpdate链表上
    if (lastBaseUpdate === null) {
      firstBaseUpdate = firstPendingUpdate;
    } else {
      firstBaseUpdate = lastBaseUpdate.next;
    }
    lastBaseUpdate = lastPendingUpdate;
    const current = workInProgress.alternate;

    // 如果current也存在，需要将current也进行同样的处理，同fiber双缓存相似

    // Fiber节点最多同时存在两个updateQueue：
    // current fiber保存的updateQueue即current updateQueue
    // workInProgress fiber保存的updateQueue即workInProgress updateQueue
    // 在commit阶段完成页面渲染后，workInProgress Fiber树变为current Fiber树，workInProgress Fiber树内Fiber节点的updateQueue就变成current updateQueue。
    if (current !== null) {
      const currentQueue = current.updateQueue;
      const currentLastBaseUpdate = currentQueue.lastBaseUpdate;

      // 如果current的updateQueue和workInProgress的updateQueue不同，则对current也进行同样的处理，用于结构共享
      if (currentLastBaseUpdate !== lastBaseUpdate) {
        if (currentLastBaseUpdate === null) {
          currentQueue.firstBaseUpdate = firstPendingUpdate;
        } else {
          currentLastBaseUpdate.next = firstPendingUpdate;
        }
        currentQueue.lastBaseUpdate = lastPendingUpdate;
      }
    }
  }

  if (firstBaseUpdate !== null) {
    let newState = queue.baseState;

    let newLastBaseUpdate = null;
    let newFirstBaseUpdate = null;
    let newBaseState = null;

    const update = firstBaseUpdate;
    newState = getStateFromUpdate(workInProgress, queue, update, newState);
    // TODO 多个update的情况 循环处理
    if (newLastBaseUpdate === null) {
      newBaseState = newState;
    }
    queue.baseState = newBaseState;
    queue.firstBaseUpdate = newFirstBaseUpdate;
    queue.lastBaseUpdate = newLastBaseUpdate;
    workInProgress.memoizedState = newState;
  }
}

function getStateFromUpdate(workInProgress, queue, update, prevState) {
  switch (update.tag) {
    case UpdateState:
      const payload = update.payload;
      let partialState = payload;
      if (partialState == null) {
        // 不需要更新
        return prevState;
      }
      return assign({}, prevState, payload);
  }
}
