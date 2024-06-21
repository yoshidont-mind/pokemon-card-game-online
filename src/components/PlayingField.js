import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import db from '../firebase';
import Pokemon from './Pokemon';
import styles from '../css/playingField.module.css';

const PlayingField = ({ sessionId, playerId }) => {
    const [gameData, setGameData] = useState(null);

    useEffect(() => {
        const sessionDoc = doc(db, 'sessions', sessionId);
        const unsubscribe = onSnapshot(sessionDoc, (doc) => {
            if (doc.exists()) {
                setGameData(doc.data());
            }
        });

        return () => unsubscribe();
    }, [sessionId]);

    const opponentId = playerId === '1' ? '2' : '1';
    const opponentData = gameData ? gameData[`player${opponentId}`] : {};
    const playerData = gameData ? gameData[`player${playerId}`] : {};

    if (!gameData) {
        return <div>Loading...</div>;
    }

    return (
        <div className={`game-board container mt-5 ${styles.playingField}`}>
            <div className="row mb-4">
                <div className="col-12 text-center">
                    <div className={`${styles.message}`}>{gameData.message}</div>
                </div>
            </div>
            <div className="row mb-4">
                <div className="col-2 text-center">
                    <div className={`opponent ${styles.deck}`}>山札（相手）</div>
                </div>
                <div className="col-2 text-center">
                    <div className={`opponent ${styles.trash}`}>トラッシュ（相手）</div>
                </div>
                <div className="col-2 text-center">
                    <div className={`opponent ${styles.stadium}`}>スタジアム（相手）</div>
                </div>
                <div className="col-6 text-center">
                    <div className={`opponent ${styles.bench}`}>
                        {opponentData.bench?.map((pokemon, index) => (
                            <Pokemon key={index} {...pokemon} />
                        ))}
                    </div>
                </div>
            </div>
            <div className="row mb-4">
                <div className="col-2 text-center">
                    <div className={`opponent ${styles.side}`}>サイド（相手）</div>
                </div>
                <div className="col-4 text-center">
                    {opponentData.activeSpot && <Pokemon className="active-spot opponent" {...opponentData.activeSpot} />}
                </div>
                <div className="col-4 text-center">
                    {playerData.activeSpot && <Pokemon className="active-spot self" {...playerData.activeSpot} />}
                </div>
                <div className="col-2 text-center">
                    <div className={`self ${styles.side}`}>サイド</div>
                </div>
            </div>
            <div className="row mb-4">
                <div className="col-2 text-center">
                    <div className={`self ${styles.deck}`}>山札</div>
                </div>
                <div className="col-2 text-center">
                    <div className={`self ${styles.trash}`}>トラッシュ</div>
                </div>
                <div className="col-2 text-center">
                    <div className={`self ${styles.stadium}`}>スタジアム</div>
                </div>
                <div className="col-6 text-center">
                    <div className={`self ${styles.bench}`}>
                        {playerData.bench?.map((pokemon, index) => (
                            <Pokemon key={index} {...pokemon} />
                        ))}
                    </div>
                </div>
            </div>
            <div className="row mb-4">
                <div className="col-12 text-center">
                    <div className={`self ${styles.hand}`}>手札</div>
                </div>
            </div>
            <div className="row mb-4">
                <div className="col-12 text-center">
                    <div className="action-buttons">
                        <button className="btn btn-primary m-1">見せる</button>
                        <button className="btn btn-primary m-1">ベンチに出す</button>
                        <button className="btn btn-primary m-1">バトル場に出す</button>
                        <button className="btn btn-primary m-1">山札に戻す</button>
                        <button className="btn btn-primary m-1">トラッシュ</button>
                        <button className="btn btn-primary m-1">スタジアムに出す</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlayingField;
