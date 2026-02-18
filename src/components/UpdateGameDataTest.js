import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import db from '../firebase';
import { isV2SessionDoc } from '../game-state/schemaV2';

const UpdateGameData = () => {
    const [sessionId, setSessionId] = useState('');
    const [fileName, setFileName] = useState('');

    const handleUpdate = async () => {
        if (!sessionId || !fileName) {
            alert('セッションIDとファイル名を入力してください');
            return;
        }

        try {
            const response = await fetch(`/${fileName}.json`);
            if (!response.ok) {
                throw new Error('ファイルの取得に失敗しました');
            }

            const gameData = await response.json();

            const sessionRef = doc(db, 'sessions', sessionId);
            const sessionDoc = gameData.sessionDoc || gameData.session || gameData;
            await setDoc(sessionRef, sessionDoc);

            const privateStateByPlayer =
                gameData.privateState || gameData.privateStatesByPlayer || {};

            await Promise.all(
                Object.entries(privateStateByPlayer).map(([playerId, privateStateDoc]) =>
                    setDoc(doc(db, 'sessions', sessionId, 'privateState', playerId), privateStateDoc)
                )
            );

            alert(
                isV2SessionDoc(sessionDoc)
                    ? 'V2ゲームデータが更新されました'
                    : 'ゲームデータが更新されました'
            );
        } catch (error) {
            console.error('Error updating game data:', error);
            alert('ゲームデータの更新に失敗しました');
        }
    };

    return (
        <div className="container mt-5">
            <h3>ゲームデータを更新</h3>
            <div className="mb-3">
                <label htmlFor="sessionId" className="form-label">セッションID</label>
                <input
                    type="text"
                    id="sessionId"
                    name="sessionId"
                    className="form-control"
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                />
            </div>
            <div className="mb-3">
                <label htmlFor="fileName" className="form-label">ファイル名</label>
                <input
                    type="text"
                    id="fileName"
                    name="fileName"
                    className="form-control"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                />
            </div>
            <button className="btn btn-primary" onClick={handleUpdate}>アップデート</button>
        </div>
    );
};

export default UpdateGameData;
