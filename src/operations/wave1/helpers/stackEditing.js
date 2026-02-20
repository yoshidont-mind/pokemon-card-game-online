import {
  STACK_KIND,
  addCardIdsToStack,
  createPublicCardRef,
  ensureStack,
  getStack,
  setStack,
} from './zoneAccessors';

function cloneConditions(source = {}) {
  return {
    poisoned: Boolean(source.poisoned),
    burned: Boolean(source.burned),
    asleep: Boolean(source.asleep),
    paralyzed: Boolean(source.paralyzed),
    confused: Boolean(source.confused),
  };
}

export function moveCardsBetweenStacks({
  sourceBoard,
  sourceStackKind,
  sourceBenchIndex = null,
  targetBoard,
  targetPlayerId = 'player1',
  targetStackKind,
  targetBenchIndex = null,
  cardIds = [],
}) {
  const sourceStack = getStack(sourceBoard, sourceStackKind, sourceBenchIndex);
  const targetStack = ensureStack(targetBoard, targetStackKind, {
    playerId: targetPlayerId,
    benchIndex: targetBenchIndex,
  });

  if (!sourceStack || !Array.isArray(sourceStack.cardIds) || !sourceStack.cardIds.length) {
    return [];
  }

  const movingSet = new Set(cardIds.length ? cardIds : [sourceStack.cardIds[sourceStack.cardIds.length - 1]]);
  const remaining = [];
  const moved = [];

  for (const cardId of sourceStack.cardIds) {
    if (movingSet.has(cardId)) {
      moved.push(cardId);
    } else {
      remaining.push(cardId);
    }
  }

  sourceStack.cardIds = remaining;
  addCardIdsToStack(targetStack, moved);
  return moved;
}

export function applyDamageToStack(stack, value) {
  if (!stack) {
    return;
  }
  const current = Number(stack.damage || 0);
  stack.damage = Math.max(0, current + Number(value || 0));
}

export function healDamageFromStack(stack, value) {
  if (!stack) {
    return;
  }
  const current = Number(stack.damage || 0);
  stack.damage = Math.max(0, current - Number(value || 0));
}

export function moveDamageBetweenStacks(sourceStack, targetStack, value) {
  if (!sourceStack || !targetStack) {
    return 0;
  }
  const sourceDamage = Number(sourceStack.damage || 0);
  const moving = Math.min(sourceDamage, Math.max(0, Number(value || 0)));
  sourceStack.damage = sourceDamage - moving;
  targetStack.damage = Number(targetStack.damage || 0) + moving;
  return moving;
}

export function setStatusCondition(stack, conditionKey, nextValue = true) {
  if (!stack) {
    return;
  }
  stack.specialConditions = cloneConditions(stack.specialConditions);
  if (conditionKey in stack.specialConditions) {
    stack.specialConditions[conditionKey] = Boolean(nextValue);
  }
}

export function clearAllStatusConditions(stack) {
  if (!stack) {
    return;
  }
  stack.specialConditions = {
    poisoned: false,
    burned: false,
    asleep: false,
    paralyzed: false,
    confused: false,
  };
}

export function knockoutStackToDiscard(board, stackKind, benchIndex = null) {
  const stack = getStack(board, stackKind, benchIndex);
  if (!stack || !Array.isArray(stack.cardIds) || !stack.cardIds.length) {
    return [];
  }

  const movedRefs = stack.cardIds.map((cardId) => createPublicCardRef(cardId));
  const discard = Array.isArray(board.discard) ? board.discard : [];
  board.discard = [...discard, ...movedRefs];

  if (stackKind === STACK_KIND.ACTIVE) {
    setStack(board, STACK_KIND.ACTIVE, null);
  } else {
    setStack(board, STACK_KIND.BENCH, null, benchIndex);
  }

  return movedRefs;
}
