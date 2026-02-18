// src/components/Home.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import db from '../firebase';
import { createEmptyPrivateStateV2, createEmptySessionV2 } from '../game-state/builders';
import { ensureSignedIn } from '../auth/authClient';

const Home = () => {
    const navigate = useNavigate();
    const [isAuthReady, setIsAuthReady] = useState(false);

    useEffect(() => {
        let isMounted = true;
        ensureSignedIn()
            .then(() => {
                if (isMounted) {
                    setIsAuthReady(true);
                }
            })
            .catch((error) => {
                console.error('Failed to initialize auth in Home:', error);
                if (isMounted) {
                    setIsAuthReady(false);
                }
            });
        return () => {
            isMounted = false;
        };
    }, []);

    const createSession = async () => {
        if (!isAuthReady) {
            alert('認証の初期化中です。数秒待ってから再試行してください。');
            return;
        }

        const user = await ensureSignedIn();
        const actorUid = user?.uid;
        if (!actorUid) {
            alert('認証に失敗しました。ページを再読み込みしてください。');
            return;
        }

        const now = new Date().toISOString();
        const newSession = createEmptySessionV2({
            createdBy: actorUid,
            now,
        });
        newSession.participants.player1 = {
            ...newSession.participants.player1,
            uid: actorUid,
            joinedAt: now,
            lastSeenAt: now,
            connectionState: 'online',
        };
        newSession.updatedBy = actorUid;

        const docRef = await addDoc(collection(db, 'sessions'), newSession);
        await setDoc(
            doc(db, 'sessions', docRef.id, 'privateState', 'player1'),
            createEmptyPrivateStateV2({
                ownerPlayerId: 'player1',
                updatedBy: actorUid,
                now,
            })
        );
        navigate(`/session?id=${docRef.id}&playerId=1`);
    };

    return (
        <div className="container mt-5">
            <button className="btn btn-primary me-3" onClick={createSession} disabled={!isAuthReady}>
                セッションを作成
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/join')}>セッションに参加</button>
            {!isAuthReady && <div className="mt-3 text-muted">認証を初期化中...</div>}
        </div>
    );
};

export default Home;
