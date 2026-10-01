/**
 * Dependency graph for bulk create parent-child task relationships.
 * Pure utility: no DB or Jira calls.
 */

export type DependencyNode = {
  clientRef: string;
  parentClientRef?: string | null;
};

export type DependencyGraph = {
  /** All clientRefs classified as root (no batch parent). */
  roots: string[];
  /** clientRef -> array of child clientRefs. */
  children: Map<string, string[]>;
  /** clientRef -> parent clientRef (for batch parents only). */
  parentOf: Map<string, string>;
  /** Depth from root: 0 for roots, 1 for their children, etc. */
  depth: Map<string, number>;
  /** Execution order: topological sort. Parents before children. */
  executionOrder: string[];
  /** true if a cycle was detected. */
  hasCycle: boolean;
  /** Nodes involved in a cycle (if any). */
  cycleNodes: Set<string>;
};

export function buildDependencyGraph(items: DependencyNode[]): DependencyGraph {
  const clientRefs = new Set(items.map((i) => i.clientRef));
  const children = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  const roots: string[] = [];

  for (const item of items) {
    if (item.parentClientRef && clientRefs.has(item.parentClientRef)) {
      // Dependent: parent is in this batch
      const parent = item.parentClientRef;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(item.clientRef);
      parentOf.set(item.clientRef, parent);
    } else {
      // Root: no batch parent (either no parent at all, or parent is Jira key)
      roots.push(item.clientRef);
    }
  }

  // Cycle detection via iterative DFS
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const cycleNodes = new Set<string>();
  for (const ref of clientRefs) color.set(ref, WHITE);

  const detectCycle = (): boolean => {
    for (const ref of clientRefs) {
      if (color.get(ref) !== WHITE) continue;
      const stack: Array<{ node: string; idx: number }> = [];
      const visited: string[] = [];

      color.set(ref, GRAY);
      stack.push({ node: ref, idx: 0 });

      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        const nodeChildren = children.get(top.node) ?? [];

        if (top.idx < nodeChildren.length) {
          const child = nodeChildren[top.idx];
          stack[stack.length - 1].idx++;

          const childColor = color.get(child);
          if (childColor === GRAY) {
            // Found cycle
            const cycleStart = visited.indexOf(child);
            const cycle = [...visited.slice(cycleStart), top.node];
            for (const n of cycle) cycleNodes.add(n);
            return true;
          }
          if (childColor === WHITE) {
            color.set(child, GRAY);
            visited.push(child);
            stack.push({ node: child, idx: 0 });
          }
        } else {
          color.set(top.node, BLACK);
          stack.pop();
          if (top.node !== ref) visited.pop();
        }
      }
    }
    return false;
  };

  const hasCycle = detectCycle();

  // Topological sort (Kahn's algorithm) for execution order
  const inDegree = new Map<string, number>();
  for (const ref of clientRefs) inDegree.set(ref, 0);
  for (const [, kids] of children) {
    for (const child of kids) {
      inDegree.set(child, (inDegree.get(child) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const ref of clientRefs) {
    if ((inDegree.get(ref) ?? 0) === 0) queue.push(ref);
  }

  const executionOrder: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    executionOrder.push(node);
    const kids = children.get(node) ?? [];
    for (const kid of kids) {
      const deg = (inDegree.get(kid) ?? 0) - 1;
      inDegree.set(kid, deg);
      if (deg === 0) queue.push(kid);
    }
  }

  // If hasCycle, some nodes won't be in executionOrder
  if (hasCycle) {
    for (const ref of clientRefs) {
      if (!executionOrder.includes(ref)) executionOrder.push(ref);
    }
  }

  // Compute depth
  const depth = new Map<string, number>();
  const computeDepth = (ref: string, visited: Set<string>): number => {
    if (depth.has(ref)) return depth.get(ref)!;
    if (visited.has(ref)) return 0;
    visited.add(ref);

    const parent = parentOf.get(ref);
    if (parent && clientRefs.has(parent)) {
      const d = computeDepth(parent, visited) + 1;
      depth.set(ref, d);
      return d;
    }
    depth.set(ref, 0);
    return 0;
  };

  for (const ref of clientRefs) {
    computeDepth(ref, new Set());
  }

  return {
    roots,
    children,
    parentOf,
    depth,
    executionOrder,
    hasCycle,
    cycleNodes,
  };
}

/**
 * Get children of a given node in the graph.
 */
export function getChildren(graph: DependencyGraph, clientRef: string): string[] {
  return graph.children.get(clientRef) ?? [];
}

/**
 * Get all descendants (transitive children) of a given node.
 */
export function getAllDescendants(graph: DependencyGraph, clientRef: string): Set<string> {
  const result = new Set<string>();
  const queue = [clientRef];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const child of graph.children.get(node) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return result;
}

/**
 * Determine initial status for each item based on dependency classification.
 * - root items → "pending" (ready to execute)
 * - dependent items → "waiting_for_parent"
 */
export function classifyInitialStatus(graph: DependencyGraph): Map<string, "pending" | "waiting_for_parent"> {
  const status = new Map<string, "pending" | "waiting_for_parent">();
  for (const [ref] of graph.depth) {
    status.set(ref, (graph.depth.get(ref) ?? 0) === 0 ? "pending" : "waiting_for_parent");
  }
  return status;
}
