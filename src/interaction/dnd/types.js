export const DND_PAYLOAD_SCHEMA_VERSION = 1;

/**
 * Drag payload shape (runtime contract)
 * {
 *   dragType: 'card' | 'damage-counter' | 'status-badge',
 *   sourceZone?: string,
 *   cardId?: string,
 *   toolValue?: string
 * }
 */

/**
 * Drop payload shape (runtime contract)
 * {
 *   dropType: 'zone' | 'stack',
 *   zoneId: string,
 *   targetPlayerId: 'player1' | 'player2',
 *   zoneKind?: 'active' | 'bench' | 'discard' | 'lost',
 *   stackKind?: 'active' | 'bench',
 *   benchIndex?: number
 * }
 */
