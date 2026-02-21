export const BENCH_SLOT_COUNT = 5;

export const DRAG_TYPES = Object.freeze({
  CARD: 'card',
  STACK: 'stack',
  PILE_CARD: 'pile-card',
  DAMAGE_COUNTER: 'damage-counter',
  STATUS_BADGE: 'status-badge',
});

export const DROP_TYPES = Object.freeze({
  ZONE: 'zone',
  STACK: 'stack',
});

export const ZONE_KINDS = Object.freeze({
  DECK: 'deck',
  HAND: 'hand',
  ACTIVE: 'active',
  BENCH: 'bench',
  REVEAL: 'reveal',
  DISCARD: 'discard',
  LOST: 'lost',
  PRIZE: 'prize',
  STADIUM: 'stadium',
  TOOLBOX: 'toolbox',
});

export const STACK_KINDS = Object.freeze({
  ACTIVE: 'active',
  BENCH: 'bench',
});

export const INTENT_ACTIONS = Object.freeze({
  MOVE_CARD_FROM_HAND_TO_ZONE: 'move-card-from-hand-to-zone',
  MOVE_STACK_FROM_STACK_TO_ZONE: 'move-stack-from-stack-to-zone',
  MOVE_CARD_TO_DECK_EDGE: 'move-card-to-deck-edge',
  MOVE_CARD_TO_STACK_EDGE: 'move-card-to-stack-edge',
  SWAP_STACKS: 'swap-stacks-between-zones',
  MOVE_TOP_CARD_FROM_SOURCE_TO_HAND: 'move-top-card-from-source-to-hand',
  APPLY_TOOL_TO_STACK: 'apply-tool-to-stack',
  REMOVE_STATUS_FROM_STACK: 'remove-status-from-stack',
});

export const REJECT_REASONS = Object.freeze({
  INVALID_PAYLOAD: 'invalid-payload',
  UNSUPPORTED_DRAG_TYPE: 'unsupported-drag-type',
  UNSUPPORTED_SOURCE: 'unsupported-source',
  UNSUPPORTED_TARGET: 'unsupported-target',
  TARGET_OCCUPIED: 'target-occupied',
  TARGET_NOT_FOUND: 'target-not-found',
  PERMISSION_DENIED: 'permission-denied',
});
