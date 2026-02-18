// src/components/Home.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import db from '../firebase';
import { createEmptyPrivateStateV2, createEmptySessionV2 } from '../game-state/builders';

const Home = () => {
    const navigate = useNavigate();

    const createSession = async () => {
        const now = new Date().toISOString();
        const newSession = createEmptySessionV2({
            createdBy: 'player1',
            now,
        });

        const docRef = await addDoc(collection(db, 'sessions'), newSession);
        await setDoc(
            doc(db, 'sessions', docRef.id, 'privateState', 'player1'),
            createEmptyPrivateStateV2({
                ownerPlayerId: 'player1',
                updatedBy: 'player1',
                now,
            })
        );
        await setDoc(
            doc(db, 'sessions', docRef.id, 'privateState', 'player2'),
            createEmptyPrivateStateV2({
                ownerPlayerId: 'player2',
                updatedBy: 'player1',
                now,
            })
        );
        navigate(`/session?id=${docRef.id}&playerId=1`);
    };

    return (
        <div className="container mt-5">
            <button className="btn btn-primary me-3" onClick={createSession}>セッションを作成</button>
            <button className="btn btn-secondary" onClick={() => navigate('/join')}>セッションに参加</button>
        </div>
    );
};

export default Home;
