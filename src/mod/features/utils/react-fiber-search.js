

function findFiberNode(element) {
  const fiberKey = Object.keys(element).find((key) => key.startsWith("__reactFiber$"));
  return fiberKey ? element[fiberKey] : null;
}

function getRootFiber(fiber) {
  let current = fiber;
  while (current?.return) {
    current = current.return;
  }
  return current || null;
}

function traverseFiber(fiber, isFoundCallback, depth = 0) {
  if (!fiber) return null;

  const result = isFoundCallback(fiber, depth);
  if (result !== null && result !== undefined) return result;

  const childResult = traverseFiber(fiber.child, isFoundCallback, depth + 1);
  if (childResult !== null && childResult !== undefined) return childResult;

  const siblingResult = traverseFiber(fiber.sibling, isFoundCallback, depth);
  if (siblingResult !== null && siblingResult !== undefined) return siblingResult;

  return null;
}

export function searchProperty(element, property) {
  if (!element) throw "Element is not defined.";

  const fiberNode = findFiberNode(element);

  if (fiberNode) {
    const rootFiber = getRootFiber(fiberNode);

    const result = traverseFiber(rootFiber, (fiber, depth) => {
      if (fiber.memoizedProps && fiber.memoizedProps.hasOwnProperty(property)) {
        return fiber.memoizedProps;
      }
      return null;
    });

    return result;
  } else {
    throw "Fiber node not found for the given element.";
  }
}
