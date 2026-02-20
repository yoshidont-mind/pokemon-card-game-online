import { INTERNAL_OPERATION_IDS, OPERATION_IDS, WAVE1_OPERATION_IDS } from './operationIds';

const CATALOG = Object.freeze({
  [OPERATION_IDS.OP_A01]: { group: 'A', label: 'コイン判定', mode: 'direct' },
  [OPERATION_IDS.OP_A02]: { group: 'A', label: '対象選択', mode: 'direct' },
  [OPERATION_IDS.OP_A03]: {
    group: 'A',
    label: '相手手札公開（相手承認）',
    mode: 'request',
    requestType: 'opponent-reveal-hand',
  },
  [OPERATION_IDS.OP_A04]: { group: 'A', label: '閲覧', mode: 'direct' },
  [OPERATION_IDS.OP_A05]: { group: 'A', label: 'ランダム選択', mode: 'direct' },
  [OPERATION_IDS.OP_A06]: { group: 'A', label: '順序選択', mode: 'direct' },

  [OPERATION_IDS.OP_B01]: { group: 'B', label: '山札シャッフル', mode: 'direct' },
  [OPERATION_IDS.OP_B02]: { group: 'B', label: '山札サーチ', mode: 'direct' },
  [OPERATION_IDS.OP_B03]: { group: 'B', label: 'ドロー', mode: 'direct' },
  [OPERATION_IDS.OP_B04]: { group: 'B', label: '山札上破棄', mode: 'direct' },
  [OPERATION_IDS.OP_B05]: { group: 'B', label: '山札上/下に置く', mode: 'direct' },
  [OPERATION_IDS.OP_B07]: { group: 'B', label: '山札上並べ替え', mode: 'direct' },
  [OPERATION_IDS.OP_B09]: { group: 'B', label: '手札トラッシュ', mode: 'direct' },
  [OPERATION_IDS.OP_B10]: { group: 'B', label: '手札山札戻し', mode: 'direct' },
  [OPERATION_IDS.OP_B11]: {
    group: 'B',
    label: '相手手札破壊（相手承認）',
    mode: 'request',
    requestType: 'opponent-discard-random-hand',
  },
  [OPERATION_IDS.OP_B12]: {
    group: 'B',
    label: '相手手札指定破壊（相手承認）',
    mode: 'request',
    requestType: 'opponent-discard-selected-hand',
  },

  [OPERATION_IDS.OP_C02]: { group: 'C', label: '入れ替え', mode: 'direct' },
  [OPERATION_IDS.OP_C03]: { group: 'C', label: 'ベンチ展開', mode: 'direct' },
  [OPERATION_IDS.OP_C04]: { group: 'C', label: '相手呼び出し', mode: 'direct' },
  [OPERATION_IDS.OP_C05]: { group: 'C', label: 'バトル場配置', mode: 'direct' },

  [OPERATION_IDS.OP_D01]: { group: 'D', label: 'サイド操作', mode: 'direct' },
  [OPERATION_IDS.OP_D02]: { group: 'D', label: 'トラッシュ移動', mode: 'direct' },
  [OPERATION_IDS.OP_D03]: { group: 'D', label: '進化/退化', mode: 'direct' },
  [OPERATION_IDS.OP_D04]: { group: 'D', label: 'トラッシュ回収', mode: 'direct' },
  [OPERATION_IDS.OP_D05]: { group: 'D', label: '山札戻し', mode: 'direct' },
  [OPERATION_IDS.OP_D06]: { group: 'D', label: 'ロスト送り', mode: 'direct' },
  [OPERATION_IDS.OP_D07]: { group: 'D', label: '手札戻し', mode: 'direct' },
  [OPERATION_IDS.OP_D08]: { group: 'D', label: '自己離脱', mode: 'direct' },

  [OPERATION_IDS.OP_E01]: { group: 'E', label: 'エネルギー破棄', mode: 'direct' },
  [OPERATION_IDS.OP_E02]: { group: 'E', label: 'エネルギー付与', mode: 'direct' },
  [OPERATION_IDS.OP_E04]: { group: 'E', label: 'どうぐ/スタジアム破棄', mode: 'direct' },
  [OPERATION_IDS.OP_E05]: { group: 'E', label: 'エネルギー移動', mode: 'direct' },
  [OPERATION_IDS.OP_E06]: { group: 'E', label: 'どうぐ装備', mode: 'direct' },
  [OPERATION_IDS.OP_E07]: { group: 'E', label: 'スタジアム設置/置換', mode: 'direct' },

  [OPERATION_IDS.OP_F01]: { group: 'F', label: 'ダメージ適用', mode: 'direct' },
  [OPERATION_IDS.OP_F02]: { group: 'F', label: '特殊状態付与', mode: 'direct' },
  [OPERATION_IDS.OP_F03]: { group: 'F', label: 'きぜつ処理', mode: 'direct' },
  [OPERATION_IDS.OP_F04]: { group: 'F', label: 'ダメカン配置', mode: 'direct' },
  [OPERATION_IDS.OP_F05]: { group: 'F', label: '回復', mode: 'direct' },
  [OPERATION_IDS.OP_F06]: { group: 'F', label: '反動', mode: 'direct' },
  [OPERATION_IDS.OP_F07]: { group: 'F', label: '特殊状態解除/耐性', mode: 'direct' },
  [OPERATION_IDS.OP_F08]: { group: 'F', label: 'ダメカン移動', mode: 'direct' },

  [OPERATION_IDS.OP_G02]: { group: 'G', label: 'サポート/グッズ基本制約', mode: 'direct' },
  [OPERATION_IDS.OP_G03]: { group: 'G', label: 'ワザロック', mode: 'direct' },
  [OPERATION_IDS.OP_G04]: { group: 'G', label: '使用禁止一般', mode: 'direct' },

  [OPERATION_IDS.OP_I01]: { group: 'I', label: '回数制限', mode: 'direct' },
  [OPERATION_IDS.OP_I03]: { group: 'I', label: 'ターン終了/延長', mode: 'direct' },

  [INTERNAL_OPERATION_IDS.REQUEST_APPROVE]: {
    group: 'INTERNAL',
    label: '操作リクエスト承認',
    mode: 'request-resolution',
  },
  [INTERNAL_OPERATION_IDS.REQUEST_REJECT]: {
    group: 'INTERNAL',
    label: '操作リクエスト拒否',
    mode: 'request-resolution',
  },
});

export function getOperationMeta(opId) {
  return CATALOG[opId] || null;
}

export function listWave1OperationCatalog() {
  return WAVE1_OPERATION_IDS.map((opId) => ({ opId, ...CATALOG[opId] }));
}

export function listWave1OperationsByGroup() {
  const grouped = {
    A: [],
    B: [],
    C: [],
    D: [],
    E: [],
    F: [],
    G: [],
    I: [],
  };

  for (const opId of WAVE1_OPERATION_IDS) {
    const meta = CATALOG[opId];
    if (!meta || !grouped[meta.group]) {
      continue;
    }
    grouped[meta.group].push({ opId, ...meta });
  }

  return grouped;
}
