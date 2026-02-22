// src/components/Join.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ensureSignedIn } from '../auth/authClient';
import { ERROR_CODES, isGameStateError } from '../game-state/errors';
import { claimPlayerSlot } from '../game-state/sessionParticipation';
import PreplayShell from './layout/PreplayShell';
import styles from '../css/preplayScreens.module.css';

const Join = () => {
    const [sessionId, setSessionId] = useState('');
    const [isAuthReady, setIsAuthReady] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        let isMounted = true;
        ensureSignedIn()
            .then(() => {
                if (isMounted) {
                    setIsAuthReady(true);
                }
            })
            .catch((error) => {
                console.error('Failed to initialize auth in Join:', error);
                if (isMounted) {
                    setIsAuthReady(false);
                }
            });
        return () => {
            isMounted = false;
        };
    }, []);

    const joinSession = async () => {
        if (!isAuthReady) {
            alert('認証の初期化中です。数秒待ってから再試行してください。');
            return;
        }

        const user = await ensureSignedIn();
        if (!user?.uid) {
            alert('認証に失敗しました。ページを再読み込みしてください。');
            return;
        }

        const normalizedSessionId = sessionId.trim();
        if (normalizedSessionId) {
            try {
                await claimPlayerSlot({
                    sessionId: normalizedSessionId,
                    playerId: 'player2',
                    uid: user.uid,
                });
            } catch (error) {
                console.error('Failed to claim player2 slot:', error);
                if (isGameStateError(error, ERROR_CODES.NOT_FOUND)) {
                    alert('指定したセッションが見つかりません。IDを確認してください。');
                    return;
                }
                if (isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)) {
                    alert('このセッションの player2 は既に別のユーザーが使用中です。');
                    return;
                }
                alert('セッション参加に失敗しました。しばらくして再試行してください。');
                return;
            }
            navigate(`/session?id=${normalizedSessionId}&playerId=2`);
        } else {
            alert('セッションIDを入力してください。');
        }
    };

    return (
        <PreplayShell>
            <section className={styles.header}>
                <p className={styles.eyebrow}>Pokémon Trading Card Game Online Simulator</p>
                <h1 className={styles.title}>セッションに参加</h1>
                <p className={styles.subtitle}>受け取ったセッションIDを入力してプレイ画面へ進みます。</p>
            </section>

            <section className={styles.fieldGroup}>
                <label htmlFor="join-session-id" className={styles.label}>
                    セッションID
                </label>
                <div className={styles.inputRow}>
                    <input
                        id="join-session-id"
                        type="text"
                        className={styles.textInput}
                        value={sessionId}
                        onChange={(event) => setSessionId(event.target.value)}
                        placeholder="セッションIDを入力"
                    />
                    <button
                        type="button"
                        className={styles.buttonPrimary}
                        onClick={joinSession}
                        disabled={!isAuthReady}
                    >
                        参加
                    </button>
                </div>
            </section>

            {!isAuthReady ? <p className={styles.statusMessage}>認証を初期化中...</p> : null}
        </PreplayShell>
    );
};

export default Join;
